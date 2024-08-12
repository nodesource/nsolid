#ifndef AGENTS_ZMQ_SRC_ZMQ_AGENT_H_
#define AGENTS_ZMQ_SRC_ZMQ_AGENT_H_

#include <nsolid/nsolid_api.h>
#include <nsolid/nsolid_util.h>
#include <zmq.h>
// NOLINTNEXTLINE(build/c++11)
#include <chrono>
#include <memory>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "asserts-cpp/asserts.h"
#include "nlohmann/json.hpp"
#include "http_client.h"
#include "../../src/profile_collector.h"

#define HANDLE_TYPES(X)                                                        \
  X(Command, "Command", ZMQ_SUB, "inproc://monitor-command", "command", false, \
    9001)                                                                      \
  X(Data, "Data", ZMQ_PUSH, "inproc://monitor-data", "data", true, 9002)       \
  X(Bulk, "Bulk", ZMQ_PUSH, "inproc://monitor-bulk", "bulk", true, 9003)

#define MONITOR_EVENTS(X)                                                      \
  X(ZMQ_EVENT_CONNECTED)                                                       \
  X(ZMQ_EVENT_CONNECT_DELAYED)                                                 \
  X(ZMQ_EVENT_CONNECT_RETRIED)                                                 \
  X(ZMQ_EVENT_LISTENING)                                                       \
  X(ZMQ_EVENT_BIND_FAILED)                                                     \
  X(ZMQ_EVENT_ACCEPTED)                                                        \
  X(ZMQ_EVENT_ACCEPT_FAILED)                                                   \
  X(ZMQ_EVENT_CLOSED)                                                          \
  X(ZMQ_EVENT_CLOSE_FAILED)                                                    \
  X(ZMQ_EVENT_DISCONNECTED)                                                    \
  X(ZMQ_EVENT_MONITOR_STOPPED)                                                 \
  X(ZMQ_EVENT_HANDSHAKE_FAILED_NO_DETAIL)                                      \
  X(ZMQ_EVENT_HANDSHAKE_SUCCEEDED)                                             \
  X(ZMQ_EVENT_HANDSHAKE_FAILED_PROTOCOL)                                       \
  X(ZMQ_EVENT_HANDSHAKE_FAILED_AUTH)

#define AGENT_STATUS(X)                                                        \
  X(Unconfigured, "unconfigured")                                              \
  X(Initializing, "initializing")                                              \
  X(Connecting, "connecting")                                                  \
  X(Buffering, "buffering")                                                    \
  X(Ready, "ready")

static unsigned int monitor_suffix = 0;

namespace node {
namespace nsolid {

class SpanCollector;
class ZmqAgent;
class ZmqHandle;
class ZmqCommandHandle;
class ZmqDataHandle;
class ZmqBulkHandle;
class ZmqEndpoint;

static const nlohmann::json default_agent_config = {
    // { "command", undefined },
    // { "data", undefined },
    // { "bulk", undefined },
    // { "pubkey", undefined }, // if true, encryption is activated
    {"disableIpv6", false},
    {"heartbeat", 1000},
    {"HWM", 1000},
    {"bulkHWM", 1000},
    {"interval", 3000},
    {"pauseMetrics", false}};

// Wrapper holding a zmq context
class ZmqContext {
 public:
  ZmqContext();

  ~ZmqContext();

  void* context() const { return context_; }

 private:
  void* context_;
};

// Wrapper holding a zmq socket
class ZmqSocket {
 public:
  ZmqSocket(void* context, int type);

  ~ZmqSocket();

  int connect(const std::string& endpoint);

  int connect(const ZmqEndpoint& endpoint);

  int getopt(int option_name, void* optval, size_t* optlen);

  int setopt(int option_name, const void* optval, size_t optlen);

  constexpr void* handle() const { return handle_; }

  uv_os_sock_t fd() const { return fd_; }

  void linger(int linger) { linger_ = linger; }

 private:
  void* handle_;
  uv_os_sock_t fd_;
  int linger_;
};

// Class to monitor a specific connection. There will be a monitor for every
// channel (command, data, bulk)
class ZmqMonitor {
 public:
  ZmqMonitor(void* context,
             ZmqHandle& monitorized_handle,  // NOLINT(runtime/references)
             const std::string& endpoint);

  ~ZmqMonitor();

  int connect();

  int init(uv_loop_t* loop);

  int stop();

 private:
  static void monitor_poll_cb(nsuv::ns_poll*, int, int, ZmqMonitor*);

