#include "nsolid_heap_snapshot.h"
#include "asserts-cpp/asserts.h"
#include "nsolid_api.h"
#include "nsolid_output_stream.h"

namespace node {
namespace nsolid {

NSolidHeapSnapshot::NSolidHeapSnapshot() {
  ASSERT_EQ(0, in_progress_heap_snapshots_.init(true));
  ASSERT_EQ(0, in_progress_heap_sampling_.init(true));
}

int NSolidHeapSnapshot::StartSamplingProfiler(
    SharedEnvInst envinst,
    uint64_t sample_interval,
    int stack_depth,
    v8::HeapProfiler::SamplingFlags samplingFlag,
    uint64_t duration,
    internal::user_data data,
    Snapshot::snapshot_proxy_sig proxy) {
  // Using a sampleInterval of 0 causes a v8 crash.
  if (sample_interval == 0) {
    return UV_EINVAL;
  }

  uint64_t thread_id = envinst->thread_id();
  uint64_t snaphot_id =
    in_progress_timers_.fetch_add(1, std::memory_order_relaxed);

  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_sampling_);
  auto it = threads_running_heap_sampling_.emplace(
      thread_id,
      HeapSamplerStor{sample_interval,
                      stack_depth,
                      samplingFlag,
                      duration,
                      kFlagIsSamplingHeap,
                      snaphot_id,
                      proxy,
                      std::move(data)});

  if (it.second == false) {
    return UV_EEXIST;
  }

  int status = RunCommand(envinst,
                          CommandType::Interrupt,
                          start_sampling_profiler,
                          duration,
                          snaphot_id,
                          this);

  if (status != 0) {
    threads_running_heap_sampling_.erase(it.first);
  }

  return status;
}

int NSolidHeapSnapshot::StopSamplingProfiler(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_sampling_);
  auto it = threads_running_heap_sampling_.find(thread_id);
  // Make sure there is a snapshot running
  if (it == threads_running_heap_sampling_.end() ||
      !(it->second.flags & kFlagIsSamplingHeap)) {
    return UV_ENOENT;
  }

  HeapSamplerStor& stor = it->second;
  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      stop_sampling_profiler,
                      stor.snapshot_id,
                      this);
  return er;
}

namespace {
nlohmann::ordered_json build_sampling_heap_profile_node(
    v8::Isolate* isolate, const v8::AllocationProfile::Node* node) {
  nlohmann::ordered_json result;

  // Construct callFrame
  json callFrame = {
    {"functionName", *v8::String::Utf8Value(isolate, node->name)},
    {"scriptId", node->script_id},
    {"url", *v8::String::Utf8Value(isolate, node->script_name)},
    {"lineNumber", node->line_number - 1},
    {"columnNumber", node->column_number - 1}
  };

  // Calculate selfSize
  size_t selfSize = 0;
  for (const auto& allocation : node->allocations)
    selfSize += allocation.size * allocation.count;

  // Add properties to result
  result["callFrame"] = callFrame;
  result["selfSize"] = selfSize;
  result["id"] = node->node_id;

  // Add children if there are any
  if (node->children.empty()) {
    result["children"] = nlohmann::ordered_json::array();
    return result;
  }

  // Recursively build children
  nlohmann::ordered_json children;
  for (const auto* child : node->children)
    children.push_back(build_sampling_heap_profile_node(isolate, child));
  result["children"] = children;

  return result;
}

nlohmann::ordered_json build_v8_allocation_profile(
    v8::Isolate* isolate,
    v8::AllocationProfile* profile) {
  // We need to parse the profile and convert it to a JSON string with the next
  // schema, this does not support Serializing the profile to a string.
  // { head: SamplingHeapProfileNode, samples: [SamplingHeapProfileSample] }
  nlohmann::ordered_json json_profile;

  v8::AllocationProfile::Node* root = profile->GetRootNode();
  nlohmann::ordered_json head = build_sampling_heap_profile_node(isolate, root);
  json_profile["head"] = head;

  const std::vector<v8::AllocationProfile::Sample>& samples =
    profile->GetSamples();

  if (samples.empty()) {
    json_profile["samples"] = nlohmann::ordered_json::array();
    return json_profile;
  }

  for (const auto& sample : samples) {
    nlohmann::ordered_json sample_json;
    sample_json["size"] = sample.size * sample.count;
    sample_json["nodeId"] = sample.node_id;
    sample_json["ordinal"] = sample.sample_id;
    json_profile["samples"].push_back(sample_json);
  }

  return json_profile;
}
}  // namespace

