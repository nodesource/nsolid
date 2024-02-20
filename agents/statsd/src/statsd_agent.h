#ifndef AGENTS_STATSD_SRC_STATSD_AGENT_H_
#define AGENTS_STATSD_SRC_STATSD_AGENT_H_

#include <nsolid/nsolid_api.h>
// NOLINTNEXTLINE(build/c++11)
#include <chrono>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "asserts-cpp/asserts.h"
#include "nlohmann/json.hpp"

#define AGENT_STATUS(X)                                                        \
  X(Unconfigured, "unconfigured")                                              \
  X(Initializing, "initializing")                                              \
  X(Connecting, "connecting")                                                  \
  X(Ready, "ready")

namespace node {
namespace nsolid {
namespace statsd {

using status_cb = void(*)(const std::string&);

// predeclarations
class StatsDAgent;
class StatsDEndpoint;

static const nlohmann::json default_agent_config = {
  { "statsdBucket", "nsolid.${env}.${app}.${hostname}.${shortId}" },
  { "interval", 3000 },
  { "pauseMetrics", false }
};

class StatsDTcp {
 public:
  enum Status {
    Initial,
    Connecting,
    Connected,
    ConnectionError,
    Disconnected
  };

  StatsDTcp(uv_loop_t*, nsuv::ns_async*);

  void close_and_delete();

  void connect(const struct sockaddr* addr);

  Status status() const { return status_; }

  void status(const Status& status);

  int write(const std::vector<std::string>& messages);

  const std::string addr_str() {
    nsuv::ns_mutex::scoped_lock lock(&addr_str_lock_);
    return addr_str_;
  }

  void addr_str(const std::string& addr) {
    nsuv::ns_mutex::scoped_lock lock(&addr_str_lock_);
    addr_str_ = addr;
  }

 private:
  enum InternalState {
    kWriting = 1 << 0,
    kConnecting = 1 << 1,
    kClosing = 1 << 2
  };

  static void connect_cb_(nsuv::ns_connect<nsuv::ns_tcp>*, int, StatsDTcp*);

  static void write_cb_(nsuv::ns_write<nsuv::ns_tcp>*, int, StatsDTcp*);

  inline void do_delete() { delete this; }

  ~StatsDTcp();

  nsuv::ns_tcp* tcp_;
  nsuv::ns_connect<nsuv::ns_tcp> connect_req_;
  nsuv::ns_write<nsuv::ns_tcp> write_req_;
  nsuv::ns_async* update_state_msg_;
  Status status_;
  std::string addr_str_;
  nsuv::ns_mutex addr_str_lock_;
  int internal_state_;
};

class StatsDUdp {
 public:
  StatsDUdp(uv_loop_t*, nsuv::ns_async*);

  ~StatsDUdp();

  int connect(const struct sockaddr* addr);

  bool connected() const { return connected_; }

  void connected(bool conn);

  int write(const std::vector<std::string>& messages);

  const std::string addr_str() {
    nsuv::ns_mutex::scoped_lock lock(&addr_str_lock_);
    return addr_str_;
  }

  void addr_str(const std::string& addr) {
    nsuv::ns_mutex::scoped_lock lock(&addr_str_lock_);
    addr_str_ = addr;
  }

 private:
  static void write_cb_(nsuv::ns_udp_send*, int, StatsDUdp*);

  nsuv::ns_udp* udp_;
  nsuv::ns_async* update_state_msg_;
  bool connected_;
  std::string addr_str_;
  nsuv::ns_mutex addr_str_lock_;
};

class StatsDAgent {
 public:
  enum Status {
#define X(type, str)                                                          \
    type,
    AGENT_STATUS(X)
#undef X
  };

  static std::atomic<bool> is_running_;

  static StatsDAgent* Inst();

  int setup_metrics_timer(uint64_t period);

  int start();

  int stop();

  // Dynamically set the current configuration of the agent.
  // The JSON schema of the currently supported configuration with its
  // default values:
  // {
  //    "statsd": undefined,
  //    "statsdBucket": 'nsolid.${env}.${app}.${hostname}.${shortId}',
  //    "statsdTags": [],
  //    "interval": 3000,
  //    "pauseMetrics": false,
  // }
  int config(const nlohmann::json& message);