 private:
  ZmqSocket socket_;
  ZmqHandle& monitorized_handle_;
  std::string endpoint_;
  nsuv::ns_poll* poll_;
};

// Base class for the 3 types of zmq handles: command, data and bulk.
class ZmqHandle {
  friend class ZmqMonitor;

 public:
  enum Type {
#define X(type, str, socktype, monitor_endpt, field, negotiated, port)         \
    type,
    HANDLE_TYPES(X)
#undef X
    NTypes
  };

 protected:
  // NOLINTNEXTLINE(runtime/references)
  ZmqHandle(ZmqAgent& agent, Type type);

  ~ZmqHandle();

  const std::string get_endpoint_from_config(
      const nlohmann::json& config) const {
    switch (type_) {
#define X(type, str, socktype, monitor_endpt, field, negotiated, port)         \
  case type: {                                                                 \
    auto iter = config.find(field);                                            \
    if (iter != config.end()) {                                                \
      return *iter;                                                            \
    }                                                                          \
    if (negotiated) {                                                          \
      iter = config.find(field "_negotiated");                                 \
      if (iter != config.end()) {                                              \
        return *iter;                                                          \
      }                                                                        \
    }                                                                          \
    return "null";                                                             \
  }
      HANDLE_TYPES(X)
#undef X
      default:
        ASSERT(true);
        return "";
    }
  }

  const std::string get_monitor_endpoint() const {
    switch (type_) {
#define X(type, str, socktype, monitor_endpt, field, negotiated, port)         \
  case type:                                                                   \
    return monitor_endpt + std::to_string(monitor_suffix++);
      HANDLE_TYPES(X)
#undef X
      default:
        ASSERT(true);
        return "";
    }
  }

  int get_socket_type() const {
    switch (type_) {
#define X(type, str, socktype, monitor_endpt, field, negotiated, port)         \
  case type:                                                                   \
    return socktype;
      HANDLE_TYPES(X)
#undef X
      default:
        ASSERT(true);
        return -1;
    }
  }

  int endpoint(const std::string& endpoint);

  int encryption(const std::string& storage_pubkey);

  int heartbeat(int heartbeat);

  int use_ipv6();

 public:
  static int get_default_port(const Type& type);

  static bool needs_reset(const nlohmann::json& diff,
                          const std::vector<std::string>& restart_fields);

  int config(const nlohmann::json& configuration);

  int init(uv_loop_t* loop);

  const Type& type() const { return type_; }

  const std::string type_str() const {
    switch (type_) {
#define X(type, str, socktype, monitor_endpt, field, negotiated, port)         \
  case type:                                                                   \
    return str;
      HANDLE_TYPES(X)
#undef X
      default:
        ASSERT(false);
        return "";
    }
  }

  const ZmqEndpoint& endpoint() const { return *endpoint_.get(); }

  constexpr bool connected() const { return connected_; }

  void connected(bool conn);

  void handle_event(uint16_t event);

 protected:
  ZmqAgent& agent_;
  Type type_;
  std::unique_ptr<ZmqSocket> socket_;
  std::unique_ptr<ZmqMonitor> monitor_;
  std::unique_ptr<ZmqEndpoint> endpoint_;
  bool connected_;
  uint64_t last_connect_attempt_;
  bool notified_connection_error_;
};

class ZmqCommandHandle : public ZmqHandle {
 public:
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(ZmqCommandHandle)

  // NOLINTNEXTLINE(runtime/references)
  static std::pair<ZmqCommandHandle*, int> create(ZmqAgent& agent,
                                                  const nlohmann::json& config);

  static const std::vector<std::string> restart_fields;

  ~ZmqCommandHandle();

  int init();

  int config(const nlohmann::json& configuration);

 private:
  // NOLINTNEXTLINE(runtime/references)
  explicit ZmqCommandHandle(ZmqAgent& agent);

 public:
  static void handle_poll_cb(nsuv::ns_poll*, int, int, ZmqAgent*);

 private:
  nsuv::ns_poll* poll_;
};

class ZmqDataHandle : public ZmqHandle {
 public:
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(ZmqDataHandle)

  // NOLINTNEXTLINE(runtime/references)
  static std::pair<ZmqDataHandle*, int> create(ZmqAgent& agent,
                                               const nlohmann::json& config);

  static const std::vector<std::string> restart_fields;

  int config(const nlohmann::json& configuration);

  int send(const std::string& data);

  int send(const char* data, size_t size);

 private:
  // NOLINTNEXTLINE(runtime/references)
  explicit ZmqDataHandle(ZmqAgent& agent);
};

class ZmqBulkHandle : public ZmqHandle {
 public:
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(ZmqBulkHandle)