int NSolidHeapSnapshot::StopSamplingProfilerSync(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_sampling_);
  auto it = threads_running_heap_sampling_.find(thread_id);
  // Make sure there is a snapshot running
  if (it == threads_running_heap_sampling_.end())
    return UV_ENOENT;

  HeapSamplerStor& stor = it->second;
  // If this condition is reached. This was called by EnvList::RemoveEnv.
  // It wants to stop any pending snapshot w/ tracking heap object.
  if (!(stor.flags & kFlagIsSamplingHeap) || stor.flags & kFlagIsDone) {
    // If no pending trackers, just do nothing
    // There are not pending snapshots with trackers
    return UV_ENOENT;
  }

  v8::Isolate* isolate = envinst->isolate();
  v8::HeapProfiler* profiler = isolate->GetHeapProfiler();
  ASSERT_NOT_NULL(profiler);

  v8::HandleScope scope(isolate);

  // Get the sampled heap profile
  v8::AllocationProfile* sampled = profiler->GetAllocationProfile();

  if (sampled == nullptr) {
    QueueCallback(sampling_cb,
                  thread_id,
                  // TODO(juan) - this is not a heap snapshot failure
                  heap_profiler::HEAP_SNAPSHOT_FAILURE,
                  std::string(),
                  this);
  } else {
    nlohmann::ordered_json profile_json =
      build_v8_allocation_profile(isolate, sampled);

    stor.cb(0, profile_json.dump(), stor.data.get());
    // Send the empty string to signal the end of the profile
    stor.cb(0, std::string(), stor.data.get());

    // V8 uses new, so we need to delete it
    // This will make ASAN happy
    delete sampled;
  }
  // Stop the profiler no matter what
  profiler->StopSamplingHeapProfiler();

  // Set the flag to done
  stor.flags |= kFlagIsDone;
  // Delete the snapshot from the map
  threads_running_heap_sampling_.erase(it);
  return 0;
}

NSolidHeapSnapshot::~NSolidHeapSnapshot() {
  {
    nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
    threads_running_snapshots_.clear();
  }
  {
    nsuv::ns_mutex::scoped_lock lock2(&in_progress_heap_sampling_);
    threads_running_heap_sampling_.clear();
  }
}

int NSolidHeapSnapshot::StartTrackingHeapObjects(
    SharedEnvInst envinst,
    bool redacted,
    bool trackAllocations,
    uint64_t duration,
    internal::user_data data,
    Snapshot::snapshot_proxy_sig proxy) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
  uint64_t profile_id =
    in_progress_timers_.fetch_add(1, std::memory_order_relaxed);
  // We can not trigger this command if there is already a snapshot in progress
  auto it = threads_running_snapshots_.emplace(
        thread_id,
        HeapSnapshotStor{ redacted,
                          kFlagIsTrackingHeapObjects,
                          profile_id,
                          proxy,
                          std::move(data) });
  if (it.second == false) {
    return UV_EEXIST;
  }

  int status = RunCommand(envinst,
                          CommandType::Interrupt,
                          start_tracking_heapobjects,
                          trackAllocations,
                          duration,
                          profile_id,
                          this);
  if (status != 0) {
    // Now we are tracking heap objects in this thread
    threads_running_snapshots_.erase(it.first);
  }
  return status;
}

int NSolidHeapSnapshot::GetHeapSnapshot(SharedEnvInst envinst,
                                        bool redacted,
                                        void* data,
                                        Snapshot::snapshot_proxy_sig proxy,
                                        internal::deleter_sig deleter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
  auto it = threads_running_snapshots_.find(thread_id);
  if (it != threads_running_snapshots_.end()) {
    return UV_EEXIST;
  }

  uint64_t profile_id =
    in_progress_timers_.fetch_add(1, std::memory_order_relaxed);

  int status = RunCommand(envinst,
                          CommandType::Interrupt,
                          take_snapshot,
                          this);

  if (status == 0) {
    threads_running_snapshots_.emplace(
        thread_id,
        HeapSnapshotStor{
            redacted,
            kFlagNone,
            profile_id,
            proxy,
            internal::user_data(data, deleter)});
  }

  return status;
}

