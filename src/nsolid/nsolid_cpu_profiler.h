#ifndef SRC_NSOLID_NSOLID_CPU_PROFILER_H_
#define SRC_NSOLID_NSOLID_CPU_PROFILER_H_

#include <nsolid/nsolid_api.h>
#include <nsolid/nsolid_util.h>
#include <v8.h>
#include <v8-profiler.h>
#include <tuple>
#include <map>

#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {


class NSolidCpuProfiler {
 public:
  struct CpuProfilerStor {
    CpuProfilerStor(uint64_t timeout,
                    const std::string& title,
                    void* data,
                    CpuProfiler::cpu_profiler_proxy_sig proxy,
                    internal::deleter_sig deleter):
      status_(0),
      timeout_(timeout),
      title_(title),
      profiler_(nullptr),
      profile_(nullptr),
      proxy_(proxy),
      data_(data, deleter) {
    }

    ~CpuProfilerStor() {
      if (profile_) {
        profile_->Delete();
        profile_ = nullptr;
      }

      if (profiler_) {
        profiler_->Dispose();
        profiler_ = nullptr;
      }
    }

    int status_;
    uint64_t timeout_;
    std::string title_;
    v8::CpuProfiler* profiler_;
    v8::CpuProfile* profile_;
    CpuProfiler::cpu_profiler_proxy_sig proxy_;
    internal::user_data data_;
  };


  static NSolidCpuProfiler* Inst();

  int TakeCpuProfile(SharedEnvInst envinst,
                     uint64_t duration,
                     void* data,
                     CpuProfiler::cpu_profiler_proxy_sig proxy,
                     internal::deleter_sig deleter);

  int StopProfiling(SharedEnvInst envinst);

  int StopProfilingSync(SharedEnvInst envinst);

 private:
  static std::atomic<bool> is_running;

  static void cleanup_profile_(SharedEnvInst envinst);

  static inline void cpuprofile_failed_(uint64_t thread_id);

  static inline void serialize_cpuprofile_(v8::CpuProfile* Profile,
                                           uint64_t thread_id);

  static void stream_cb_(std::string profileChunk, uint64_t* tid);

  static void stop_cb_cpuprofiler_(SharedEnvInst envinst);

  static void stop_cpuprofiler_(uint64_t thread_id);

  static void run_cpuprofiler_(SharedEnvInst envinst);

  // It fixes an strange windows compiler bug where, in order to use the
  // cpu_profiler_map_, the copy ctor for std::pair<_kT, _T> is needed, which
  // CpuProfilerStor doesn't have because of the use of std::unique_ptr
  // refs: https://stackoverflow.com/a/59496238
  internal::user_data dummy_stub_;
  // Create a lock and map for the cpu profiler management.
  // If a thread is registered in the map, is currently profiling that thread.
  // If it is not, could mean the profiler was already stopped, or there is not
  // actual profiling running, or a an error ocurred.
  std::map<uint64_t, CpuProfilerStor> cpu_profiler_map_;
  nsuv::ns_mutex blocked_cpu_profilers_;

  NSolidCpuProfiler();
  ~NSolidCpuProfiler();
};


}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_CPU_PROFILER_H_
