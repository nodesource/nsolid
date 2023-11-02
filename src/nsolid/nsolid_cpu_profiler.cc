#include "nsolid_cpu_profiler.h"
#include "asserts-cpp/asserts.h"
#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_output_stream.h"
#include "v8-profiler.h"

namespace node {
namespace nsolid {

std::atomic<bool> NSolidCpuProfiler::is_running = { false };

CpuProfilerStor::CpuProfilerStor(uint64_t thread_id,
                                 uint64_t timeout,
                                 const std::string& title,
                                 void* data,
                                 CpuProfiler::cpu_profiler_proxy_sig proxy,
                                 internal::deleter_sig deleter)
    : thread_id_(thread_id),
      timeout_(timeout),
      title_(title),
      profiler_(nullptr),
      profile_(nullptr),
      proxy_(proxy),
      data_(data, deleter) {}

CpuProfilerStor::~CpuProfilerStor() {
  // Don't try to access the profile if the Isolate it comes from is gone
  SharedEnvInst envinst = GetEnvInst(thread_id_);
  if (!envinst) {
    return;
  }

  // Keep the Isolate alive while diposing the profiler and profile
  EnvInst::Scope scp(envinst);
  if (!scp.Success()) {
    return;
  }

  if (profile_) {
    profile_->Delete();
    profile_ = nullptr;
  }

  if (profiler_) {
    profiler_->Dispose();
    profiler_ = nullptr;
  }
}

NSolidCpuProfiler::NSolidCpuProfiler(): dummy_stub_(nullptr, nullptr) {
  is_running = true;
  ASSERT_EQ(0, blocked_cpu_profilers_.init(true));
}


NSolidCpuProfiler::~NSolidCpuProfiler() {
  is_running = false;
}


NSolidCpuProfiler* NSolidCpuProfiler::Inst() {
  static NSolidCpuProfiler nsolid_cpuprofiler_;
  return &nsolid_cpuprofiler_;
}


int NSolidCpuProfiler::TakeCpuProfile(SharedEnvInst envinst,
                                      uint64_t duration,
                                      void* data,
                                      CpuProfiler::cpu_profiler_proxy_sig cb,
                                      internal::deleter_sig deleter) {
  uint64_t thread_id = envinst->thread_id();

  nsuv::ns_mutex::scoped_lock lock(&blocked_cpu_profilers_);
  if (cpu_profiler_map_.find(thread_id) !=
      cpu_profiler_map_.end()) {
    return UV_EEXIST;
  }

  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      NSolidCpuProfiler::run_cpuprofiler_);
  if (er) {
    return er;
  }

  // Register the profiler in profiler map manager.
  auto pair = cpu_profiler_map_.emplace(
    std::piecewise_construct,
    std::forward_as_tuple(thread_id),
    std::forward_as_tuple(duration,
                          utils::generate_unique_id(),
                          data,
                          cb,
                          deleter));

  ASSERT_EQ(pair.second, true);