  // NOLINTNEXTLINE(runtime/references)
  static std::pair<ZmqBulkHandle*, int> create(ZmqAgent& agent,
                                               const nlohmann::json& config);

  static const std::vector<std::string> restart_fields;

  ~ZmqBulkHandle();

  int config(const nlohmann::json& configuration);

  int send(const std::string& envelope, const std::string& payload);

 private:
  int init();

  static void send_data_timer_cb(nsuv::ns_timer*, ZmqBulkHandle*);

  // NOLINTNEXTLINE(runtime/references)
  explicit ZmqBulkHandle(ZmqAgent& agent);

  int do_send();

 private:
  std::vector<std::pair<std::string, std::string>> data_buffer_;
  nsuv::ns_timer* timer_;
};

// This is the main class. It creates a new thread with a new uv_loop where:

// - It receives, dynamically, configuration from the runtime have registering
//   to the OnConfigurationHook.
// - It handle scommunication with the console using zmq protocol.
// - It retrieves metrics from the runtime and sends them to the console.
// - It receives commands from the console to execute specific actions such as
//   generating cpu profiles or heap snapshots and sends them back to the
//   console, dynamically change the configuration of the agent/runtime, etc.

class ZmqAgent {
 public:
  enum Status {
#define X(type, str)                                                          \
    type,
    AGENT_STATUS(X)
#undef X
  };

  struct EnvMetricsStor {
    SharedThreadMetrics t_metrics;
    bool fetching;
    NSOLID_DELETE_DEFAULT_CONSTRUCTORS(EnvMetricsStor)
    explicit EnvMetricsStor(SharedEnvInst envinst, bool f)
      : t_metrics(ThreadMetrics::Create(envinst)),
        fetching(f) {}
  };

  struct ZmqCommandError {
    std::string message;
    int code;
  };

  static ZmqAgent* Inst();

  int setup_metrics_timer(uint64_t period);

  int start();

  int stop(bool profile_stopped);

  void command_handler(const std::string& cmd);

  // Dynamically set the current configuration of the agent.//
  // The JSON schema of the currently supported configuration with its
  // default values:
  // {
  //    "command": undefined,
  //    "data": undefined,
  //    "bulk": undefined,
  //    "pubkey": undefined,
  //    "disableIpv6": false,
  //    "heartbeat": 1000,
  //    "HWM": 1000,
  //    "bulkHWM", 1000,
  //    "interval": 3000,
  //    "pauseMetrics": false
  //
  // The current supported configuration allows to:
  //
  //   1) Setup the addresses of the remote endpoints for the command, data
  //      and bulk channels ("command", "data", "bulk")
  //   2) Enable / Disable encryption ("pubkey").
  //   3) Enable / Disable Ipv6 ("disableIpv6").
  //   4) Configure the heartbeat for the channels ("heartbeat").
  //   5) Configure the size of the send buffer associated to the data and
  //      bulk channels ("HWM", "bulkHWM").
  //   6) Configure whether the collection of metrics is activated or not
  //      and its period ("pauseMetrics", "interval").
  //
  int config(const nlohmann::json& message);

  const std::string& agent_id() const { return agent_id_; }

  const std::string public_key() const { return public_key_; }

  const std::string private_key() const { return private_key_; }

  const ZmqContext& context() const { return context_; }

  const ZmqCommandHandle* command_handle() const {
    return command_handle_.get();
  }

  int handshake_failed();

  int generate_snapshot(
    const nlohmann::json& message,
    const std::string& req_id = utils::generate_unique_id());


  const std::string& saas() const { return saas_; }

  int start_heap_profiling(
    const nlohmann::json& message,
    const std::string& req_id = utils::generate_unique_id());

  int stop_heap_profiling(uint64_t thread_id);

  int start_heap_sampling(
    const nlohmann::json& message,
    const std::string& req_id = utils::generate_unique_id());

  int stop_heap_sampling(uint64_t thread_id);

  int start_profiling(
    const nlohmann::json& message,
    const std::string& req_id = utils::generate_unique_id());

  bool pending_profiles() const;

  int stop_profiling(uint64_t thread_id);

  uv_loop_t* loop() { return &loop_; }

  nsuv::ns_async& update_state_msg() { return update_state_msg_; }

  std::string status() const;

  void status_cb(void(*)(const std::string&));

  static void config_agent_cb(std::string, ZmqAgent*);

  bool profile_on_exit() { return profile_on_exit_.load(); }

 private:
  struct ProfileStor {
    std::string req_id;
    uint64_t timestamp;
    ProfileOptions options;
  };