int NSolidHeapSnapshot::StopTrackingHeapObjects(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
  auto it = threads_running_snapshots_.find(thread_id);
  // Make sure there is a snapshot running
  if (it == threads_running_snapshots_.end() ||
      !(it->second.flags & kFlagIsTrackingHeapObjects)) {
    return UV_ENOENT;
  }

  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      stop_tracking_heap_objects,
                      this);
  return er;
}

int NSolidHeapSnapshot::StopTrackingHeapObjectsSync(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
  auto it = threads_running_snapshots_.find(thread_id);
  // Make sure there is a snapshot running
  if (it == threads_running_snapshots_.end())
    return UV_ENOENT;

  HeapSnapshotStor& stor = it->second;
  // If this condition is reached. This was called by EnvList::RemoveEnv.
  // It wants to stop any pending snapshot w/ tracking heap object.
  if (!(stor.flags & kFlagIsTrackingHeapObjects) || stor.flags & kFlagIsDone) {
    // If no pending trackers, just do nothing
    // There are not peding snapshots with trackers
    return UV_ENOENT;
  }

  v8::Isolate* isolate = envinst->isolate();

  v8::HeapProfiler* profiler = isolate->GetHeapProfiler();
  ASSERT_NOT_NULL(profiler);

  v8::HandleScope scope(isolate);

  const v8::HeapSnapshot* snapshot = profiler->TakeHeapSnapshot();
  if (snapshot == nullptr) {
    stor.cb(heap_profiler::HEAP_SNAPSHOT_FAILURE,
            std::string(),
            stor.data.get());
  } else {
    std::string snapshot_str;
    DataOutputStream<uint64_t, v8::HeapSnapshot> stream(&snapshot_str,
                                                        snapshot,
                                                        &thread_id);

    if (stor.redacted) {
      const v8::RedactedHeapSnapshot snapshot_redact(snapshot);
      snapshot_redact.Serialize(&stream);
    } else {
      snapshot->Serialize(&stream);
    }

    profiler->StopTrackingHeapObjects();

    // At this point, the snapshot is fully serialized
    stor.cb(0, snapshot_str.c_str(), stor.data.get());
    // Tell ZMQ that the snapshot is done
    stor.cb(0, std::string(), stor.data.get());

    // Work around a deficiency in the API. The HeapSnapshot object is const
    // but we cannot call HeapProfiler::DeleteAllHeapSnapshots() because that
    // invalidates _all_ snapshots, including those created by other tools.
    const_cast<v8::HeapSnapshot*>(snapshot)->Delete();
  }
  // Delete the snapshot from the map
  threads_running_snapshots_.erase(it);
  return 0;
}

void NSolidHeapSnapshot::stop_tracking_heap_objects(
    SharedEnvInst envinst,
    NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  if (it == snapshotter->threads_running_snapshots_.end()) {
    // This might happen if snapshot_cb is called before RemoveEnv. Just return;
    return;
  }

  HeapSnapshotStor& stor = it->second;
  // If this condition is reached. This was called by EnvList::RemoveEnv.
  // It wants to stop any pending snapshot w/ tracking heap object.
  if (!(stor.flags & kFlagIsTrackingHeapObjects) || stor.flags & kFlagIsDone) {
    // If no pending trackers, just do nothing
    // There are not peding snapshots with trackers
    return;
  }

  v8::Isolate* isolate = envinst->isolate();

  v8::HeapProfiler* profiler = isolate->GetHeapProfiler();
  ASSERT_NOT_NULL(profiler);

  v8::HandleScope scope(isolate);

  const v8::HeapSnapshot* snapshot = profiler->TakeHeapSnapshot();
  if (snapshot == nullptr) {
    QueueCallback(snapshot_cb,
                  thread_id,
                  heap_profiler::HEAP_SNAPSHOT_FAILURE,
                  std::string(),
                  snapshotter);
  } else {
    DataOutputStream<uint64_t, v8::HeapSnapshot> stream(
      [&snapshotter](std::string snapshot_str, uint64_t* tid) {
      QueueCallback(snapshot_cb, *tid, 0, snapshot_str, snapshotter);
    }, snapshot, &thread_id);

    if (stor.redacted) {
      const v8::RedactedHeapSnapshot snapshot_redact(snapshot);
      snapshot_redact.Serialize(&stream);
    } else {
      snapshot->Serialize(&stream);
    }

    profiler->StopTrackingHeapObjects();

    // Work around a deficiency in the API. The HeapSnapshot object is const
    // but we cannot call HeapProfiler::DeleteAllHeapSnapshots() because that
    // invalidates _all_ snapshots, including those created by other tools.
    const_cast<v8::HeapSnapshot*>(snapshot)->Delete();
  }

  stor.flags |= kFlagIsDone;
}

