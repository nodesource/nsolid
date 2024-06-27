#ifndef AGENTS_GRPC_SRC_GRPC_AGENT_H_
#define AGENTS_GRPC_SRC_GRPC_AGENT_H_

#include <nsolid.h>
#include <nsolid/thread_safe.h>
#include "nlohmann/json.hpp"
#include <memory>
#include <grpcpp/grpcpp.h>
#include "./proto/nsolid_service.grpc.pb.h"
#include "opentelemetry/version.h"

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace exporter {
namespace otlp {
class OtlpGrpcExporter;
class OtlpGrpcLogRecordExporter;
class OtlpGrpcMetricExporter;
}
}
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {
namespace grpc {

// predeclarations
class CommandStream;
class GrpcAgent;
class GrpcClient;

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

  void got_command_request(grpcagent::CommandRequest&& request);

  int start();

  int stop();

 private:
  GrpcAgent();

  ~GrpcAgent();

  static void run_(nsuv::ns_thread*, WeakGrpcAgent);

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

  static void shutdown_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void span_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void thr_metrics_cb_(SharedThreadMetrics, WeakGrpcAgent);

  static void trace_hook_(Tracer*, const Tracer::SpanStor&, WeakGrpcAgent);

  int config(const nlohmann::json& config);

  void do_start();

  void do_stop();

  void got_logs();

  void got_proc_metrics();

  void handle_command_request(grpcagent::CommandRequest&& request);

  void send_blocked_loop_event(BlockedLoopStor&& stor);

  void send_info_event(const char* req_id = nullptr);

  void send_packages_event(const char* req_id = nullptr);

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
  nsuv::ns_rwlock stop_lock_;

  nsuv::ns_async env_msg_;
  TSQueue<std::tuple<SharedEnvInst, bool>> env_msg_q_;

  // Blocked Loop
  nsuv::ns_async blocked_loop_msg_;
  TSQueue<BlockedLoopStor> blocked_loop_msg_q_;

  // For the Tracing API
  std::unique_ptr<Tracer> tracer_;
  nsuv::ns_async span_msg_;
  TSQueue<Tracer::SpanStor> span_msg_q_;
  uint32_t trace_flags_;
  std::unique_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcExporter>
    trace_exporter_;

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

  // For the Logging API
  nsuv::ns_async log_msg_;
  TSQueue<LogInfoStor> log_msg_q_;
  std::unique_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcLogRecordExporter>
    log_exporter_;

  // For the grpc client
  std::shared_ptr<GrpcClient> client_;
  std::unique_ptr<grpcagent::NSolidService::StubInterface> nsolid_service_stub_;
  std::unique_ptr<CommandStream> command_stream_; 

  // For the gRPC server
  nsuv::ns_async command_msg_;
  TSQueue<grpcagent::CommandRequest> command_q_;


};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_AGENT_H_