  using StartProfiling = int (ZmqAgent::*)(const nlohmann::json&,
                                           ProfileStor&);

  using ProfileStorMap = std::map<uint64_t, ProfileStor>;

  struct ProfileState {
    ProfileStorMap pending_profiles_map;
    std::atomic<unsigned int> nr_profiles = 0;
    std::string last_main_profile;
  };

  ZmqAgent();

  ~ZmqAgent();

  void operator delete(void*) = delete;

  static std::atomic<bool> is_running;

  static const std::vector<std::string> metrics_fields;

  static void run(nsuv::ns_thread*, ZmqAgent* zmq);

  static void env_creation_cb(SharedEnvInst, ZmqAgent*);

  static void env_deletion_cb(SharedEnvInst, ZmqAgent*);

  static void env_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void shutdown_cb(nsuv::ns_async*, ZmqAgent*);

  static void metrics_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void metrics_timer_cb(nsuv::ns_timer*, ZmqAgent*);

  static void config_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void update_state_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void env_metrics_cb(SharedThreadMetrics, ZmqAgent*);

  static void status_command_cb(SharedEnvInst, ZmqAgent*);

  static void cpu_profile_cb(int status,
                             std::string profile,
                             uint64_t thread_id,
                             ZmqAgent* agent);

  static void heap_profile_cb(int status,
                              std::string profile,
                              uint64_t thread_id,
                              ZmqAgent* agent);

  static void heap_sampling_cb(int status,
                               std::string profile,
                               uint64_t thread_id,
                               ZmqAgent* agent);

  static void heap_snapshot_cb(int,
                               std::string,
                               std::tuple<ZmqAgent*, std::string, uint64_t>*);

  static void heap_snapshot_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void blocked_loop_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void loop_blocked(SharedEnvInst, std::string, ZmqAgent*);

  static void loop_unblocked(SharedEnvInst, std::string, ZmqAgent*);

  static void custom_command_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void custom_command_cb(std::string req_id,
                                std::string command,
                                int status,
                                std::pair<bool, std::string> error,
                                std::pair<bool, std::string> value,
                                ZmqAgent* agent);

  static void span_msg_cb(nsuv::ns_async*, ZmqAgent*);

  static void span_timer_cb(nsuv::ns_timer*, ZmqAgent*);

  // NOLINTNEXTLINE(runtime/int)
  static void auth_cb(CURLcode, long, const std::string&, ZmqAgent*);

  void do_start();

  void do_stop();

  std::pair<int64_t, int64_t> create_recorded(
      const std::chrono::time_point<std::chrono::system_clock>&) const;

  ZmqCommandError create_command_error(const std::string& command,
                                       int err) const;

  void send_error_message(const std::string& msg, uint32_t code);


  int send_error_command_message(const std::string& req_id,
                                 const std::string& command,
                                 const ZmqCommandError& err);

  int send_error_response(const std::string&,
                          const std::string&,
                          int);

  void auth();

  void check_exit_on_profile();

  int config_message(const nlohmann::json& config);

  int config_sockets(const nlohmann::json& config);

  int command_message(const nlohmann::json& message);

  int do_start_prof(const nlohmann::json& message,
                    const std::string& req_id,
                    ProfileType type);

  // NOLINTNEXTLINE(runtime/references)
  int do_start_cpu_prof(const nlohmann::json&, ProfileStor& stor);

  // NOLINTNEXTLINE(runtime/references)
  int do_start_heap_prof(const nlohmann::json&, ProfileStor& stor);

  // NOLINTNEXTLINE(runtime/references)
  int do_start_heap_sampl(const nlohmann::json&, ProfileStor& stor);

  void do_got_prof(ProfileType type,
                   uint64_t thread_id,
                   int status,
                   const std::string& profile,
                   const char* cmd,
                   const char* stop_cmd);

  void got_custom_command_response(const std::string&,
                                   const std::string&,
                                   int,
                                   const std::pair<bool, std::string>&,
                                   const std::pair<bool, std::string>&);

  void got_env_metrics(const ThreadMetrics::MetricsStor& stor);

  void got_heap_snapshot(int status,
                         const std::string& snaphost,
                         const std::string& req_id,
                         const uint64_t thread_id);

  // NOLINTNEXTLINE(runtime/references)
  void got_spans(const std::vector<Tracer::SpanStor>& spans);

  int got_metrics(const std::string& metrics);

  void got_profile(const ProfileCollector::ProfileQStor& stor);