void NSolidHeapSnapshot::start_tracking_heapobjects(
    SharedEnvInst envinst,
    bool trackAllocations,
    uint64_t duration,
    uint64_t profile_id,
    NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();

  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_snapshots_.end());

  HeapSnapshotStor& stor = it->second;
  ASSERT(stor.flags & kFlagIsTrackingHeapObjects);

  envinst->isolate()->GetHeapProfiler()->StartTrackingHeapObjects(
      trackAllocations);
  if (duration > 0) {
    // Schedule a timer to take the snapshot
    int er = QueueCallback(duration,
                           take_snapshot_timer,
                           envinst,
                           profile_id,
                           snapshotter);

    if (er) {
      // In case the the thread is already gone, the cpu profile will be stopped
      // on RemoveEnv, so do nothing here.
    }
  }
}

void NSolidHeapSnapshot::take_snapshot_timer(SharedEnvInst envinst,
                                             uint64_t profile_id,
                                             NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  // The snapshot was stopped before the timer was triggered
  if (it == snapshotter->threads_running_snapshots_.end())
    return;

  HeapSnapshotStor& stor = it->second;
  if (stor.snapshot_id != profile_id) {
    // The snapshot was stopped before the timer was triggered
    return;
  }

  ASSERT(stor.flags & kFlagIsTrackingHeapObjects);

  // Give control back to the V8 thread
  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      take_snapshot,
                      snapshotter);
  // NO BUENO???
  if (er) {
    // In case the the thread is already gone, the cpu profile will be stopped
    // on RemoveEnv, so do nothing here.
  }
}

void NSolidHeapSnapshot::take_snapshot(SharedEnvInst envinst,
                                       NSolidHeapSnapshot* snapshotter) {
  v8::Isolate* isolate = envinst->isolate();

  // TODO(@gio): for future worker implementation
  // https://github.com/nodejs/node/blob/725cf4764acb515be56b5e414b62f4cf92cf8ecd/src/node_worker.cc#L726
  v8::HeapProfiler* profiler = isolate->GetHeapProfiler();
  ASSERT_NOT_NULL(profiler);

  v8::HandleScope scope(isolate);

  const v8::HeapSnapshot* snapshot = profiler->TakeHeapSnapshot();

  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  if (it == snapshotter->threads_running_snapshots_.end()) {
    return;
  }

  HeapSnapshotStor& stor = it->second;
  if (snapshot == nullptr) {
    QueueCallback(snapshot_cb,
                  thread_id,
                  heap_profiler::HEAP_SNAPSHOT_FAILURE,
                  std::string(),
                  snapshotter);
  } else {
    DataOutputStream<uint64_t, v8::HeapSnapshot> stream(
      [&snapshotter](std::string snapshot_str, uint64_t* tid) {
      QueueCallback(snapshot_cb, *tid, 0, snapshot_str, snapshotter);
    }, snapshot, &thread_id);

    if (stor.redacted) {
      const v8::RedactedHeapSnapshot snapshot_redact(snapshot);
      snapshot_redact.Serialize(&stream);
    } else {
      snapshot->Serialize(&stream);
    }

    // A snapshot requested via `StopTrackingHeapObjects` or timer
    if (stor.flags & kFlagIsTrackingHeapObjects) {
      profiler->StopTrackingHeapObjects();
    }

    // Work around a deficiency in the API. The HeapSnapshot object is const
    // but we cannot call HeapProfiler::DeleteAllHeapSnapshots() because that
    // invalidates _all_ snapshots, including those created by other tools.
    const_cast<v8::HeapSnapshot*>(snapshot)->Delete();
  }

  stor.flags |= kFlagIsDone;
}

void NSolidHeapSnapshot::snapshot_cb(uint64_t thread_id,
                                     int status,
                                     const std::string& snapshot,
                                     NSolidHeapSnapshot* snapshotter) {
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_snapshots_.end());
  HeapSnapshotStor& stor = it->second;
  stor.cb(status, snapshot, stor.data.get());
  if (snapshot.empty()) {
    snapshotter->threads_running_snapshots_.erase(it);
  }
}

