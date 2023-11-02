#include "nsolid_heap_snapshot.h"
#include "asserts-cpp/asserts.h"
#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_output_stream.h"
#include "v8-profiler.h"

namespace node {
namespace nsolid {

NSolidHeapSnapshot* NSolidHeapSnapshot::Inst() {
  static NSolidHeapSnapshot snapshot;
  return &snapshot;
}

NSolidHeapSnapshot::NSolidHeapSnapshot() {
  ASSERT_EQ(0, in_progress_heap_snapshots_.init(true));
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
      HeapSnapshotStor{ redacted, proxy, internal::user_data(data, deleter) });
  }

  return status;
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