  std::string bucket() {
    nsuv::ns_mutex::scoped_lock lock(&bucket_lock_);
    return bucket_;
  }

  uv_loop_t* loop() { return &loop_; }

  nsuv::ns_async* update_state_msg() { return &update_state_msg_; }

  int send(const std::vector<std::string>& sv, size_t len);

  std::string status() const;

  std::string tags() {
    nsuv::ns_mutex::scoped_lock lock(&tags_lock_);
    return tags_;
  }

  const std::string tcp_ip() {
    return tcp_ ? tcp_->addr_str() : std::string();
  }

  const std::string udp_ip() const {
    return udp_ ? udp_->addr_str() : std::string();
  }

  void set_status_cb(status_cb);

  static void config_agent_cb(std::string, StatsDAgent*);

 private:
  StatsDAgent();

  ~StatsDAgent();

  void operator delete(void*) = delete;

  static const std::vector<std::string> metrics_fields;

  static void run_(nsuv::ns_thread*, StatsDAgent*);

  static void env_creation_cb(SharedEnvInst, StatsDAgent*);

  static void env_deletion_cb(SharedEnvInst, StatsDAgent*);

  static void env_msg_cb(nsuv::ns_async*, StatsDAgent*);

  static void shutdown_cb_(nsuv::ns_async*, StatsDAgent*);

  static void metrics_msg_cb_(nsuv::ns_async*, StatsDAgent*);

  static void metrics_timer_cb_(nsuv::ns_timer*, StatsDAgent*);

  static void config_msg_cb_(nsuv::ns_async*, StatsDAgent*);

  static void update_state_msg_cb_(nsuv::ns_async*, StatsDAgent*);

  static void send_stats_msg_cb_(nsuv::ns_async*, StatsDAgent*);

  static void env_metrics_cb_(SharedThreadMetrics, StatsDAgent*);

  static void status_command_cb_(SharedEnvInst, StatsDAgent*);

  static void retry_timer_cb_(nsuv::ns_timer*, StatsDAgent*);

  std::string calculate_bucket(const std::string& tpl) const;

  std::string calculate_tags(const std::string& tpl) const;

  void config_bucket();

  void config_tags();

  int config_handles();

  void do_stop();

  void do_start();

  int send_metrics(const nlohmann::json& metrics,
                   uint64_t thread_id = static_cast<uint64_t>(-1),
                   const char* thread_name = nullptr);

  void setup_tcp();

  void setup_udp();

  void status(const Status&);

  Status calculate_status() const;

  void update_state();

  uv_loop_t loop_;
  nsuv::ns_thread thread_;
  nsuv::ns_async shutdown_;

  // For statsd thread start/stop synchronization
  uv_cond_t start_cond_;
  uv_mutex_t start_lock_;

  bool hooks_init_;

  nsuv::ns_async env_msg_;
  TSQueue<std::tuple<SharedEnvInst, bool>> env_msg_q_;

  StatsDTcp* tcp_;
  std::unique_ptr<StatsDUdp> udp_;
  std::unique_ptr<StatsDEndpoint> endpoint_;
  size_t addr_index_;
  nsuv::ns_timer retry_timer_;

  // For the Metrics API
  std::map<uint64_t, SharedThreadMetrics> env_metrics_map_;
  ProcessMetrics proc_metrics_;
  uint64_t metrics_period_;
  nsuv::ns_async metrics_msg_;
  TSQueue<ThreadMetrics::MetricsStor> metrics_msg_q_;
  nsuv::ns_timer metrics_timer_;

  // For the Configuration API
  nsuv::ns_async config_msg_;
  TSQueue<nlohmann::json> config_msg_q_;
  nlohmann::json config_;

  // For the state of the Agent
  std::atomic<Status> status_;
  nsuv::ns_async update_state_msg_;

  // For sending data via JS API
  nsuv::ns_async send_stats_msg_;
  TSQueue<std::vector<std::string>> send_stats_msg_q_;

  std::string bucket_;
  nsuv::ns_mutex bucket_lock_;
  std::string tags_;
  nsuv::ns_mutex tags_lock_;

  // For status testing
  status_cb status_cb_;
};

}  // namespace statsd
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_STATSD_SRC_STATSD_AGENT_H_