void NSolidHeapSnapshot::sampling_cb(uint64_t thread_id,
                                     int status,
                                     const std::string snapshot,
                                     NSolidHeapSnapshot* snapshotter) {
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_sampling_);
  auto it = snapshotter->threads_running_heap_sampling_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_heap_sampling_.end());
  HeapSamplerStor& stor = it->second;
  stor.cb(status, snapshot, stor.data.get());
  if (snapshot.empty()) {
    snapshotter->threads_running_heap_sampling_.erase(it);
  }
}

void NSolidHeapSnapshot::start_sampling_profiler(
    SharedEnvInst envinst,
    uint64_t duration,
    uint64_t snapshot_id,
    NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_sampling_);
  auto it = snapshotter->threads_running_heap_sampling_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_heap_sampling_.end());

  HeapSamplerStor& stor = it->second;
  ASSERT(stor.flags & kFlagIsSamplingHeap);

  v8::Isolate* isolate = envinst->isolate();
  v8::HeapProfiler* profiler = isolate->GetHeapProfiler();
  ASSERT_NOT_NULL(profiler);

  profiler->StartSamplingHeapProfiler(
      stor.sample_interval,
      stor.stack_depth,
      stor.sampling_flags);

  // Schedule a timer to take the snapshot
  int er = QueueCallback(duration,
                         stop_sampling_profiler,
                         envinst,
                         snapshot_id,
                         snapshotter);

  if (er) {
    // In case the the thread is already gone, the cpu profile will be stopped
    // on RemoveEnv, so do nothing here.
  }
}

void NSolidHeapSnapshot::stop_sampling_profiler(
    SharedEnvInst envinst,
    uint64_t snapshot_id,
    NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_sampling_);
  auto it = snapshotter->threads_running_heap_sampling_.find(thread_id);
  if (it == snapshotter->threads_running_heap_sampling_.end()) {
    // The profiler was stopped before the timer was triggered
    return;
  }

  HeapSamplerStor& stor = it->second;
  if (stor.snapshot_id != snapshot_id) {
    // The snapshot was stopped before the timer was triggered
    return;
  }

  ASSERT(stor.flags & kFlagIsSamplingHeap);

  // Give control back to the V8 thread
  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      take_sampled_snapshot,
                      snapshotter);
  if (er) {
    // In case the the thread is already gone, the heap sampling will be stopped
    // on RemoveEnv, so do nothing here.
  }
}

void NSolidHeapSnapshot::take_sampled_snapshot(
    SharedEnvInst envinst,
    NSolidHeapSnapshot* snapshotter) {
  v8::Isolate* isolate = envinst->isolate();
  v8::HeapProfiler* profiler = isolate->GetHeapProfiler();
  ASSERT_NOT_NULL(profiler);

  v8::HandleScope scope(isolate);

  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_sampling_);
  auto it = snapshotter->threads_running_heap_sampling_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_heap_sampling_.end());

  HeapSamplerStor& stor = it->second;
  // If this condition is reached. This was called by EnvList::RemoveEnv.
  // It wants to stop any pending snapshot w/ tracking heap object.
  if (!(stor.flags & kFlagIsSamplingHeap) || stor.flags & kFlagIsDone) {
    // If no pending trackers, just do nothing
    // There are not peding snapshots with trackers
    return;
  }

  // Get the sampled heap profile
  v8::AllocationProfile* sampled = profiler->GetAllocationProfile();
  if (sampled == nullptr) {
    QueueCallback(sampling_cb,
                  thread_id,
                  // TODO(juan) - this is not a heap snapshot failure
                  heap_profiler::HEAP_SNAPSHOT_FAILURE,
                  std::string(),
                  snapshotter);
  } else {
    nlohmann::ordered_json profile_json =
      build_v8_allocation_profile(isolate, sampled);

    QueueCallback(sampling_cb,
                  thread_id,
                  0,
                  profile_json.dump(),
                  snapshotter);
    QueueCallback(sampling_cb,
                  thread_id,
                  0,
                  std::string(),
                  snapshotter);

    // V8 uses new, so we need to delete it
    // This will make ASAN happy
    delete sampled;
  }
  // Stop the profiler no matter what
  profiler->StopSamplingHeapProfiler();
  stor.flags |= kFlagIsDone;
}

}  // namespace nsolid
}  // namespace node