  // NOLINTNEXTLINE(runtime/int)
  void handle_auth_response(CURLcode, long, const std::string&);

  int reconfigure(const nlohmann::json& msg,
                  const std::string& req_id);

  int reset_command_handle(bool handshake_failed = false);

  void resize_msg_buffer(int size);

  int send_command_message(const char* command,
                           const char* request_id,
                           const char* body);

  int send_data_msg(const char* buf, size_t len);

  void send_exit();

  int send_info(const char* request_id = nullptr);

  int send_metrics(const std::string& metrics,
                   const char* request_id = nullptr);

  int send_packages(const char* request_id = nullptr);

  int send_pong(const std::string& req_id);

  int send_startup_times(const std::string& req_id);

  int handle_xping(const json& message, const std::string& req_id);

  void setup_blocked_loop_hooks();

  void status(const Status&);

  Status calculate_status() const;

  void update_state();

  std::string get_auth_url() const;

  int validate_reconfigure(
    const nlohmann::json& in,
    nlohmann::json& out) const;  // NOLINT(runtime/references)

 private:
  using custom_command_msg_q_tp_ = std::tuple<std::string,
                                              std::string,
                                              int,
                                              std::pair<bool, std::string>,
                                              std::pair<bool, std::string>>;
  uv_loop_t loop_;
  nsuv::ns_thread thread_;
  nsuv::ns_async shutdown_;

  // For zmq thread start/stop synchronization
  uv_cond_t start_cond_;
  uv_mutex_t start_lock_;
  uv_cond_t stop_cond_;
  uv_mutex_t stop_lock_;
  std::atomic<bool> exiting_;

  const std::string agent_id_;

  // For Auth
  std::string auth_url_;
  std::string public_key_;
  std::string private_key_;
  std::unique_ptr<zmq::ZmqHttpClient> http_client_;
  std::string saas_;
  nsuv::ns_timer auth_timer_;
  int auth_retries_;

  // For the Comms Layer
  ZmqContext context_;
  std::unique_ptr<ZmqCommandHandle> command_handle_;
  std::unique_ptr<ZmqDataHandle> data_handle_;
  utils::RingBuffer<std::string> data_ring_buffer_;
  std::unique_ptr<ZmqBulkHandle> bulk_handle_;
  int version_;
  nsuv::ns_timer invalid_key_timer_;

  nsuv::ns_async env_msg_;
  TSQueue<std::tuple<SharedEnvInst, bool>> env_msg_q_;

  // For the Metrics API
  std::map<uint64_t, EnvMetricsStor> env_metrics_map_;
  std::vector<ThreadMetrics::MetricsStor> completed_env_metrics_;
  ProcessMetrics proc_metrics_;
  uint64_t metrics_period_;
  nsuv::ns_async metrics_msg_;
  TSQueue<ThreadMetrics::MetricsStor> metrics_msg_q_;
  nsuv::ns_timer metrics_timer_;
  std::string cached_metrics_;
  std::set<std::string> pending_metrics_reqs_;

  // For the Configuration API
  nsuv::ns_async config_msg_;
  TSQueue<std::string> config_msg_q_;
  nlohmann::json config_;

  // For the state of the Agent
  std::atomic<Status> status_;
  nsuv::ns_async update_state_msg_;

  // Profiling
  ProfileState profile_state_[ProfileType::kNumberOfProfileTypes];
  std::atomic<bool> profile_on_exit_;
  std::shared_ptr<ProfileCollector> profile_collector_;

  // Heap Snapshot
  nsuv::ns_async heap_snapshot_msg_;
  TSQueue<std::tuple<int, std::string, std::string, uint64_t>>
    heap_snapshot_msg_q_;
  std::map<std::string, std::tuple<nlohmann::json, uint64_t>>
    pending_heap_snapshot_data_map_;

  // Blocked Loop
  nsuv::ns_async blocked_loop_msg_;
  TSQueue<std::tuple<bool, std::string, uint64_t>> blocked_loop_msg_q_;

  // Custom commands
  nsuv::ns_async custom_command_msg_;
  TSQueue<custom_command_msg_q_tp_> custom_command_msg_q_;

  // Tracing
  uint32_t trace_flags_;
  std::shared_ptr<SpanCollector> span_collector_;

  // ZMQ message buffers
  char msg_slab_[65536];
  std::unique_ptr<char[]> msg_up_ = nullptr;
  char* msg_buf_ = msg_slab_;
  int msg_size_ = sizeof(msg_slab_);

  // For status testing
  void(*status_cb_)(const std::string&);
};

}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_ZMQ_SRC_ZMQ_AGENT_H_
