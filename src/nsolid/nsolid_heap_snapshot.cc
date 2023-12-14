#include "nsolid_heap_snapshot.h"
#include "asserts-cpp/asserts.h"
#include "nsolid.h"

namespace node {
namespace nsolid {

NSolidHeapSnapshot* NSolidHeapSnapshot::Inst() {
  static NSolidHeapSnapshot snapshot;
  return &snapshot;
}

NSolidHeapSnapshot::NSolidHeapSnapshot() {
  ASSERT_EQ(0, in_progress_heap_snapshots_.init(true));
}

int NSolidHeapSnapshot::StartTrackingHeapObjects(
    SharedEnvInst envinst,
    bool redacted,
    bool trackAllocations,
    uint64_t duration,
    void* data,
    Snapshot::snapshot_proxy_sig proxy,
    internal::deleter_sig deleter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
  // We can not trigger this command if there is already a snapshot in progress
  auto it = threads_running_snapshots_.find(thread_id);
  if (it != threads_running_snapshots_.end()) {
    return UV_EEXIST;
  }

  int status = RunCommand(envinst,
                          CommandType::Interrupt,
                          start_tracking_heapobjects,
                          trackAllocations,
                          duration,
                          this);

  // Consider this as taking a heap snapshot in the thread
  if (status == 0) {
    // Now we are tracking heap objects in this thread
    threads_running_snapshots_.emplace(
        thread_id,
        HeapSnapshotStor{
            redacted, true, proxy, internal::user_data(data, deleter)});
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

  int status = RunCommand(envinst,
                          CommandType::Interrupt,
                          take_snapshot,
                          this);

  if (status == 0) {
    threads_running_snapshots_.emplace(
        thread_id,
        HeapSnapshotStor{
            redacted, false, proxy, internal::user_data(data, deleter)});
  }

  return status;
}

int NSolidHeapSnapshot::StopTrackingHeapObjects(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&in_progress_heap_snapshots_);
  auto it = threads_running_snapshots_.find(thread_id);
  // Make sure there is a snapshot running
  if (it == threads_running_snapshots_.end())
    return UV_ENOENT;

  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      stop_tracking_heap_objects,
                      this);
  return er;
}

void NSolidHeapSnapshot::stop_tracking_heap_objects(
    SharedEnvInst envinst,
    NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_snapshots_.end());
  HeapSnapshotStor& stor = it->second;
  // If this condition is reached. This was called by EnvList::RemoveEnv.
  // It wants to stop any pending snapshot w/ tracking heap object.
  if (!stor.is_tracking_heapobjects_) {
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

    ASSERT_EQ(stor.is_tracking_heapobjects_, true);
    profiler->StopTrackingHeapObjects();
    stor.is_tracking_heapobjects_ = false;


    // At this point, the snapshot is fully serialized
    stor.cb(0, snapshot_str.c_str(), stor.data.get());
    // Tell ZMQ that the snapshot is done
    stor.cb(0, std::string(), stor.data.get());

    // Don't leak the snapshot string
    snapshot_str.clear();

    // Work around a deficiency in the API. The HeapSnapshot object is const
    // but we cannot call HeapProfiler::DeleteAllHeapSnapshots() because that
    // invalidates _all_ snapshots, including those created by other tools.
    const_cast<v8::HeapSnapshot*>(snapshot)->Delete();
  }
  // Delete the snapshot from the map
  snapshotter->threads_running_snapshots_.erase(it);
}

void NSolidHeapSnapshot::start_tracking_heapobjects(
    SharedEnvInst envinst,
    bool trackAllocations,
    uint64_t duration,
    NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();

  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_snapshots_.end());

  HeapSnapshotStor& stor = it->second;
  ASSERT_EQ(stor.is_tracking_heapobjects_, true);

  envinst->isolate()->GetHeapProfiler()->StartTrackingHeapObjects(
      trackAllocations);
  if (duration > 0) {
    // Schedule a timer to take the snapshot
    int er = QueueCallback(duration, take_snapshot_timer, envinst, snapshotter);

    if (er) {
      // In case the the thread is already gone, the cpu profile will be stopped
      // on RemoveEnv, so do nothing here.
    }
  }
}

void NSolidHeapSnapshot::take_snapshot_timer(SharedEnvInst envinst,
                                             NSolidHeapSnapshot* snapshotter) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_snapshots_.end());

  HeapSnapshotStor& stor = it->second;
  ASSERT_EQ(stor.is_tracking_heapobjects_, true);

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
  ASSERT(it != snapshotter->threads_running_snapshots_.end());

  HeapSnapshotStor& stor = it->second;
  if (snapshot == nullptr) {
    QueueCallback(snapshot_cb,
                  thread_id,
                  heap_profiler::HEAP_SNAPSHOT_FAILURE,
                  std::string());
  } else {
    DataOutputStream<uint64_t, v8::HeapSnapshot> stream(
      [](std::string snapshot_str, uint64_t* tid) {
      QueueCallback(snapshot_cb, *tid, 0, snapshot_str);
    }, snapshot, &thread_id);

    if (stor.redacted) {
      const v8::RedactedHeapSnapshot snapshot_redact(snapshot);
      snapshot_redact.Serialize(&stream);
    } else {
      snapshot->Serialize(&stream);
    }

    // A snapshot requested via `StopTrackingHeapObjects` or timer
    if (stor.is_tracking_heapobjects_) {
      profiler->StopTrackingHeapObjects();
      stor.is_tracking_heapobjects_ = false;
    }

    // Work around a deficiency in the API. The HeapSnapshot object is const
    // but we cannot call HeapProfiler::DeleteAllHeapSnapshots() because that
    // invalidates _all_ snapshots, including those created by other tools.
    const_cast<v8::HeapSnapshot*>(snapshot)->Delete();
  }
}

void NSolidHeapSnapshot::snapshot_cb(uint64_t thread_id,
                                     int status,
                                     const std::string& snapshot) {
  NSolidHeapSnapshot* snapshotter = NSolidHeapSnapshot::Inst();
  nsuv::ns_mutex::scoped_lock lock(&snapshotter->in_progress_heap_snapshots_);
  auto it = snapshotter->threads_running_snapshots_.find(thread_id);
  ASSERT(it != snapshotter->threads_running_snapshots_.end());
  HeapSnapshotStor& stor = it->second;
  stor.cb(status, snapshot, stor.data.get());
  if (snapshot.empty()) {
    snapshotter->threads_running_snapshots_.erase(it);
  }
}

}  // namespace nsolid
}  // namespace node
