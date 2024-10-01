#ifndef AGENTS_GRPC_SRC_GRPC_AGENT_H_
#define AGENTS_GRPC_SRC_GRPC_AGENT_H_

#include <nsolid.h>
#include <nsolid/thread_safe.h>
#include "nlohmann/json.hpp"
#include <memory>
#include <grpcpp/grpcpp.h>
#include "./proto/nsolid_service.grpc.pb.h"
#include "opentelemetry/version.h"
#include "opentelemetry/sdk/trace/recordable.h"
#include "../../src/profile_collector.h"
#include "grpc_errors.h"

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace exporter {
namespace otlp {
class OtlpGrpcExporter;
class OtlpGrpcLogRecordExporter;
class OtlpGrpcMetricExporter;
}
}
namespace sdk {
namespace trace {
class Recordable;
}
}
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {

class SpanCollector;

namespace grpc {

// predeclarations
class AssetStream;
class CommandStream;
class GrpcAgent;
class GrpcClient;

using UniqRecordable =
    std::unique_ptr<OPENTELEMETRY_NAMESPACE::sdk::trace::Recordable>;
using UniqRecordables = std::vector<UniqRecordable>;
using SharedGrpcAgent = std::shared_ptr<GrpcAgent>;
using WeakGrpcAgent = std::weak_ptr<GrpcAgent>;

struct JSThreadMetrics {
  explicit JSThreadMetrics(SharedEnvInst envinst);
  SharedThreadMetrics metrics_;
};

class GrpcAgent: public std::enable_shared_from_this<GrpcAgent> {
 public:
  struct LogInfoStor {
    uint64_t thread_id;
    LogWriteInfo info;
  };

  struct BlockedLoopStor {
    bool blocked;
    std::string body;
    uint64_t thread_id;
  };

  static SharedGrpcAgent Inst();

  void check_exit_on_profile();

  void command_stream_closed(const ::grpc::Status& s);

  void got_command_request(grpcagent::CommandRequest&& request);

  void remove_cpu_profile(uint64_t thread_id);

  void reset_command_stream();

  int start();

  int stop(bool profile_stopped = false);

  const std::string& agent_id() const { return agent_id_; }

  const std::string& saas() const { return saas_; }

 private:
  struct ProfileStor {
    std::string req_id;
    uint64_t timestamp;
    AssetStream* stream;
    ProfileOptions options;
  };

  using StartProfiling = ErrorType (GrpcAgent::*)(const grpcagent::ProfileArgs& args,
                                                  ProfileOptions& opts);

  using ProfileStorMap = std::map<uint64_t, ProfileStor>;

  struct ProfileState {
    ProfileStorMap pending_profiles_map;
    std::atomic<unsigned int> nr_profiles = 0;
    std::string last_main_profile;
  };

  GrpcAgent();

  ~GrpcAgent();

  static void run_(nsuv::ns_thread*, WeakGrpcAgent);

  static void at_exit_cb_(bool on_signal, bool profile_stopped, WeakGrpcAgent);

  static void blocked_loop_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void command_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void config_agent_cb_(std::string, WeakGrpcAgent);

  static void config_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void env_creation_cb_(SharedEnvInst, WeakGrpcAgent);

  static void env_deletion_cb_(SharedEnvInst, WeakGrpcAgent);

  static void env_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void log_cb_(SharedEnvInst, LogWriteInfo, WeakGrpcAgent);

  static void log_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void loop_blocked_(SharedEnvInst, std::string, WeakGrpcAgent);

  static void loop_unblocked_(SharedEnvInst, std::string, WeakGrpcAgent);

  static void metrics_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void metrics_timer_cb_(nsuv::ns_timer*, WeakGrpcAgent);

  static void profile_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void shutdown_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void span_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void thr_metrics_cb_(SharedThreadMetrics, WeakGrpcAgent);

  static void trace_hook_(Tracer*, const Tracer::SpanStor&, WeakGrpcAgent);

  int config(const nlohmann::json& config);

  void do_start();

  void do_stop();

  ErrorType do_start_prof(const grpcagent::CommandRequest& req,
                          const ProfileType& type);

  ErrorType do_start_cpu_prof(const grpcagent::ProfileArgs& args,
                              ProfileOptions& opts);

  ErrorType do_start_heap_prof(const grpcagent::ProfileArgs& args,
                               ProfileOptions& opts);

  ErrorType do_start_heap_sampl(const grpcagent::ProfileArgs& args,
                                ProfileOptions& opts);

  ErrorType do_start_heap_snapshot(const grpcagent::ProfileArgs& args,
                                   ProfileOptions& opts);

  void got_blocked_loop_msgs();

  void got_logs();

  void got_proc_metrics();

  void got_profile(const ProfileCollector::ProfileQStor& stor);

  void got_spans(const UniqRecordables& spans);

  void handle_command_request(grpcagent::CommandRequest&& request);

  void parse_saas_token(const std::string& token);

  bool pending_profiles() const;

  void reconfigure(const grpcagent::CommandRequest& config);

  void send_asset_error(const std::string& req_id,
                        const ProfileType& type,
                        const ProfileStor& stor,
                        const ErrorType& error);

  void send_blocked_loop_event(BlockedLoopStor&& stor);

  void send_exit();

  void send_info_event(const char* req_id = nullptr);

  void send_packages_event(const char* req_id = nullptr);

  void send_reconfigure_event(const char* req_id);

  void send_startup_times_event(const char* req_id);

  void send_unblocked_loop_event(BlockedLoopStor&& stor);

  void setup_blocked_loop_hooks();

  int setup_metrics_timer(uint64_t period);

  void update_tracer(uint32_t flags);

 private:
  uv_loop_t loop_;
  nsuv::ns_thread thread_;
  nsuv::ns_async shutdown_;

  // For thread start/stop synchronization
  bool hooks_init_;
  std::atomic<bool> ready_;
  uv_cond_t start_cond_;
  uv_mutex_t start_lock_;
  uv_cond_t stop_cond_;
  uv_mutex_t stop_lock_;
  std::atomic<bool> exiting_;

  nsuv::ns_async env_msg_;
  TSQueue<std::tuple<SharedEnvInst, bool>> env_msg_q_;

  // Blocked Loop
  nsuv::ns_async blocked_loop_msg_;
  TSQueue<BlockedLoopStor> blocked_loop_msg_q_;

  // For the Tracing API
  uint32_t trace_flags_;
  std::shared_ptr<SpanCollector> span_collector_;
  std::unique_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcExporter>
    trace_exporter_;
  std::vector<std::unique_ptr<opentelemetry::sdk::trace::Recordable>> recordables_;

  // For the Metrics API
  uint64_t metrics_interval_;
  ProcessMetrics proc_metrics_;
  ProcessMetrics::MetricsStor proc_prev_stor_;
  std::map<uint64_t, JSThreadMetrics> env_metrics_map_;
  nsuv::ns_async metrics_msg_;
  TSQueue<ThreadMetrics::MetricsStor> thr_metrics_msg_q_;
  nsuv::ns_timer metrics_timer_;
  std::unique_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporter> metrics_exporter_;

  // For the Configuration API
  nsuv::ns_async config_msg_;
  TSQueue<nlohmann::json> config_msg_q_;
  nlohmann::json config_;
  std::string agent_id_;
  std::string saas_;
  std::string console_id_;

  nsuv::ns_timer auth_timer_;
  int auth_retries_;
  bool unauthorized_;

  // For the Logging API
  nsuv::ns_async log_msg_;
  TSQueue<LogInfoStor> log_msg_q_;
  std::unique_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcLogRecordExporter>
    log_exporter_;

  // Profiling
  ProfileState profile_state_[ProfileType::kNumberOfProfileTypes];
  std::atomic<bool> profile_on_exit_;
  std::shared_ptr<ProfileCollector> profile_collector_;


  // For the grpc client
  std::shared_ptr<GrpcClient> client_;
  std::unique_ptr<grpcagent::NSolidService::StubInterface> nsolid_service_stub_;
  std::unique_ptr<CommandStream> command_stream_;
  std::string cacert_;
  std::string custom_certs_;

  // For the gRPC server
  nsuv::ns_async command_msg_;
  TSQueue<grpcagent::CommandRequest> command_q_;


};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_AGENT_H_