  return 0;
}


int NSolidCpuProfiler::StopProfiling(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(blocked_cpu_profilers_);
  auto it = cpu_profiler_map_.find(thread_id);

  // Not active profilers running or the cpu profile was early stopped.
  if (it == cpu_profiler_map_.end()) {
    return UV_ENOENT;
  }

  auto& stor = it->second;
  if (stor.profiler_ == nullptr) {
    return UV_ENOENT;
  }

  int er = RunCommand(envinst,
                      CommandType::Interrupt,
                      NSolidCpuProfiler::stop_cb_cpuprofiler_);

  if (er) {
    // In case the the thread is already gone, the cpu profile will be stopped
    // on RemoveEnv, so do nothing here.
  }

  return er;
}


// This method will only work if called from the same v8 thread as the profile
// is being stopped, otherwise it will return UV_EINVAL. Its main use case being
// stopping and retrieving synchronously a running CPU before the nsolid process
// exits or while using the JS API
int NSolidCpuProfiler::StopProfilingSync(SharedEnvInst envinst) {
  uint64_t thread_id = envinst->thread_id();
  nsuv::ns_mutex::scoped_lock lock(&blocked_cpu_profilers_);
  auto it = cpu_profiler_map_.find(thread_id);

  // Not active profilers running or the cpu profile was early stopped.
  if (it == cpu_profiler_map_.end()) {
    return UV_ENOENT;
  }

  auto& stor = it->second;
  if (stor.profiler_ == nullptr) {
    return UV_ENOENT;
  }

  v8::Isolate* isolate = envinst->isolate();
  v8::HandleScope handle_scope(isolate);
  v8::Local<v8::String> profile_title = v8::String::NewFromUtf8(
      isolate,
      stor.title_.c_str(),
      v8::NewStringType::kInternalized).ToLocalChecked();
  v8::CpuProfile* profile = stor.profiler_->StopProfiling(profile_title);
  if (profile == nullptr) {
    // The v8 StopProfiling API returns nullptr if no in-progress profile
    return UV_ENOENT;
  }

  std::string profileJSON;
  DataOutputStream<uint64_t, v8::CpuProfile> stream(&profileJSON,
                                                    profile,
                                                    &thread_id);
  // This is a sync call, at the end of this fn call, the profileJSON string
  // will contain all the CPU profile
  profile->Serialize(&stream);
  // Send the whole profile
  stor.proxy_(0, profileJSON, stor.data_.get());
  // Tell to zmq that the profile is done
  stor.proxy_(0, "", stor.data_.get());
  // Get rid of the profile.
  profile->Delete();
  cpu_profiler_map_.erase(it);
  return 0;
}


void NSolidCpuProfiler::run_cpuprofiler_(SharedEnvInst envinst_sp) {
  v8::Isolate* isolate = envinst_sp->isolate();
  v8::HandleScope handle_scope(isolate);

  NSolidCpuProfiler* nsprofiler = NSolidCpuProfiler::Inst();

  nsuv::ns_mutex::scoped_lock lock(&nsprofiler->blocked_cpu_profilers_);
  auto it = nsprofiler->cpu_profiler_map_.find(envinst_sp->thread_id());
  // Not active profilers running.
  if (it == nsprofiler->cpu_profiler_map_.end()) {
    return;
  }

  auto& stor = it->second;
  v8::CpuProfiler* profiler = v8::CpuProfiler::New(isolate);
  if (profiler == nullptr) {
    return;
  }

  // Assign v8::CpuProfiler and std::string profile_title to stor.
  stor.profiler_ = profiler;

  v8::Local<v8::String> profile_title = v8::String::NewFromUtf8(
    isolate,
    stor.title_.c_str(),
    v8::NewStringType::kInternalized).ToLocalChecked();

  // Run profile with the generated title and record samples
  // TODO(@juanarbol): add dynamic record samples and profiling options support.
  profiler->StartProfiling(profile_title, true /* recordsamples */);

  // Run the profiler with the generated unique name.
  int er = QueueCallback(stor.timeout_,
                         NSolidCpuProfiler::stop_cpuprofiler_,
                         envinst_sp->thread_id());
  if (er) {
    // Cleanup eveything.
    profiler->Dispose();
    nsprofiler->cpu_profiler_map_.erase(it);
  }
}


void NSolidCpuProfiler::stop_cpuprofiler_(uint64_t thread_id) {
  // Check if the profiler is already deleted
  if (!is_running) {
    return;
  }

  NSolidCpuProfiler* nsprofiler = NSolidCpuProfiler::Inst();

  nsuv::ns_mutex::scoped_lock lock(&nsprofiler->blocked_cpu_profilers_);
  auto it = nsprofiler->cpu_profiler_map_.find(thread_id);

  // Not active profilers running or the cpu profile was early stopped.
  if (it == nsprofiler->cpu_profiler_map_.end()) {
    return;
  }

  // We run command, cuz' we need V8's thread.
  int er = RunCommand(GetEnvInst(thread_id),
                      CommandType::Interrupt,
                      NSolidCpuProfiler::stop_cb_cpuprofiler_);

  if (er) {
    // In case the the thread is already gone, the cpu profile will be stopped
    // on RemoveEnv, so do nothing here.
  }
}


void NSolidCpuProfiler::stop_cb_cpuprofiler_(SharedEnvInst envinst_sp) {
  NSolidCpuProfiler* nsprofiler = NSolidCpuProfiler::Inst();

  v8::Isolate* isolate = envinst_sp->isolate();

  // At this point, maybe v8 already cleaned up our handles, if that happened,
  // it won't we able to crate local handles without a handle scope.
  //
  // It's the better to make sure we have a HandleScope.
  // DO NOT REMOVE, OTHERWISE V8 WILL CRASH.
  v8::HandleScope handle_scope(isolate);

  nsuv::ns_mutex::scoped_lock lock(&nsprofiler->blocked_cpu_profilers_);
  auto it = nsprofiler->cpu_profiler_map_.find(envinst_sp->thread_id());

  // Not active profilers running.
  if (it == nsprofiler->cpu_profiler_map_.end()) {
    return;
  }

  auto& stor = it->second;
  ASSERT_NOT_NULL(stor.profiler_);

  v8::Local<v8::String> profile_title = v8::String::NewFromUtf8(
      isolate,
      stor.title_.c_str(),
      v8::NewStringType::kInternalized).ToLocalChecked();
  v8::CpuProfile* profile = stor.profiler_->StopProfiling(profile_title);
  int er;
  if (profile == nullptr) {
    er = QueueCallback(NSolidCpuProfiler::cpuprofile_failed_,
                       envinst_sp->thread_id());
  } else {
    // We can parse the Cpu profiler on nsolid thread.
    er = QueueCallback(NSolidCpuProfiler::serialize_cpuprofile_,
                       profile,
                       envinst_sp->thread_id());
  }

  if (er) {
    // Clean up eveything.
    if (profile) {
      profile->Delete();
    }

    // Delete the reference of the profiler on this thread.
    nsprofiler->cpu_profiler_map_.erase(it);
    return;
  }

  // Assign the generated profile to tuple.
  if (profile) {
    stor.profile_ = profile;
  }
}


void NSolidCpuProfiler::cpuprofile_failed_(uint64_t thread_id) {
  // Check if the profiler is already deleted
  if (!is_running) {
    return;
  }

  NSolidCpuProfiler* nsprofiler = NSolidCpuProfiler::Inst();
  nsuv::ns_mutex::scoped_lock lock(&nsprofiler->blocked_cpu_profilers_);
  auto it = nsprofiler->cpu_profiler_map_.find(thread_id);
  if (it == nsprofiler->cpu_profiler_map_.end()) {
    return;
  }

  auto& stor = it->second;
  ASSERT_NOT_NULL(stor.profiler_);
  ASSERT_NOT_NULL(stor.profile_);

  stor.proxy_(1, "An error ocurred.", stor.data_.get());

  // Cleanup of the v8 structures (Profiler and Profile) should be done from the
  // v8 thread.
  int er = RunCommand(GetEnvInst(thread_id),
                      CommandType::EventLoop,
                      NSolidCpuProfiler::cleanup_profile_);
  if (er) {
    // Nothing to do here really, just get rid of the warning.
  }
}


void NSolidCpuProfiler::stream_cb_(std::string profileChunk, uint64_t* tid) {
  // Check if the profiler is already deleted
  if (!is_running) {
    return;
  }

  uint64_t thread_id = *tid;

  NSolidCpuProfiler* nsprofiler = NSolidCpuProfiler::Inst();
  nsuv::ns_mutex::scoped_lock lock(&nsprofiler->blocked_cpu_profilers_);
  auto it = nsprofiler->cpu_profiler_map_.find(thread_id);
  if (it == nsprofiler->cpu_profiler_map_.end()) {
    return;
  }

  auto& stor = it->second;
  ASSERT_NOT_NULL(stor.profiler_);
  ASSERT_NOT_NULL(stor.profile_);
  stor.proxy_(0, profileChunk, stor.data_.get());

  if (profileChunk.length() == 0) {
    // Cleanup of the v8 structures (Profiler and Profile) should be done from
    // the v8 thread.
    int er = RunCommand(GetEnvInst(thread_id),
                        CommandType::EventLoop,
                        NSolidCpuProfiler::cleanup_profile_);
    if (er) {
      // Nothing to do here really, just get rid of the warning.
      delete tid;
      // Delete the reference of the profiler on this thread.
      nsprofiler->cpu_profiler_map_.erase(it);
    }
  }
}


void NSolidCpuProfiler::serialize_cpuprofile_(v8::CpuProfile* profile,
                                              uint64_t thread_id) {
  // Check if the profiler is already deleted
  if (!is_running) {
    return;
  }

  DataOutputStream<uint64_t, v8::CpuProfile> stream(&stream_cb_,
                                                    profile,
                                                    &thread_id);
  profile->Serialize(&stream);
}


void NSolidCpuProfiler::cleanup_profile_(SharedEnvInst envinst_sp) {
  NSolidCpuProfiler* nsprofiler = NSolidCpuProfiler::Inst();
  nsuv::ns_mutex::scoped_lock lock(&nsprofiler->blocked_cpu_profilers_);
  nsprofiler->cpu_profiler_map_.erase(envinst_sp->thread_id());
}


}  // namespace nsolid
}  // namespace node
