#include <openssl/sha.h>
// NOLINTNEXTLINE(build/c++11)
#include <thread>
#include <utility>

#include "zmq_agent.h"
#include "debug_utils-inl.h"
#include "node_internals.h"
#include "zmq_endpoint.h"
#include "zmq_errors.h"
#include "nsolid/nsolid_heap_snapshot.h"


namespace node {
namespace nsolid {

using std::chrono::system_clock;
using std::chrono::time_point;
using nlohmann::json;
using string_vector = std::vector<std::string>;
using ZmqCommandHandleRes = std::pair<ZmqCommandHandle*, int>;
using ZmqDataHandleRes = std::pair<ZmqDataHandle*, int>;
using ZmqBulkHandleRes = std::pair<ZmqBulkHandle*, int>;

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_ZMQ_AGENT,
                     std::forward<Args>(args)...);
}

template <typename... Args>
inline int PrintZmqError(zmq::ErrorType code, Args&&... args) {
  const char* str = zmq::get_error_str(code);
  if (str) {
    Debug(str, std::forward<Args>(args)...);
  }

  return code;
}

inline void DebugJSON(const char* str, const json& msg) {
  if (UNLIKELY(per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_ZMQ_AGENT))) {
    Debug(str, msg.dump(4).c_str());
  }
}

inline void DebugEvent(uint16_t event, const ZmqHandle& handle) {
  if (UNLIKELY(per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_ZMQ_AGENT))) {
    switch (event) {
#define X(type)                                                                \
      case type:                                                               \
        Debug("[%s] " #type "\n", handle.type_str().c_str());                  \
        break;
          MONITOR_EVENTS(X)
#undef X
      default:
        Debug("[%s] Unrecognized ZMQ socket monitor event on command socket: "
              "%d\n",
              handle.type_str().c_str(),
              event);
    }
  }
}

const int MAX_AUTH_RETRIES = 20;
const char* kNSOLID_AUTH_URL = "NSOLID_AUTH_URL";
const char* NSOLID_AUTH_URL =
    "https://api.nodesource.com/accounts/auth/saas/zmq-nsolid-saas";
const uint64_t NSEC_BEFORE_WARN = 10000000000;
const uint64_t auth_timer_interval = 500;
const uint64_t invalid_key_timer_interval = 500;
constexpr uint64_t span_timer_interval = 100;
constexpr size_t span_msg_q_max_size = 200;

const char MSG_1[] = "{"
  "\"agentId\":\"%s\""
  ",\"requestId\": \"%s\""
  ",\"command\":\"%s\""
  ",\"recorded\":{\"seconds\":%" PRIu64",\"nanoseconds\":%" PRIu64"}"
  ",\"duration\":%d"
  ",\"interval\":%" PRIu64
  ",\"version\":%d"
  ",\"body\":%s"
  "}";

const char MSG_2[] = "{"
  "\"agentId\":\"%s\""
  ",\"requestId\": null"
  ",\"command\":\"%s\""
  ",\"recorded\":{\"seconds\":%" PRIu64",\"nanoseconds\":%" PRIu64"}"
  ",\"duration\":%d"
  ",\"interval\":%" PRIu64
  ",\"version\":%d"
  ",\"body\":%s"
  "}";

const char MSG_3[] = "{"
  "\"agentId\":\"%s\""
  ",\"requestId\": \"%s\""
  ",\"command\":\"%s\""
  ",\"duration\":%" PRIu64
  ",\"metadata\":%s"
  ",\"complete\":%s"
  ",\"threadId\":%" PRIu64
  ",\"version\":%d"
  "}";

const char MSG_4[] = "{"
  "\"agentId\":\"%s\""
  ",\"requestId\": \"%s\""
  ",\"command\":\"%s\""
  ",\"recorded\":{\"seconds\":%" PRIu64",\"nanoseconds\":%" PRIu64"}"
  ",\"version\":%d"
  ",\"error\":{\"message\":\"%s\",\"code\":%d}"
  "}";

const char MSG_5[] = "{"
  "\"agentId\":\"%s\""
  ",\"recorded\":{\"seconds\":%" PRIu64",\"nanoseconds\":%" PRIu64"}"
  ",\"version\":%d"
  ",\"error\":{\"message\":\"%s\",\"code\":%d}"
  "}";

const char MSG_6[] = "{"
  "\"agentId\":\"%s\""
  ",\"command\":\"exit\""
  ",\"exit_code\":%d"
  ",\"version\":%d"
  ",\"error\":{\"message\":%s,\"stack\":%s,\"code\":%d}"
"}";

const char MSG_7[] = "{"
  "\"agentId\":\"%s\""
  ",\"command\":\"exit\""
  ",\"exit_code\":%d"
  ",\"version\":%d"
  ",\"error\":null"
"}";

const char MSG_8[] = "{"
  "\"agentId\":\"%s\""
  ",\"command\":\"exit\""
  ",\"exit_code\":%d"
  ",\"version\":%d"
  ",\"error\":{\"message\":%s,\"stack\":%s,\"code\":%d}"
  ",\"profile\":%s"
"}";

const char MSG_9[] = "{"
  "\"agentId\":\"%s\""
  ",\"command\":\"exit\""
  ",\"exit_code\":%d"
  ",\"version\":%d"
  ",\"error\":null"
  ",\"profile\":%s"
"}";

const char PROCESS_METRICS_MSG[] = "{"
#define V(Type, CName, JSName, MType) \
  "\"" #JSName "\":%" PRIu64
  NSOLID_PROCESS_METRICS_UINT64_FIRST(V)
#undef V
#define V(Type, CName, JSName, MType) \
  ",\"" #JSName "\":%" PRIu64
  NSOLID_PROCESS_METRICS_UINT64(V)
#undef V
#define V(Type, CName, JSName, MType) \
  ",\""#JSName"\":%f"
  NSOLID_PROCESS_METRICS_DOUBLE(V)
#undef V
#define V(Type, CName, JSName, MType) \
  ",\""#JSName"\":%s"
  NSOLID_PROCESS_METRICS_STRINGS(V)
#undef V
  "}";

const char THREAD_METRICS_MSG[] = "{"
#define V(Type, CName, JSName, MType) \
  "\"" #JSName "\":%" PRIu64
  NSOLID_ENV_METRICS_UINT64_FIRST(V)
#undef V
#define V(Type, CName, JSName, MType) \
  ",\"" #JSName "\":%" PRIu64
  NSOLID_ENV_METRICS_UINT64(V)
#undef V
#define V(Type, CName, JSName, MType) \
  ",\""#JSName"\":%f"
  NSOLID_ENV_METRICS_DOUBLE(V)
#undef V
#define V(Type, CName, JSName, MType) \
  ",\""#JSName"\":%s"
  NSOLID_ENV_METRICS_STRINGS(V)
#undef V
  "}";

const char SPAN_MSG[] = "{"
  "\"id\":\"%s\""
  ",\"parentId\":\"%s\""
  ",\"traceId\":\"%s\""
  ",\"start\":%f"
  ",\"end\":%f"
  ",\"kind\":%d"
  ",\"type\":%d"
  ",\"name\":\"%s\""
  ",\"threadId\":%" PRIu64
  ",\"status\":{\"message\":\"%s\",\"code\":%d}"
  ",\"attributes\":%s"
  ",\"events\":[%s]"
  "}";


const char PONG[] = "{\"pong\":true}";

#define ZMQ_JSON_STRINGS(V)                                                    \
  V(kRequestId, "requestId")                                                   \
  V(kCommand, "command")                                                       \
  V(kDuration, "duration")                                                     \
  V(kVersion, "version")                                                       \
  V(kThreadId, "threadId")                                                     \
  V(kPackages, "packages")                                                     \
  V(kMessage, "message")                                                       \
  V(kCode, "code")                                                             \
  V(kMetadata, "metadata")                                                     \
  V(kMetrics, "metrics")                                                       \
  V(kInterval, "interval")                                                     \
  V(kDataNegotiated, "data_negotiated")                                        \
  V(kBulkNegotiated, "bulk_negotiated")                                        \
  V(kExit, "exit")                                                             \
  V(kProfile, "profile")                                                       \
  V(kReconfigure, "reconfigure")                                               \
  V(kSnapshot, "snapshot")

#define V(type, str)                                                           \
  static const char type[] = str;
  ZMQ_JSON_STRINGS(V)
#undef V

ZmqContext::ZmqContext() {
  context_ = zmq_ctx_new();
  ASSERT_NOT_NULL(context_);
}

ZmqContext::~ZmqContext() {
  int r;
  while ((r = zmq_ctx_destroy(context_)) && zmq_errno() == EINTR) {
    // yield to avoid this tight loop to block other threads
    std::this_thread::yield();
  }
}

ZmqSocket::ZmqSocket(void* context, int type)
    : handle_(zmq_socket(context, type)),
      linger_(0) {
  if (handle_ == nullptr) {
    ASSERT_EQ(0, zmq_errno());
  }

  size_t len = sizeof(fd_);
  ASSERT_EQ(0, getopt(ZMQ_FD, &fd_, &len));
}

ZmqSocket::~ZmqSocket() {
  ASSERT_EQ(0, setopt(ZMQ_LINGER, &linger_, sizeof(linger_)));
  zmq_close(handle_);
}

int ZmqSocket::connect(const std::string& endpoint) {
  int r = zmq_connect(handle_, endpoint.c_str());
  if (r == 0) {
    return r;
  }

  return zmq_errno();
}

int ZmqSocket::connect(const ZmqEndpoint& endpoint) {
  return connect(endpoint.to_string());
}

int ZmqSocket::getopt(int option_name, void* optval, size_t* optlen) {
  int r;
  while ((r = zmq_getsockopt(handle_, option_name, optval, optlen)) &&
         zmq_errno() == EINTR) {
    // yield to avoid this tight loop to block other threads
    std::this_thread::yield();
  }

  if (r == 0) {
    return r;
  }

  return zmq_errno();
}

int ZmqSocket::setopt(int option_name, const void* optval, size_t optlen) {
  int r;
  while ((r = zmq_setsockopt(handle_, option_name, optval, optlen)) &&
         zmq_errno() == EINTR) {
    // yield to avoid this tight loop to block other threads
    std::this_thread::yield();
  }

  if (r == 0) {
    return r;
  }

  return zmq_errno();
}

ZmqMonitor::ZmqMonitor(void* context,
                       ZmqHandle& monitorized_handle,
                       const std::string& endpoint)
    : socket_(context, ZMQ_PAIR),
      monitorized_handle_(monitorized_handle),
      endpoint_(endpoint),
      poll_(new nsuv::ns_poll()) {
  // monitor handle events
  ASSERT_EQ(0,
            zmq_socket_monitor(monitorized_handle_.socket_->handle(),
                               endpoint.c_str(),
                               ZMQ_EVENT_ALL));
  ASSERT_EQ(0, socket_.connect(endpoint));
}

void ZmqMonitor::monitor_poll_cb(nsuv::ns_poll*,
                                 int status,
                                 int events,
                                 ZmqMonitor* monitor) {
  void* handle = monitor->socket_.handle();
  auto& zmq_handle = monitor->monitorized_handle_;
  while (true) {
    zmq_msg_t msg;
    zmq_msg_init(&msg);
    if (zmq_msg_recv(&msg, handle, ZMQ_DONTWAIT) == -1) {
      ASSERT_EQ(0, zmq_msg_close(&msg));
      break;
    }

    uint16_t event = *static_cast<uint16_t*>(zmq_msg_data(&msg));
    ASSERT_EQ(0, zmq_msg_close(&msg));

    // Second frame in message contains event address.  This is not
    // useful to us but it has to be dequeued.
    if (zmq_msg_more(&msg)) {
      zmq_msg_init(&msg);
      if (zmq_msg_recv(&msg, handle, 0) == -1) {
        ASSERT_EQ(0, zmq_msg_close(&msg));
        break;
      }
    }

    DebugEvent(event, zmq_handle);

    ASSERT_EQ(0, zmq_msg_close(&msg));
    zmq_handle.handle_event(event);
  }
}

int ZmqMonitor::init(uv_loop_t* loop) {
  int r = poll_->init_socket(loop, socket_.fd());
  if (r != 0) {
    return r;
  }

  // read at least once, in case there are some events ready as zmq uses edge
  // triggered events
  monitor_poll_cb(poll_, 0, 0, this);

  return poll_->start(UV_READABLE, monitor_poll_cb, this);
}

int ZmqMonitor::stop() {
  return poll_->stop();
}

ZmqMonitor::~ZmqMonitor() {
  if (poll_->is_active()) {
    if (!poll_->is_closing()) {
      poll_->close_and_delete();
    }
  } else {
    delete poll_;
  }

  zmq_socket_monitor(
      monitorized_handle_.socket_->handle(), nullptr, ZMQ_EVENT_ALL);
}

ZmqHandle::ZmqHandle(ZmqAgent& agent,
                     Type type)
    : agent_(agent),
      type_(type),
      socket_(new ZmqSocket(agent_.context().context(), get_socket_type())),
      monitor_(
          new ZmqMonitor(agent_.context().context(),
                         *this,
                         get_monitor_endpoint())),
      endpoint_(nullptr),
      connected_(false),
      last_connect_attempt_(0),
      notified_connection_error_(false) {}

ZmqHandle::~ZmqHandle() {
  if (socket_) {
    // In case a profile is sent on exit, don't close the data and bulk channels
    // until all data is sent
    if (connected_ &&
        agent_.profile_on_exit() &&
        (type_ == Type::Data || type_ == Type::Bulk)) {
      socket_->linger(-1);
    } else {
      // Otherwise, if connected, wait 1sec so the remaining messages can be
      // sent.
      socket_->linger(connected_ ? 1000 : 0);
    }
  }
}

//
// Config fields for the handle:
//    endpoint: string
//    pubkey: string
//    disableIpv6: boolean
//    heartbeat: integer
//    HWM: integer
//    bulkHWM: integer
//
int ZmqHandle::config(const json& config) {
  int ret = 0;
  const std::string endpt = get_endpoint_from_config(config);
  if (endpt == "null") {
    return PrintZmqError(zmq::ZMQ_ERROR_NO_ENDPOINT, type_str().c_str());
  }

  ret = endpoint(endpt);
  if (ret != 0) {
    return ret;
  }

  auto iter = config.find("pubkey");
  if (iter != config.end()) {
    ret = encryption(*iter);
    if (ret != 0) {
      return PrintZmqError(zmq::ZMQ_ERROR_ENCRYPTION_ERROR,
                           zmq_strerror(ret),
                           ret,
                           type_str().c_str());
    }
  }

  iter = config.find("disableIpv6");
  if (iter != config.end() && *iter == false) {
    ret = use_ipv6();
    if (ret != 0) {
      return PrintZmqError(
          zmq::ZMQ_ERROR_IPV6, zmq_strerror(ret), ret, type_str().c_str());
    }
  }

  iter = config.find("heartbeat");
  if (iter != config.end()) {
    int hrtbt = *iter;
    ret = heartbeat(hrtbt);
    if (ret != 0) {
      return PrintZmqError(zmq::ZMQ_ERROR_HEARTBEAT,
                           hrtbt,
                           zmq_strerror(ret),
                           ret,
                           type_str().c_str());
    }
  }

  return ret;
}

int ZmqHandle::get_default_port(const ZmqHandle::Type& type) {
    switch (type) {
#define X(type, str, socktype, monitor_endpt, field, negotiated, port)         \
  case type:                                                                   \
    return port;
      HANDLE_TYPES(X)
#undef X
      default:
        ASSERT(true);
        return -1;
    }
  }

// This function is key. It takes the JSON diff between the old and the new
// config and calculates whether the handle needs resetting or not.
bool ZmqHandle::needs_reset(const json& diff,
                            const string_vector& restart_fields) {
  return utils::find_any_fields_in_diff(diff, restart_fields);
}

int ZmqHandle::endpoint(const std::string& endpoint) {
  endpoint_.reset(ZmqEndpoint::create(endpoint, get_default_port(type_)));
  if (endpoint_ == nullptr) {
    return PrintZmqError(
        zmq::ZMQ_ERROR_INVALID_ENDPOINT, endpoint.c_str(), type_str().c_str());
  }

  return 0;
}

int ZmqHandle::encryption(const std::string& storage_pubkey) {
  int ret;

  ret = socket_->setopt(ZMQ_CURVE_SERVERKEY,
                        storage_pubkey.c_str(),
                        storage_pubkey.size());  // or 40
  if (ret != 0) {
    return ret;
  }

  const std::string& pubkey = agent_.public_key();
  ret = socket_->setopt(ZMQ_CURVE_PUBLICKEY, pubkey.c_str(), pubkey.size());
  if (ret != 0) {
    return ret;
  }

  const std::string& privkey = agent_.private_key();
  ret = socket_->setopt(ZMQ_CURVE_SECRETKEY, privkey.c_str(), privkey.size());
  if (ret != 0) {
    return ret;
  }

  return 0;
}

// Sends a hearbeat every `heartbeat` ms and expect to receive data(or the pong)
// within 2*`heartbeat` ms. In addition, tell the remote that these heartbeats
// are expected at least every 2*`heartbeat` ms.
int ZmqHandle::heartbeat(int heartbeat) {
  int ret;
  int heartbeat_timeout = heartbeat << 1;

  ret = socket_->setopt(ZMQ_HEARTBEAT_IVL, &heartbeat, sizeof(heartbeat));
  if (ret != 0) {
    return ret;
  }

  ret = socket_->setopt(
      ZMQ_HEARTBEAT_TIMEOUT, &heartbeat_timeout, sizeof(heartbeat_timeout));
  if (ret != 0) {
    return ret;
  }

  ret = socket_->setopt(
      ZMQ_HEARTBEAT_TTL, &heartbeat_timeout, sizeof(heartbeat_timeout));
  if (ret != 0) {
    return ret;
  }

  return ret;
}

int ZmqHandle::use_ipv6() {
  int ret;
  int use_ipv6 = 1;
  ret = socket_->setopt(ZMQ_IPV6, &use_ipv6, sizeof(use_ipv6));
  if (ret != 0) {
    return ret;
  }

  return 0;
}

int ZmqHandle::init(uv_loop_t* loop) {
  int r = monitor_->init(loop);
  if (r != 0) {
    return r;
  }

  r = socket_->connect(*endpoint_);
  if (r != 0) {
    return PrintZmqError(zmq::ZMQ_ERROR_CONNECTION,
                         zmq_strerror(r),
                         r,
                         type_str().c_str(),
                         endpoint_->to_string().c_str());
  }

  last_connect_attempt_ = uv_hrtime();

  return 0;
}

void ZmqHandle::connected(bool conn) {
  if (connected_ != conn) {
    if (conn) {
      if (notified_connection_error_) {
        notified_connection_error_ = false;
        fprintf(stderr,
                "N|Solid connection to the %s remote established\n",
                type_str().c_str());
      }
    } else {
      last_connect_attempt_ = uv_hrtime();
    }

    // notify the agent
    ASSERT_EQ(0, agent_.update_state_msg().send());
  }

  connected_ = conn;
}

void ZmqHandle::handle_event(uint16_t event) {
  if (event == ZMQ_EVENT_HANDSHAKE_SUCCEEDED) {
    connected(true);
  } else if (event == ZMQ_EVENT_CLOSED || event == ZMQ_EVENT_DISCONNECTED) {
    connected(false);
  } else if (event == ZMQ_EVENT_HANDSHAKE_FAILED_PROTOCOL ||
             event == ZMQ_EVENT_HANDSHAKE_FAILED_NO_DETAIL ||
             event == ZMQ_EVENT_HANDSHAKE_FAILED_AUTH) {
    // In case the handshake fails, it's because some of the keys has been
    // invalidated. Restart negotiating with the next key.
    agent_.handshake_failed();
    connected(false);
    return;
  }

  if (!connected_ &&
      !notified_connection_error_ &&
      uv_hrtime() - last_connect_attempt_ > NSEC_BEFORE_WARN) {
    notified_connection_error_ = true;
    fprintf(stderr,
            "N|Solid warning: %s Unable to connect to the %s remote "
            "on %s, please verify address!  Continuing to try...\n",
            agent_.agent_id().c_str(),
            type_str().c_str(),
            endpoint_->to_string().c_str());
  }
}

std::atomic<bool> ZmqAgent::is_running = { false };

ZmqAgent* ZmqAgent::Inst() {
  static ZmqAgent agent;
  return &agent;
}

ZmqAgent::ZmqAgent()
    : exiting_(false),
      agent_id_(GetAgentId()),
      auth_url_(get_auth_url()),
      http_client_(nullptr),
      auth_retries_(0),
      context_(),
      command_handle_(nullptr),
      data_handle_(nullptr),
      bulk_handle_(nullptr),
      version_(4),
      proc_metrics_(),
      config_(default_agent_config),
      status_(Unconfigured),
      profile_on_exit_(false),
      nr_profiles_(0),
      trace_flags_(0),
      status_cb_(nullptr) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
  ASSERT_EQ(0, uv_cond_init(&stop_cond_));
  ASSERT_EQ(0, uv_mutex_init(&stop_lock_));
  is_running = true;
}

ZmqAgent::~ZmqAgent() {
  uv_mutex_destroy(&stop_lock_);
  uv_cond_destroy(&stop_cond_);
  uv_mutex_destroy(&start_lock_);
  uv_cond_destroy(&start_cond_);
  ASSERT_EQ(0, uv_loop_close(&loop_));
  is_running = false;
}

int ZmqAgent::start() {
  int r = 0;
  if (status_ == Unconfigured) {
    uv_mutex_lock(&start_lock_);
    r = thread_.create(run, this);
    if (r == 0) {
      while (status_ == Unconfigured) {
        uv_cond_wait(&start_cond_, &start_lock_);
      }
    }

    uv_mutex_unlock(&start_lock_);
  }

  return r;
}

void ZmqAgent::do_start() {
  config_ = default_agent_config;

  uv_mutex_lock(&start_lock_);

  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb, this));

  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb, this));

  ASSERT_EQ(0, metrics_msg_.init(&loop_, metrics_msg_cb, this));

  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb, this));

  ASSERT_EQ(0, OnConfigurationHook(config_agent_cb, this));

  ASSERT_EQ(0, ThreadAddedHook(env_creation_cb, this));

  ASSERT_EQ(0, ThreadRemovedHook(env_deletion_cb, this));

  ASSERT_EQ(0, auth_timer_.init(&loop_));

  ASSERT_EQ(0, invalid_key_timer_.init(&loop_));

  ASSERT_EQ(0, update_state_msg_.init(&loop_, update_state_msg_cb, this));

  ASSERT_EQ(0, metrics_timer_.init(&loop_));

  ASSERT_EQ(0, cpu_profile_msg_.init(&loop_, cpu_profile_msg_cb, this));

  ASSERT_EQ(0, heap_snapshot_msg_.init(&loop_, heap_snapshot_msg_cb, this));

  ASSERT_EQ(0, blocked_loop_msg_.init(&loop_, blocked_loop_msg_cb, this));

  ASSERT_EQ(0, custom_command_msg_.init(&loop_, custom_command_msg_cb, this));

  ASSERT_EQ(0, span_msg_.init(&loop_, span_msg_cb, this));

  ASSERT_EQ(0, span_timer_.init(&loop_));

  http_client_.reset(new zmq::ZmqHttpClient(&loop_));

  status(Initializing);
  uv_cond_signal(&start_cond_);
  uv_mutex_unlock(&start_lock_);
}

int ZmqAgent::stop(bool profile_stopped) {
  int r = 0;
  bool expected = false;
  if (exiting_.compare_exchange_strong(expected, true) == false) {
    // Return as it's already exiting. This should never happen, but just in
    // case.
    return 0;
  }

  if (status_ != Unconfigured) {
    if (profile_stopped) {
      // Wait here until the are no remaining profiles to be completed
      uv_mutex_lock(&stop_lock_);
      while (nr_profiles_ > 0) {
        uv_cond_wait(&stop_cond_, &stop_lock_);
      }

      uv_mutex_unlock(&stop_lock_);
    }

    profile_on_exit_ = profile_stopped;
    r = shutdown_.send();
    if (r != 0) {
      return r;
    }

    r = thread_.join();
    if (r != 0) {
      return r;
    }

    status(Unconfigured);
  }

  return r;
}

void ZmqAgent::do_stop() {
  send_exit();
  http_client_.reset(nullptr);
  command_handle_.reset(nullptr);
  data_handle_.reset(nullptr);
  bulk_handle_.reset(nullptr);
  auth_timer_.close();
  invalid_key_timer_.close();
  update_state_msg_.close();
  config_msg_.close();
  metrics_msg_.close();
  env_msg_.close();
  shutdown_.close();
  metrics_timer_.close();
  cpu_profile_msg_.close();
  heap_snapshot_msg_.close();
  blocked_loop_msg_.close();
  custom_command_msg_.close();
  span_msg_.close();
  span_timer_.close();

  config_.clear();
  saas_.clear();
  auth_retries_ = 0;
}

const string_vector ZmqAgent::metrics_fields = {"/interval",
                                                "/pauseMetrics"};

void ZmqAgent::run(nsuv::ns_thread*, ZmqAgent* agent) {
  agent->do_start();
  do {
    ASSERT_EQ(0, uv_run(&agent->loop_, UV_RUN_DEFAULT));
  } while (uv_loop_alive(&agent->loop_));
}

void ZmqAgent::shutdown_cb(nsuv::ns_async*, ZmqAgent* agent) {
  agent->do_stop();
}


void ZmqAgent::env_creation_cb(SharedEnvInst envinst, ZmqAgent* agent) {
  // Check if the agent is already delete or if it's closing
  if (!is_running || agent->env_msg_.is_closing()) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, true });
  ASSERT_EQ(0, agent->env_msg_.send());
}


void ZmqAgent::env_deletion_cb(SharedEnvInst envinst, ZmqAgent* agent) {
  // Check if the agent is already delete or if it's closing
  if (!is_running || agent->env_msg_.is_closing()) {
    return;
  }

  uint64_t thread_id = GetThreadId(envinst);

  // If the main thread is gone, ZmqAgent is already gone, so return immediately
  // to avoiding a possible crash.
  if (thread_id == 0) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, false });
  ASSERT_EQ(0, agent->env_msg_.send());
}


void ZmqAgent::env_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  std::tuple<SharedEnvInst, bool> tup;
  while (agent->env_msg_q_.dequeue(tup)) {
    SharedEnvInst envinst = std::get<0>(tup);
    uint64_t thread_id = GetThreadId(envinst);
    bool creation = std::get<1>(tup);
    if (creation) {
      auto pair = agent->env_metrics_map_.emplace(
        std::piecewise_construct,
        std::forward_as_tuple(GetThreadId(envinst)),
        std::forward_as_tuple(envinst, false));
      ASSERT(pair.second);
    } else {
      ASSERT_EQ(1, agent->env_metrics_map_.erase(thread_id));
    }
  }
}


void ZmqAgent::got_trace(Tracer* tracer,
                         const Tracer::SpanStor& stor,
                         ZmqAgent* agent) {
  // Check if the agent is already delete or if it's closing
  if (!is_running || agent->span_msg_.is_closing()) {
    return;
  }

  size_t size = agent->span_msg_q_.enqueue(stor);
  if (size > span_msg_q_max_size) {
    ASSERT_EQ(0, agent->span_msg_.send());
  }
}


void ZmqAgent::got_env_metrics(const ThreadMetrics::MetricsStor& stor) {
  ProcessMetrics::MetricsStor proc_stor;

  auto iter = env_metrics_map_.find(stor.thread_id);
  if (iter != env_metrics_map_.end()) {
    iter->second.fetching = false;
    // Store into the completed_env_metrics_ vector so we have easy access once
    // the metrics from all the threads are retrieved. Make a copy of
    // ThreadMetrics to make sure the metrics are still valid even if the
    // thread is gone.
    completed_env_metrics_.push_back(stor);
  }

  bool done = true;
  // Check whether all the env metrics reqs are done.
  for (auto it = env_metrics_map_.begin(); it != env_metrics_map_.end(); ++it) {
    if (it->second.fetching == true) {
      done = false;
      break;
    }
  }

  // If so, send the metrics back to the console
  if (done) {
    ASSERT_EQ(0, proc_metrics_.Update());
    proc_stor = proc_metrics_.Get();
    snprintf(msg_buf_,
             msg_size_,
             PROCESS_METRICS_MSG
#define V(Type, CName, JSName, MType) \
            , proc_stor.CName
NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V
#define V(Type, CName, JSName, MType) \
            , json(proc_stor.CName).dump().c_str()
NSOLID_PROCESS_METRICS_STRINGS(V)
#undef V
);
    std::string body = "{\"processMetrics\":";
    body += msg_buf_;
    body += ",\"threadMetrics\":[";
    for (auto it = completed_env_metrics_.begin();
        it != completed_env_metrics_.end();
        ++it) {
      snprintf(msg_buf_,
               msg_size_,
               THREAD_METRICS_MSG
#define V(Type, CName, JSName, MType) \
            , it->CName
NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
#define V(Type, CName, JSName, MType) \
            , json(it->CName.c_str()).dump().c_str()
NSOLID_ENV_METRICS_STRINGS(V)
#undef V
);
      body += msg_buf_;
      body += ",";
    }

    body.pop_back();
    body += "]}";

    got_metrics(body);
  }
}


void ZmqAgent::metrics_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  ThreadMetrics::MetricsStor stor;
  while (agent->metrics_msg_q_.dequeue(stor)) {
    agent->got_env_metrics(stor);
  }
}

// Callback to be registered in nsolid API
void ZmqAgent::config_agent_cb(std::string config, ZmqAgent* agent) {
  // Check if the agent is already delete or if it's closing
  if (!is_running || agent->config_msg_.is_closing()) {
    return;
  }

  agent->config_msg_q_.enqueue(config);
  ASSERT_EQ(0, agent->config_msg_.send());
}

void ZmqAgent::config_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  std::string config_str;
  while (agent->config_msg_q_.dequeue(config_str)) {
    json config_msg = json::parse(config_str, nullptr, false);
    // assert because the runtime should never send me an invalid JSON config
    ASSERT(!config_msg.is_discarded());
    agent->config(config_msg);
    // anytime there's a reconfiguration, notify to check 'ready' state.
    ASSERT_EQ(0, agent->update_state_msg_.send());
  }
}


void ZmqAgent::update_state_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  agent->update_state();
}

std::string ZmqAgent::status() const {
  switch (status_) {
#define X(type, str)                                                         \
  case ZmqAgent::type:                                                       \
  {                                                                          \
    return str;                                                              \
  }
  AGENT_STATUS(X)
#undef X
  default:
    ASSERT(false);
  }
}

void ZmqAgent::status_cb(void(*cb)(const std::string&)) {
  // For testing purposes only, it should only be called once
  ASSERT_NULL(status_cb_);
  status_cb_ = cb;
}

int ZmqAgent::setup_metrics_timer(uint64_t period) {
  int r;

  metrics_period_ = period;

  // stop timer if already started
  r = metrics_timer_.stop();
  if (r != 0) {
    return r;
  }

  if (period == 0) {
    return 0;
  }

  return metrics_timer_.start(metrics_timer_cb, 0, period, this);
}

// Implement negotiation process for data and bulk endpoints.
// For the moment, only if those endpoints have not already been configured
int ZmqAgent::config_sockets(const json& sockets) {
  if (data_handle_ && bulk_handle_) {
    return 0;
  }

  std::unique_ptr<ZmqEndpoint> command_endpt;
  std::unique_ptr<ZmqEndpoint> data_endpt;
  std::unique_ptr<ZmqEndpoint> bulk_endpt;

  auto it = sockets.find("commandBindAddr");
  if (it != sockets.end()) {
    command_endpt.reset(
      ZmqEndpoint::create(*it,
                          ZmqHandle::get_default_port(ZmqHandle::Command)));
  }

  if (!data_handle_) {
    it = sockets.find("dataBindAddr");
    if (it != sockets.end()) {
      data_endpt.reset(
        ZmqEndpoint::create(*it, ZmqHandle::get_default_port(ZmqHandle::Data)));
    }
  }

  if (!bulk_handle_) {
    it = sockets.find("bulkBindAddr");
    if (it != sockets.end()) {
      bulk_endpt.reset(
        ZmqEndpoint::create(*it, ZmqHandle::get_default_port(ZmqHandle::Bulk)));
    }
  }

  if (!data_endpt && !bulk_endpt) {
    return 0;
  }

  json new_config = config_;
  if (data_endpt) {
    if (command_endpt && data_endpt->hostname() == command_endpt->hostname()) {
      data_endpt->hostname(command_handle_->endpoint().hostname());
    }

    new_config[kDataNegotiated] = data_endpt->to_string();
  }

  if (bulk_endpt) {
    if (command_endpt && bulk_endpt->hostname() == command_endpt->hostname()) {
      bulk_endpt->hostname(command_handle_->endpoint().hostname());
    }

    new_config[kBulkNegotiated] = bulk_endpt->to_string();
  }

  if (data_endpt || bulk_endpt) {
    // In case at least one of the endpoints have been negotiated, reconfigure
    // the agent
    return config(new_config);
  }

  return 0;
}

int ZmqAgent::send_command_message(const char* command,
                                   const char* request_id,
                                   const char* body) {
  if (data_handle_ == nullptr) {
    // Don't send command as no data_handle
    return PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_NO_DATA_HANDLE, command);
  }

  const char* real_body = body ? (strlen(body) ? body : "\"\"") : "null";
  auto recorded = create_recorded(system_clock::now());
  int r;
  if (request_id == nullptr) {
    r = snprintf(msg_buf_,
                 msg_size_,
                 MSG_2,
                 agent_id_.c_str(),
                 command,
                 std::get<0>(recorded),
                 std::get<1>(recorded),
                 0,
                 metrics_period_,
                 version_,
                 real_body);

  } else {
    r = snprintf(msg_buf_,
                 msg_size_,
                 MSG_1,
                 agent_id_.c_str(),
                 request_id,
                 command,
                 std::get<0>(recorded),
                 std::get<1>(recorded),
                 0,
                 metrics_period_,
                 version_,
                 real_body);
  }

  if (r < 0) {
    return r;
  }

  if (r >= msg_size_) {
    resize_msg_buffer(r);
    return send_command_message(command, request_id, body);
  }

  r = data_handle_->send(msg_buf_, r);
  if (r == -1) {
    return PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_MESSAGE,
                         zmq_strerror(zmq_errno()),
                         zmq_errno(),
                         command,
                         msg_buf_,
                         data_handle_->endpoint().to_string().c_str());
  }

  return r;
}

int ZmqAgent::send_data_msg(const std::string& msg) const {
  if (data_handle_ == nullptr) {
    // Don't send command as no data_handle
    return PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_NO_DATA_HANDLE,
                         msg.c_str());
  }

  int r = data_handle_->send(msg);
  if (r == -1) {
    return PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_MESSAGE,
                         zmq_strerror(zmq_errno()),
                         zmq_errno(),
                         "",
                         msg.c_str(),
                         data_handle_->endpoint().to_string().c_str());
  }

  return r;
}


int ZmqAgent::config_message(const json& message) {
  ASSERT_NOT_NULL(command_handle_.get());
  int ret = 0;
  const json& cfg = message["config"];
  // get version of the message
  auto it = cfg.find(kVersion);
  int version = it == cfg.end() ? 4 : it->get<int>();
  // handle "sockets" field
  it = cfg.find("sockets");
  if (it != cfg.end()) {
    ret = config_sockets(*it);
    if (ret != 0) {
      return ret;
    }
  }

  // Store the protocol version supported by the console;
  version_ = version;
  return ret;
}

void ZmqAgent::command_handler(const std::string& cmd) {
  json message = json::parse(cmd, nullptr, false);
  if (message.is_discarded() && data_handle_ != nullptr) {
    return send_error_message("unable to parse json", 500);
  }

  DebugJSON("Command Received:\n%s\n", message);

  auto it_config = message.find("config");
  if (it_config != message.end()) {
    config_message(message);
    // anytime there's a reconfiguration, notify to check 'ready' state.
    ASSERT_EQ(0, update_state_msg_.send());
    return;
  }

  auto it = message.find(kVersion);
  int version = it == message.end() ? 3 : it->get<int>();
  // This should almost never happen, only if the runtime was already connected
  // to a console in relay mode and the end-console changed versions. Take that
  // into account and set the version_ to the new value.
  if (version_ != version) {
    version_ = version;
  }

  it_config = message.find(kCommand);
  if (it_config != message.end()) {
    command_message(message);
    return;
  }

  // Unhandled command message. Log about it.
}

int ZmqAgent::handshake_failed() {
  return invalid_key_timer_.start(+[](nsuv::ns_timer*, ZmqAgent* agent) {
    agent->reset_command_handle(true);
  }, invalid_key_timer_interval, 0, this);
}

void ZmqAgent::heap_snapshot_cb(
    int status,
    std::string snapshot,
    std::tuple<ZmqAgent*, std::string, uint64_t>* tup) {
  ZmqAgent* agent = std::get<ZmqAgent*>(*tup);
  // Check if the agent is already closing
  if (agent->heap_snapshot_msg_.is_closing()) {
    return;
  }

  agent->heap_snapshot_msg_q_.enqueue({
    status,
    snapshot,
    std::get<std::string>(*tup),
    std::get<uint64_t>(*tup)
  });
  ASSERT_EQ(0, agent->heap_snapshot_msg_.send());
  // delete tuple in case of error or end of stream.
  if (status < 0 || snapshot.length() == 0) {
    delete tup;
  }
}

void ZmqAgent::heap_snapshot_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  std::tuple<int, std::string, std::string, uint64_t> tup;
  while (agent->heap_snapshot_msg_q_.dequeue(tup)) {
    agent->got_heap_snapshot(std::get<0>(tup),
                             std::get<1>(tup),
                             std::get<2>(tup),
                             std::get<3>(tup));
  }
}

void ZmqAgent::got_heap_snapshot(int status,
                                 const std::string& snapshot,
                                 const std::string& req_id,
                                 const uint64_t thread_id) {
  // get and remove associated data from pending_heap_snapshot_data_map_
  auto it = pending_heap_snapshot_data_map_.find(req_id);
  if (it == pending_heap_snapshot_data_map_.end()) {
    // This may happen if an error sending the 'snapshot' data message to the
    // console.
    return;
  }

  auto tup = it->second;
  // get start_ts and metadata from pending_heap_snapshot_data_map_
  if (status < 0) {
    pending_heap_snapshot_data_map_.erase(it);
    // Send error message back
    send_error_response(req_id, kSnapshot, status);

    return;
  }

  bool complete = snapshot.length() == 0;
  if (complete == true) {
    pending_heap_snapshot_data_map_.erase(it);
  }

  // send profile thru the bulk channel
  if (bulk_handle_) {
    uv_update_time(&loop_);
    auto met = std::get<nlohmann::json>(tup);
    snprintf(msg_buf_,
             msg_size_,
             MSG_3,
             agent_id_.c_str(),
             req_id.c_str(),
             kSnapshot,
             uv_now(&loop_) - std::get<uint64_t>(tup),
             met.dump().c_str(),
             complete ? "true" : "false",
             thread_id,
             version_);
    bulk_handle_->send(msg_buf_, snapshot);
  }
}

int ZmqAgent::generate_snapshot(const json& message,
                                const std::string& req_id) {
  int ret = 0;
  uint64_t thread_id = 0;
  json metadata;

  if (!data_handle_) {
    return UV_ENOTCONN;
  }

  bool disable_snapshots = false;
  auto conf_it = config_.find("disableSnapshots");
  if (conf_it != config_.end()) {
    disable_snapshots = *conf_it;
  }

  if (disable_snapshots == true) {
    return send_error_response(req_id, kSnapshot, UV_EINVAL);
  }

  auto it = message.find("args");
  if (it == message.end() || !it->is_object()) {
    return send_error_response(req_id, kSnapshot, UV_EINVAL);
  }

  json args = *it;
  it = args.find(kThreadId);
  if (it == args.end() || !it->is_number_unsigned()) {
    return send_error_response(req_id, kSnapshot, UV_EINVAL);
  }

  thread_id = *it;

  it = args.find(kMetadata);
  if (it != args.end()) {
    metadata = *it;
  }

  auto tup =
    new (std::nothrow)std::tuple<ZmqAgent*, std::string, uint64_t>(this,
                                                                   req_id,
                                                                   thread_id);
  if (tup == nullptr) {
    return send_error_response(req_id, kSnapshot, UV_ENOMEM);
  }

  bool redact = false;
  conf_it = config_.find("redactSnapshots");
  if (conf_it != config_.end()) {
    if (conf_it->is_boolean()) {
      redact = *conf_it;
    } else {
      return send_error_response(req_id, kSnapshot, UV_EINVAL);
    }
  }

  ret = Snapshot::TakeSnapshot(GetEnvInst(thread_id),
                               redact,
                               heap_snapshot_cb,
                               tup);

  if (ret != 0) {
    delete tup;
    return send_error_response(req_id, kSnapshot, ret);
  }

  // send snapshot command reponse thru data channel
  int r = send_command_message(kSnapshot, req_id.c_str(), nullptr);
  if (r < 0) {
    return r;
  }

  uv_update_time(&loop_);
  auto iter = pending_heap_snapshot_data_map_.emplace(
    req_id, std::make_tuple(metadata, uv_now(&loop_)));
  ASSERT_NE(iter.second, false);

  return 0;
}

int ZmqAgent::got_metrics(const std::string& metrics) {
  int r;
  cached_metrics_ = metrics;
  r = send_metrics(metrics);
  if (r != 0) {
    return r;
  }

  // See if there are pending metrics to be sent
  for (const auto& req_id : pending_metrics_reqs_) {
    r = send_metrics(metrics, req_id.c_str());
    if (r != 0) {
      return r;
    }
  }

  return 0;
}

// The algorithm to dynamically change the configuration works as follows:
//
// 1 - JSON merge the current config of the agent with the new configuration.
//     This will be the new configuration of the agent.
// 2 - Generate a JSON diff of the new config with the old config.
// 3 - Call `ZmqHandle::needs_reset` on every of the handles (command, data
//     and bind) to decide whether they need to be reset or not.
// 4 - Act accordingly.
//
// If setting the new configuration fails, we don't try to rollback to the
// previous state. Just return error and let the consumer figure out the
// reason of the failure.
//
int ZmqAgent::config(const json& config) {
  int ret;
  json old_config = config_;
  config_.merge_patch(config);
  json diff = json::diff(old_config, config_);
  DebugJSON("Old Config: \n%s\n", old_config);
  DebugJSON("NewConfig: \n%s\n", config_);
  DebugJSON("Diff: \n%s\n", diff);
  if (ZmqHandle::needs_reset(diff, ZmqCommandHandle::restart_fields)) {
    ret = reset_command_handle();
    if (ret != 0) {
      return ret;
    }
  }

  if (utils::find_any_fields_in_diff(diff, { "/blockedLoopThreshold" })) {
    setup_blocked_loop_hooks();
  }

  // Return early if command handle is not to be configured
  if (command_handle_ == nullptr) {
    return 0;
  }

  if (ZmqHandle::needs_reset(diff, ZmqDataHandle::restart_fields)) {
    data_handle_.reset(nullptr);
    auto data = ZmqDataHandle::create(*this, config_);
    ret = std::get<int>(data);
    if (ret == 0) {
      data_handle_.reset(std::get<ZmqDataHandle*>(data));
    }
  }

  if (ZmqHandle::needs_reset(diff, ZmqBulkHandle::restart_fields)) {
    bulk_handle_.reset(nullptr);
    auto bulk = ZmqBulkHandle::create(*this, config_);
    ret = std::get<int>(bulk);
    if (ret == 0) {
      bulk_handle_.reset(std::get<ZmqBulkHandle*>(bulk));
    }
  }

  // Configure tracing flags
  if (tracer_ == nullptr ||
      utils::find_any_fields_in_diff(diff, { "/tracingEnabled",
                                             "/tracingModulesBlacklist" })) {
    auto it = config_.find("tracingEnabled");
    if (it != config_.end()) {
      bool tracing_enabled = *it;
      if (tracing_enabled) {
        trace_flags_ = Tracer::kSpanDns |
                       Tracer::kSpanHttpClient |
                       Tracer::kSpanHttpServer |
                       Tracer::kSpanCustom;
        it = config_.find("tracingModulesBlacklist");
        if (it != config_.end()) {
          const uint32_t blacklisted = *it;
          trace_flags_ &= ~blacklisted;
        }
      } else {
        trace_flags_ = 0;
      }
    } else {
      trace_flags_ = 0;
    }

    tracer_.reset(nullptr);
    if (trace_flags_) {
      Tracer* tracer = Tracer::CreateInstance(trace_flags_, got_trace, this);
      ASSERT_NOT_NULL(tracer);
      tracer_.reset(tracer);
    }

    if (trace_flags_) {
      ret = span_timer_.start(span_timer_cb, 0, span_timer_interval, this);
      if (ret != 0) {
        return ret;
      }
    } else {
      ret = span_timer_.stop();
      if (ret != 0) {
        return ret;
      }
    }
  }

  // If metrics timer is not active or if the diff contains metrics fields,
  // recalculate the metrics status. (stop/start/what period)
  if (!metrics_timer_.is_active() ||
      utils::find_any_fields_in_diff(diff, ZmqAgent::metrics_fields)) {
    bool pause = false;
    uint64_t period = 0;
    auto it = config_.find("pauseMetrics");
    if (it != config_.end()) {
      pause = *it;
    }

    if (!pause) {
      it = config_.find(kInterval);
      if (it != config_.end()) {
        period = *it;
      }
    }

    return setup_metrics_timer(period);
  }

  return 0;
}

int ZmqAgent::command_message(const json& message) {
  const std::string type = message[kCommand];
  auto it = message.find(kRequestId);
  ASSERT(it != message.end());
  const std::string req_id = *it;

  // The cancel request only makes sense for asynchronous ops.
  // In the nsolid 3.x agent only "packages" and profiling commands were
  // cancelable
  bool cancel = false;
  it = message.find("cancel");
  if (it != message.end()) {
    cancel = message["cancel"];
    if (cancel == true) {
      if (type == kMetrics) {
        pending_metrics_reqs_.erase(req_id);
      }

      return 0;
    }
  }

  if (type == "info") {
    return send_info(req_id.c_str());
  }

  if (type == kMetrics) {
    if (!cached_metrics_.empty()) {
      return send_metrics(cached_metrics_, req_id.c_str());
    }

    // What happens if no cached metrics? It's clearly
    // a corner case but maybe an acceptable strategy is:
    // - keeping a list of pending metrics requests.
    // - free the pending requests list if a cancel is received.
    // - once the cached metrics are available, send responses for remaining
    //   requests in the list.
    pending_metrics_reqs_.insert(req_id);
    return 0;
  }

  if (type == kPackages) {
    return send_packages(req_id.c_str());
  }

  if (type == "ping") {
    return send_pong(req_id);
  }

  if (type == kProfile) {
    return start_profiling(message, req_id);
  }

  if (type == kReconfigure) {
    return reconfigure(message, req_id);
  }

  if (type == kSnapshot) {
    return generate_snapshot(message, req_id);
  }

  if (type == "startup_times") {
    return send_startup_times(req_id);
  }

  if (type == "xping") {
    return handle_xping(message, req_id);
  }

  // otherwise type corresponds to the name of a custom command
  // for the moment just use the main thread
  json args;
  it = message.find("args");
  if (it != message.end()) {
    args = *it;
  }

  return CustomCommand(GetMainEnvInst(),
                       req_id,
                       type,
                       args.dump(),
                       custom_command_cb,
                       this);
}

void ZmqAgent::metrics_timer_cb(nsuv::ns_timer*, ZmqAgent* agent) {
  // To avoid extra-allocations the EnvMetrics collection works in the following
  // way:
  // 1) Every time a new Enviroment is created a new `EnvMetricsStor` is added
  //    to `env_metrics_map_`. The opposite also applies: when an Environment is
  //    destroyed, the `EnvMetricsStor` is deleted from `env_metrics_map_`.
  // 2) The `EnvMetricsStor.env_metrics_` field is used to store the env metrics
  //    of a specific thread for every `metrics_timer` period. It's important to
  //    note that the same `ThreadMetrics` instance is reused on every period in
  //    order to avoid extra heap allocations. This works on the assumption that
  //    ThreadMetrics collection from different periods cannot overlap.
  // 3) On ThreadMetrics of a specific thread retrieval, the
  //    `EnvMetricsStor.fetching` field is set to true. The opposite also holds:
  //    on ThreadMetrics completion of a specific thread completion, the
  //    `EnvMetricsStor.fetching` field is set to false. This field is used to
  //    detect when the metrics from every active thread have been retrieved.
  // 4) Also, on completion, the metrics are stored in the
  //    `completed_env_metrics_` vector from where they're easily traversed in
  //    order to create the `ThreadMetrics` object.
  //
  // Reset the list of completed env metrics.
  agent->completed_env_metrics_.clear();
  for (auto it = agent->env_metrics_map_.begin();
       it != agent->env_metrics_map_.end();
       ++it) {
    EnvMetricsStor& stor = std::get<1>(*it);
    // Reset fetching flag.
    stor.fetching = false;
    // Retrieve metrics from the Metrics API. Ignore any return error since
    // there's nothing to be done.
    int r = stor.t_metrics->Update(env_metrics_cb, agent);
    if (r == 0)
      stor.fetching = true;
  }
}

void ZmqAgent::env_metrics_cb(SharedThreadMetrics metrics, ZmqAgent* agent) {
  // Check if the agent is already delete or it's closing
  if (!is_running || agent->metrics_msg_.is_closing()) {
    return;
  }

  agent->metrics_msg_q_.enqueue(metrics->Get());
  ASSERT_EQ(0, agent->metrics_msg_.send());
}

std::pair<int64_t, int64_t>
ZmqAgent::create_recorded(const time_point<system_clock>& ts) const {
  using std::chrono::duration_cast;
  using std::chrono::seconds;
  using std::chrono::nanoseconds;

  system_clock::duration dur = ts.time_since_epoch();
  return { duration_cast<seconds>(dur).count(),
           duration_cast<nanoseconds>(dur % seconds(1)).count() };
}

ZmqAgent::ZmqCommandError ZmqAgent::create_command_error(
    const std::string& command, int err) const {
  ZmqCommandError cmd_error;
  switch (err) {
    case UV_EEXIST:
      cmd_error.code = 409;
      if (command == kProfile) {
        cmd_error.message = "Profile already in progress";
      } else {
        cmd_error.message = "Snapshot already in progress";
      }
    break;
    case UV_EINVAL:
      cmd_error.code = 422;
      cmd_error.message = "Invalid arguments";
    break;
    case UV_ENOTCONN:
      cmd_error.code = 500;
      cmd_error.message = "No conection with the console";
    break;
    case UV_EBADF:
    case UV_ESRCH:
      cmd_error.code = 410;
      cmd_error.message = "Thread already gone";
    break;
    default:
      cmd_error.code = 500;
      char err_str[20];
      uv_err_name_r(err, err_str, sizeof(err_str));
      if (command == kProfile) {
        cmd_error.message = std::string("Profile creation failure: ");
      } else {
        cmd_error.message = std::string("Snapshot creation failure: ");
      }

      cmd_error.message += err_str;
  }

  return cmd_error;
}

void ZmqAgent::send_error_message(const std::string& msg,
                                  uint32_t code) {
  if (data_handle_ == nullptr) {
    // Don't send as no data_handle
    return;
  }

  auto recorded = create_recorded(system_clock::now());
  int r = snprintf(msg_buf_,
                   msg_size_,
                   MSG_5,
                   agent_id_.c_str(),
                   std::get<0>(recorded),
                   std::get<1>(recorded),
                   version_,
                   msg.c_str(),
                   code);

  if (r < 0) {
    return;
  }

  if (r >= msg_size_) {
    resize_msg_buffer(r);
    r = snprintf(msg_buf_,
                 msg_size_,
                 MSG_5,
                 agent_id_.c_str(),
                 std::get<0>(recorded),
                 std::get<1>(recorded),
                 version_,
                 msg.c_str(),
                 code);
  }

  ASSERT_LT(r, msg_size_);

  r = data_handle_->send(msg_buf_, r);
  if (r == -1) {
    return;
  }
}

int ZmqAgent::send_error_command_message(const std::string& req_id,
                                         const std::string& command,
                                         const ZmqCommandError& err) {
  if (data_handle_ == nullptr) {
    // Don't send command as no data_handle
    return PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_NO_DATA_HANDLE,
                         command.c_str());
  }

  auto recorded = create_recorded(system_clock::now());
  int r = snprintf(msg_buf_,
                   msg_size_,
                   MSG_4,
                   agent_id_.c_str(),
                   req_id.c_str(),
                   command.c_str(),
                   std::get<0>(recorded),
                   std::get<1>(recorded),
                   version_,
                   err.message.c_str(),
                   err.code);

  if (r < 0) {
    return r;
  }

  if (r >= msg_size_) {
    resize_msg_buffer(r);
    r = snprintf(msg_buf_,
                 msg_size_,
                 MSG_4,
                 agent_id_.c_str(),
                 req_id.c_str(),
                 command.c_str(),
                 std::get<0>(recorded),
                 std::get<1>(recorded),
                 version_,
                 err.message.c_str(),
                 err.code);
  }

  ASSERT_LT(r, msg_size_);

  r = data_handle_->send(msg_buf_, r);
  if (r == -1) {
    return PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_MESSAGE,
                         zmq_strerror(zmq_errno()),
                         zmq_errno(),
                         command,
                         msg_buf_,
                         data_handle_->endpoint().to_string().c_str());
  }

  return r;
}

int ZmqAgent::send_error_response(const std::string& req_id,
                                  const std::string& command,
                                  int err) {
  send_error_command_message(req_id,
                             command,
                             create_command_error(command, err));
  return err;
}

void ZmqAgent::send_exit() {
  if (data_handle_ == nullptr) {
    // Don't send command as no data_handle
    PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_NO_DATA_HANDLE, kExit);
    return;
  }

  auto* error = GetExitError();
  int exit_code = GetExitCode();

  int r;

  if (error == nullptr) {
    if (last_main_profile_.empty()) {
      r = snprintf(msg_buf_,
                   msg_size_,
                   MSG_7,
                   agent_id_.c_str(),
                   exit_code,
                   version_);
    } else {
      r = snprintf(msg_buf_,
                   msg_size_,
                   MSG_9,
                   agent_id_.c_str(),
                   exit_code,
                   version_,
                   last_main_profile_.c_str());
    }
  } else {
    // Use nlohmann::json to properly escape the error message and stack.
    nlohmann::json jmsg(std::get<0>(*error));
    nlohmann::json jstack(std::get<1>(*error));
    if (last_main_profile_.empty()) {
      r = snprintf(msg_buf_,
                   msg_size_,
                   MSG_6,
                   agent_id_.c_str(),
                   exit_code,
                   version_,
                   jmsg.dump().c_str(),
                   jstack.dump().c_str(),
                   500);
    } else {
      r = snprintf(msg_buf_,
                   msg_size_,
                   MSG_8,
                   agent_id_.c_str(),
                   exit_code,
                   version_,
                   jmsg.dump().c_str(),
                   jstack.dump().c_str(),
                   500,
                   last_main_profile_.c_str());
    }
  }

  ASSERT_GT(r, 0);

  if (r >= msg_size_) {
    resize_msg_buffer(r);
    return send_exit();
  }

  r = data_handle_->send(msg_buf_, r);
  if (r == -1) {
    PrintZmqError(zmq::ZMQ_ERROR_SEND_COMMAND_MESSAGE,
                  zmq_strerror(zmq_errno()),
                  zmq_errno(),
                  kExit,
                  msg_buf_,
                  data_handle_->endpoint().to_string().c_str());
  }
}

int ZmqAgent::send_info(const char* request_id) {
  return send_command_message("info", request_id, GetProcessInfo().c_str());
}

int ZmqAgent::send_metrics(const std::string& metrics,
                           const char* request_id) {
  return send_command_message(kMetrics, request_id, metrics.c_str());
}

int ZmqAgent::send_packages(const char* request_id) {
  std::string packs;
  int er;

  er = ModuleInfo(GetMainEnvInst(), &packs);
  if (er)
    return send_error_response(request_id, kPackages, er);

  const std::string packages = "{\"packages\":" + packs + "}";
  return send_command_message(kPackages, request_id, packages.c_str());
}

int ZmqAgent::send_pong(const std::string& req_id) {
  return send_command_message("ping", req_id.c_str(), PONG);
}

int ZmqAgent::send_startup_times(const std::string& req_id) {
  std::string startup;
  int er;

  er = GetStartupTimes(GetMainEnvInst(), &startup);
  if (er)
    return send_error_response(req_id, "startup_times", er);
  return send_command_message("startup_times", req_id.c_str(), startup.c_str());
}

int ZmqAgent::handle_xping(const json& message,
                           const std::string& req_id) {
  auto it = message.find("args");
  if (it != message.end()) {
    json args = *it;
    it = args.find("restart");
    if (it != args.end()) {
      bool restart = *it;
      if (restart) {
        reset_command_handle(false);
        return 0;
      }
    }
  }

  return send_command_message("xping", req_id.c_str(), PONG);
}

void ZmqAgent::loop_blocked(SharedEnvInst envinst,
                            std::string body,
                            ZmqAgent* agent) {
  // Check if the agent is already delete or it's closing
  if (!is_running || agent->blocked_loop_msg_.is_closing()) {
    return;
  }

  agent->blocked_loop_msg_q_.enqueue({ true, body, GetThreadId(envinst) });
  ASSERT_EQ(0, agent->blocked_loop_msg_.send());
}

void ZmqAgent::loop_unblocked(SharedEnvInst envinst,
                              std::string body,
                              ZmqAgent* agent) {
  // Check if the agent is already delete or it's closing
  if (!is_running || agent->blocked_loop_msg_.is_closing()) {
    return;
  }

  agent->blocked_loop_msg_q_.enqueue({ false,
                                       body,
                                       GetThreadId(envinst) });
  ASSERT_EQ(0, agent->blocked_loop_msg_.send());
}

void ZmqAgent::blocked_loop_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  std::tuple<bool, std::string, uint64_t> tup;
  while (agent->blocked_loop_msg_q_.dequeue(tup)) {
    bool blocked = std::get<bool>(tup);
    const char* cmd = blocked ? "loop_blocked" : "loop_unblocked";
    agent->send_command_message(cmd,
                                nullptr,
                                std::get<std::string>(tup).c_str());
  }
}

void ZmqAgent::setup_blocked_loop_hooks() {
  auto it = config_.find("blockedLoopThreshold");
  if (it != config_.end()) {
    uint64_t threshold = *it;
    OnBlockedLoopHook(threshold, loop_blocked, this);
    OnUnblockedLoopHook(loop_unblocked, this);
  }
}

void ZmqAgent::custom_command_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  custom_command_msg_q_tp_ tup;
  while (agent->custom_command_msg_q_.dequeue(tup)) {
    agent->got_custom_command_response(std::move(std::get<0>(tup)),
                                       std::move(std::get<1>(tup)),
                                       std::move(std::get<2>(tup)),
                                       std::move(std::get<3>(tup)),
                                       std::move(std::get<4>(tup)));
  }
}

void ZmqAgent::got_custom_command_response(
    const std::string& req_id,
    const std::string& command,
    int status,
    const std::pair<bool, std::string>& error,
    const std::pair<bool, std::string>& value) {

  if (!data_handle_) {
    return;
  }

  if (status != 0) {
    std::string msg;
    if (status == UV_ENOENT) {
      msg = "NSolid Agent: no command handler installed for `" + command + "`";
    } else {
      char err_str[20];
      uv_err_name_r(status, err_str, sizeof(err_str));
      msg += "NSolid Agent: custom command error `";
      msg += err_str;
      msg += "`";
    }

    ZmqCommandError cmd_error { msg, 500 };
    send_error_command_message(req_id, command, cmd_error);
    return;
  }

  ASSERT(error.first != value.first);
  if (value.first) {
    send_command_message(command.c_str(),
                         req_id.c_str(),
                         value.second.c_str());
  } else {
    ZmqCommandError cmd_error { error.second, 500 };
    send_error_command_message(req_id, command, cmd_error);
  }
}

void ZmqAgent::custom_command_cb(std::string req_id,
                                 std::string command,
                                 int status,
                                 std::pair<bool, std::string> error,
                                 std::pair<bool, std::string> value,
                                 ZmqAgent* agent) {
  agent->custom_command_msg_q_.enqueue({
    req_id,
    command,
    status,
    error,
    value
  });

  ASSERT_EQ(0, agent->custom_command_msg_.send());
}

void ZmqAgent::span_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  std::vector<Tracer::SpanStor> spans;
  Tracer::SpanStor stor;
  while (agent->span_msg_q_.dequeue(stor)) {
    spans.push_back(std::move(stor));
  }

  if (spans.size() > 0) {
    agent->got_spans(spans);
  }
}

void ZmqAgent::span_timer_cb(nsuv::ns_timer*, ZmqAgent* agent) {
  agent->span_msg_cb(nullptr, agent);
}

void ZmqAgent::got_spans(const std::vector<Tracer::SpanStor>& spans) {
  if (spans.empty()) {
    return;
  }

  std::string spans_str = "{\"spans\":[";
  for (const Tracer::SpanStor& stor : spans) {
    json attrs = json::parse(stor.attrs, nullptr, false);
    // stor.attrs must always be a valid JSON
    ASSERT(!attrs.is_discarded() && attrs.is_object());
    for (const std::string& a : stor.extra_attrs) {
      json attr = json::parse(a, nullptr, false);
      // a must always be a valid JSON
      ASSERT(!attr.is_discarded());
      attrs.merge_patch(attr);
    }

    std::string events;
    for (const std::string& event : stor.events) {
      events += event;
      events += ",";
    }

    if (!events.empty()) {
      events.pop_back();
    }

    int r = snprintf(msg_buf_,
                     msg_size_,
                     SPAN_MSG,
                     stor.span_id.c_str(),
                     stor.parent_id.c_str(),
                     stor.trace_id.c_str(),
                     stor.start,
                     stor.end,
                     stor.kind,
                     stor.type,
                     stor.name.c_str(),
                     stor.thread_id,
                     stor.status_msg.c_str(),
                     stor.status_code,
                     attrs.dump().c_str(),
                     events.c_str());
    ASSERT_GT(r, 0);
    if (r >= msg_size_) {
      resize_msg_buffer(r);
      r = snprintf(msg_buf_,
                   msg_size_,
                   SPAN_MSG,
                   stor.span_id.c_str(),
                   stor.parent_id.c_str(),
                   stor.trace_id.c_str(),
                   stor.start,
                   stor.end,
                   stor.kind,
                   stor.type,
                   stor.name.c_str(),
                   stor.thread_id,
                   stor.status_msg.c_str(),
                   stor.status_code,
                   attrs.dump().c_str(),
                   events.c_str());
    }
    ASSERT_LT(r, msg_size_);
    spans_str += msg_buf_;
    spans_str += ",";
  }

  spans_str.pop_back();
  spans_str += "]}";

  send_command_message("tracing", nullptr, spans_str.c_str());
}

void ZmqAgent::cpu_profile_cb(int status,
                              std::string profile,
                              std::tuple<ZmqAgent*, uint64_t>* tup) {
  ZmqAgent* agent = std::get<ZmqAgent*>(*tup);
  // Check if the agent is already closing
  if (agent->cpu_profile_msg_.is_closing()) {
    delete tup;
    return;
  }

  agent->cpu_profile_msg_q_.enqueue({
    status,
    profile,
    std::move(std::get<uint64_t>(*tup))
  });

  ASSERT_EQ(0, agent->cpu_profile_msg_.send());
  // The tuple must be deleted once the stream is done.
  if (profile.length() == 0) {
    delete tup;
  }
}

void ZmqAgent::cpu_profile_msg_cb(nsuv::ns_async*, ZmqAgent* agent) {
  std::tuple<int, std::string, uint64_t> tup;
  while (agent->cpu_profile_msg_q_.dequeue(tup)) {
    agent->got_cpu_profile(std::get<0>(tup),
                           std::get<1>(tup),
                           std::get<2>(tup));
  }
}

std::string ZmqAgent::got_cpu_profile(int status,
                                      const std::string& profile,
                                      uint64_t thread_id) {
  bool profileStreamComplete = profile.length() == 0;
  // get and remove associated data from pending_cpu_profile_data_map_
  auto it = pending_cpu_profile_data_map_.find(thread_id);
  ASSERT(it != pending_cpu_profile_data_map_.end());
  auto tup = it->second;
  if (profileStreamComplete) {
    pending_cpu_profile_data_map_.erase(it);
    nr_profiles_--;
  }
  const std::string& req_id = std::get<std::string>(tup);

  if (profile_on_exit_ && thread_id == 0) {
    // Store the req_id of the main thread profile
    last_main_profile_ = req_id;
  }

  // Don't continue with the exit procedure until all profiles have finished.
  if (exiting_ && pending_cpu_profile_data_map_.empty()) {
    uv_mutex_lock(&stop_lock_);
    uv_cond_signal(&stop_cond_);
    uv_mutex_unlock(&stop_lock_);
  }

  // get start_ts and metadata from pending_cpu_profile_data_map_
  if (status < 0) {
    // Send error message back
    send_error_response(req_id, kProfile, status);
    return req_id;
  }

  // send profile_stop command reponse thru data channel
  // only if the profile is complete
  if (profileStreamComplete) {
    int r = send_command_message("profile_stop", req_id.c_str(), nullptr);
    if (r < 0) {
      return req_id;
    }
  }

  // send profile chunks thru the bulk channel
  if (bulk_handle_) {
    uv_update_time(&loop_);
    auto met = std::get<nlohmann::json>(tup);
    snprintf(msg_buf_,
             msg_size_,
             MSG_3,
             agent_id_.c_str(),
             req_id.c_str(),
             kProfile,
             uv_now(&loop_) - std::get<uint64_t>(tup),
             met.dump().c_str(),
             profileStreamComplete ? "true" : "false",
             thread_id,
             version_);
    bulk_handle_->send(msg_buf_, profile);
  }

  return req_id;
}

int ZmqAgent::start_profiling(const json& message,
                              const std::string& req_id) {
  uint64_t thread_id = 0;

  if (!data_handle_) {
    // Don't send error message back as there's actually no connection
    return UV_ENOTCONN;
  }

  if (pending_cpu_profile_data_map_.find(thread_id) !=
      pending_cpu_profile_data_map_.end()) {
    return send_error_response(req_id, kProfile, UV_EEXIST);
  }

  auto it = message.find("args");
  if (it == message.end() || !it->is_object()) {
    return send_error_response(req_id, kProfile, UV_EINVAL);
  }

  json args = *it;
  it = args.find(kThreadId);
  if (it == args.end() || !it->is_number_unsigned()) {
    return send_error_response(req_id, kProfile, UV_EINVAL);
  }

  thread_id = *it;

  it = args.find(kDuration);
  if (it == args.end() || !it->is_number_unsigned()) {
    return send_error_response(req_id, kProfile, UV_EINVAL);
  }

  uint64_t duration = *it;
  it = args.find(kMetadata);

  json metadata;
  if (it != args.end()) {
    metadata = *it;
  }

  auto tup = new (std::nothrow) std::tuple<ZmqAgent*, uint64_t>(this,
                                                                thread_id);
  if (tup == nullptr) {
    return send_error_response(req_id, kProfile, UV_ENOMEM);
  }

  int err = CpuProfiler::TakeProfile(GetEnvInst(thread_id),
                                     duration,
                                     cpu_profile_cb,
                                     tup);

  if (err != 0) {
    delete tup;
    return send_error_response(req_id, kProfile, err);
  }

  // send profile command reponse thru data channel
  err = send_command_message(kProfile, req_id.c_str(), nullptr);
  if (err < 0) {
    return err;
  }

  uv_update_time(&loop_);
  auto iter = pending_cpu_profile_data_map_.emplace(
    thread_id, std::make_tuple(req_id, std::move(metadata), uv_now(&loop_)));
  ASSERT_NE(iter.second, false);
  nr_profiles_++;

  return 0;
}


int ZmqAgent::stop_profiling(uint64_t thread_id) {
  // This method is only called from the JS thread the profile it's stopping is
  // running so the sync StopProfileSync method can be safely called.
  return CpuProfiler::StopProfileSync(GetEnvInst(thread_id));
}

void ZmqAgent::status_command_cb(SharedEnvInst, ZmqAgent* agent) {
  agent->status_cb_(agent->status());
}

void ZmqAgent::status(const Status& st) {
  if (st != status_) {
    status_ = st;
    if (status_cb_) {
      RunCommand(GetMainEnvInst(),
                 CommandType::EventLoop,
                 status_command_cb,
                 this);
    }
  }
}

ZmqAgent::Status ZmqAgent::calculate_status() const {
  if (command_handle_ == nullptr) {
    ASSERT_NULL(data_handle_.get());
    ASSERT_NULL(bulk_handle_.get());
    return Initializing;
  }

  if (data_handle_ && bulk_handle_) {
    if (command_handle_->connected() &&
        data_handle_->connected() &&
        bulk_handle_->connected()) {
      return Ready;
    } else {
      return Buffering;
    }
  }

  return Connecting;
}

// In this funcion we'll update, if needed, the state of the agent.
// If the status transitions to Ready, send info, packages and
// cached metrics
void ZmqAgent::update_state() {
  Status cur_status = status_;
  status(calculate_status());
  if (status_ != Ready) {
    // clear the list of pending metrics requests
    pending_metrics_reqs_.clear();
  }

  Status new_status = status_;
  if (cur_status != new_status) {
    if (new_status == Ready) {
      // send info
      send_info();
      // send packages
      send_packages();
      // send cached metrics
      if (!cached_metrics_.empty()) {
        send_metrics(cached_metrics_);
      }
    }
  }
}


std::string ZmqAgent::get_auth_url() const {
  Mutex::ScopedLock lock(per_process::env_var_mutex);
  size_t init_sz = 256;
  MaybeStackBuffer<char, 256> val;
  int ret = uv_os_getenv(kNSOLID_AUTH_URL, *val, &init_sz);

  if (ret == UV_ENOBUFS) {
    // Buffer is not large enough, reallocate to the updated init_sz
    // and fetch env value again.
    val.AllocateSufficientStorage(init_sz);
    ret = uv_os_getenv(kNSOLID_AUTH_URL, *val, &init_sz);
  }

  if (ret == 0) {
    return std::string(*val, init_sz);
  }

  return NSOLID_AUTH_URL;
}


int ZmqAgent::validate_reconfigure(const json& in, json& out) const {
  static json allowed_opts = {
    "blockedLoopThreshold",
    kInterval,
    "pauseMetrics",
    "promiseTracking",
    "redactSnapshots",
    "statsd",
    "statsdBucket",
    "statsdTags",
    "tags",
    "tracingEnabled",
    "tracingModulesBlacklist"
  };

  std::string message;
  for (auto it = in.begin(); it != in.end(); ++it) {
    const nlohmann::json& val = it.value();
    const std::string& key = it.key();
    if (key == "blockedLoopThreshold") {
      if (!val.is_number_unsigned()) {
        message = "'blockedLoopThreshold' should be an unsigned int";
        goto send_validation_error;
      }
    } else if (key == kInterval) {
      if (!val.is_number_unsigned()) {
        message = "'interval' should be an unsigned int";
        goto send_validation_error;
      }
    } else if (key == "pauseMetrics") {
      if (!val.is_boolean()) {
        message = "'pauseMetrics' should be a boolean";
        goto send_validation_error;
      }
    } else if (key == "promiseTracking") {
      if (!val.is_boolean()) {
        message = "'promiseTracking' should be a boolean";
        goto send_validation_error;
      }
    } else if (key == "redactSnapshots") {
      if (!val.is_boolean()) {
        message = "'redactSnapshots' should be a boolean";
        goto send_validation_error;
      }
    } else if (key == "statsd") {
      if (!val.is_null()) {
        // Make sure some hostname is always provided if only port was passed.
        if (val.is_number_unsigned()) {
          out[key] = std::string("localhost:") +
                     std::to_string(val.get<uint32_t>());
          continue;
        } else if (!val.is_string()) {
          message = "'statsd' should be a string";
          goto send_validation_error;
        }
      }
    } else if (key == "statsdBucket") {
      if (!val.is_string()) {
        message = "'statsdBucket' should be a string";
        goto send_validation_error;
      }
    } else if (key == "statsdTags") {
      if (!val.is_string()) {
        message = "'statsdTags' should be a string";
        goto send_validation_error;
      }
    } else if (key == "tags") {
      if (!val.is_array()) {
        message = "'tags' should be an array of strings";
        goto send_validation_error;
      }

      for (const auto& el : val) {
        if (!el.is_string()) {
          message = "'tags' should be an array of strings";
          goto send_validation_error;
        }
      }
    } else if (key == "tracingEnabled") {
      if (!val.is_boolean()) {
        message = "'tracingEnabled' should be a boolean";
        goto send_validation_error;
      }
    } else if (key == "tracingModulesBlacklist") {
      if (!val.is_number_unsigned()) {
        message = "'tracingModulesBlacklist' should be an unsigned int";
        goto send_validation_error;
      }
    } else {
      continue;
    }

    out[key] = val;
  }

  return 0;

send_validation_error:
  out = {
    { kMessage, message },
    { kCode, 422 }
  };

  return -1;
}


int ZmqAgent::reconfigure(const nlohmann::json& msg,
                          const std::string& req_id) {
  if (!data_handle_) {
    return UV_ENOTCONN;
  }

  auto it = msg.find("args");
  if (it == msg.end()) {
    return send_command_message(kReconfigure,
                                req_id.c_str(),
                                config_.dump().c_str());
  }

  json jargs = *it;
  // args validation
  json out = json::object();
  if (validate_reconfigure(jargs, out) != 0) {
    ZmqCommandError cmd_error { out[kMessage], out[kCode] };
    return send_error_command_message(req_id, kReconfigure, cmd_error);
  }

  UpdateConfig(out.dump());
  return send_command_message(kReconfigure,
                              req_id.c_str(),
                              GetConfig().c_str());
}

void ZmqAgent::auth() {
  http_client_->auth(auth_url_, saas_, auth_cb, this);
}

void ZmqAgent::handle_auth_response(CURLcode result,
                                    long status,  // NOLINT(runtime/int)
                                    const std::string& body) {
  if (result == CURLE_OK && status == 200) {
    const json keys = json::parse(body, nullptr, false);
    if (keys.is_discarded()) {
      goto error;
    }

    auto it = keys.find("pub");
    if (it == keys.end()) {
      goto error;
    }

    public_key_ = *it;
    it = keys.find("priv");
    if (it == keys.end()) {
      goto error;
    }

    Debug("Valid authentication\n");
    if (auth_retries_ > 0) {
      auth_retries_ = 0;
    }

    private_key_ = *it;

    auto cmd = ZmqCommandHandle::create(*this, config_);
    int ret = std::get<int>(cmd);
    if (ret == 0) {
      command_handle_.reset(std::get<ZmqCommandHandle*>(cmd));
    } else {
      Debug("Error creating ZmqCommandHandle: %d\n", ret);
    }

    return;
  }

error:
  Debug("Error Authenticating. Trying again in %ld ms\n", auth_timer_interval);
  auth_retries_++;
  if (auth_retries_ == MAX_AUTH_RETRIES) {
    fprintf(stderr,
            "N|Solid warning: %s Unable to authenticate, "
            "please verify your network connection!  Continuing to try...\n",
            agent_id_.c_str());
  }

  ASSERT_EQ(0, auth_timer_.start(+[](nsuv::ns_timer*, ZmqAgent* agent) {
    agent->auth();
  }, auth_timer_interval, 0, this));
}

/*static*/
void ZmqAgent::auth_cb(CURLcode result,
                       long status,  // NOLINT(runtime/int)
                       const std::string& body,
                       ZmqAgent* agent) {
  agent->handle_auth_response(result, status, body);
}

int ZmqAgent::reset_command_handle(bool handshake_failed) {
  // If the command handle needs to be restarted, restart the rest.
  command_handle_.reset(nullptr);
  data_handle_.reset(nullptr);
  bulk_handle_.reset(nullptr);
  // Remove the 'negotiated' fields as they only made sense with the previous
  // command endpoint.
  config_.erase(kDataNegotiated);
  config_.erase(kBulkNegotiated);
  // Clear saas_
  saas_.clear();

  auto it = config_.find("saas");
  if (it != config_.end()) {
    saas_ = it->get<std::string>();
    auth();
  } else {
    // Setup curve keypair in case connected to a specific N|Solid Console
    // instance and then create the command handle.
    char public_key[41];
    char private_key[41];
    ASSERT_EQ(0, zmq_curve_keypair(public_key, private_key));
    public_key_ = public_key;
    private_key_ = private_key;
    auto cmd = ZmqCommandHandle::create(*this, config_);
    int ret = std::get<int>(cmd);
    if (ret != 0) {
      return ret;
    }

    command_handle_.reset(std::get<ZmqCommandHandle*>(cmd));
  }

  return 0;
}

void ZmqAgent::resize_msg_buffer(int size) {
  msg_up_.reset(new char[size + 1]);
  msg_buf_ = msg_up_.get();
  msg_size_ = size + 1;
}

ZmqCommandHandleRes ZmqCommandHandle::create(ZmqAgent& agent,
                                             const json& config) {
  std::unique_ptr<ZmqCommandHandle> handle(new ZmqCommandHandle(agent));

  int r;
  r = handle->config(config);
  if (r == 0) {
    r = handle->init();
  }

  return std::make_pair(r == 0 ? handle.release(): nullptr, r);
}

const string_vector ZmqCommandHandle::restart_fields(
    {"/pubkey", "/disableIpv6", "/heartbeat", "/command", "/restart"});

ZmqCommandHandle::ZmqCommandHandle(ZmqAgent& agent)
    : ZmqHandle(agent, ZmqHandle::Command),
      poll_(new nsuv::ns_poll()) {}

ZmqCommandHandle::~ZmqCommandHandle() {
  if (poll_->is_active() && !poll_->is_closing()) {
    poll_->close_and_delete();
  }
}

int ZmqCommandHandle::config(const json& configuration) {
  int r;
  r = ZmqHandle::config(configuration);
  if (r != 0) {
    return r;
  }

  // Subscribe to all messages that start with this agent's id
  std::string agent_prefix("id:" + agent_.agent_id());
  r = socket_->setopt(ZMQ_SUBSCRIBE, agent_prefix.c_str(), agent_prefix.size());
  if (r != 0) {
    return r;
  }
  // Subscribe to config messages
  agent_prefix = "configuration-" + agent_.agent_id();
  r = socket_->setopt(ZMQ_SUBSCRIBE, agent_prefix.c_str(), agent_prefix.size());
  if (r != 0) {
    return r;
  }

  r = socket_->setopt(ZMQ_SUBSCRIBE, "broadcast", 9);
  if (r != 0) {
    return r;
  }

  // We subscribe to this saas channel as way to pass the saas token to the ZMQ
  // proxy. It looks like a hack and it's indeed ugly but gets the work done.
  if (!agent_.saas().empty()) {
    agent_prefix = "saas:" + agent_.agent_id() + ":" + agent_.saas();
    r = socket_->setopt(ZMQ_SUBSCRIBE,
                        agent_prefix.c_str(),
                        agent_prefix.size());
  }

  return r;
}

int ZmqCommandHandle::init() {
  int r = poll_->init_socket(agent_.loop(), socket_->fd());
  if (r != 0) {
    return r;
  }

  r = poll_->start(UV_READABLE, handle_poll_cb, &agent_);
  if (r != 0) {
    return r;
  }

  return ZmqHandle::init(agent_.loop());
}

void ZmqCommandHandle::handle_poll_cb(nsuv::ns_poll*,
                                      int status,
                                      int events,
                                      ZmqAgent* agent) {
  const ZmqCommandHandle& cmd_handle(*agent->command_handle());
  void* handle = cmd_handle.socket_->handle();
  // Process all messages until empty.  When that happens the zmq_msg_recv
  // call will return EAGAIN triggering a return. ZMQ guarantees this will
  // not happen partially through a multipart message.
  zmq_msg_t msg;
  while (true) {
    int rc;

    std::string complete_payload;
    int segment_num = 0;

    // Read all parts of a message before processing it.  ZMQ guarantees
    // atomic delivery so all parts will be available immediately.
    do {
      // The msg structure must be initialized by zmq
      rc = zmq_msg_init(&msg);
      ASSERT_EQ(rc, 0);

      while (true) {
        rc = zmq_msg_recv(&msg, handle, ZMQ_DONTWAIT);
        if (rc < 0) {
          int err = zmq_errno();
          ASSERT_EQ(0, zmq_msg_close(&msg));
          if (err == EINTR)
            continue;

          // This means the socket has no more data available and we are
          // finished
          if (err == EAGAIN)
            return;

          Debug("zmq_msg_recv error: %s\n", zmq_strerror(zmq_errno()));
          return;
        }
        break;
      }

      // Append the chunk to the accumulated string, but skip
      // the first segment because that's the subscription
      if (segment_num++) {
        complete_payload += std::string(static_cast<char*>(zmq_msg_data(&msg)),
                                        zmq_msg_size(&msg));
      }

      ASSERT_EQ(0, zmq_msg_close(&msg));
    } while (zmq_msg_more(&msg));

    agent->command_handler(complete_payload);
  }
}

ZmqDataHandleRes ZmqDataHandle::create(ZmqAgent& agent,
                                       const json& config) {
  std::unique_ptr<ZmqDataHandle> handle(new ZmqDataHandle(agent));
  int r = handle->config(config);
  if (r == 0) {
    r = handle->init(agent.loop());
  }

  return std::make_pair(r == 0 ? handle.release(): nullptr, r);
}

const string_vector ZmqDataHandle::restart_fields({"/pubkey",
                                                   "/disableIpv6",
                                                   "/heartbeat",
                                                   "/data",
                                                   "/data_negotiated",
                                                   "/HWM"});

ZmqDataHandle::ZmqDataHandle(ZmqAgent& agent)
    : ZmqHandle(agent, ZmqHandle::Data) {}

int ZmqDataHandle::config(const json& configuration) {
  int ret;
  ret = ZmqHandle::config(configuration);
  if (ret != 0) {
    return ret;
  }

  auto it = configuration.find("HWM");
  if (it != configuration.end()) {
    int hwm = *it;
    ret = zmq_setsockopt(socket_->handle(), ZMQ_SNDHWM, &hwm, sizeof(hwm));
    if (ret != 0) {
      return zmq_errno();
    }
  }

  return 0;
}

int ZmqDataHandle::send(const std::string& data) {
  return send(data.c_str(), data.length());
}

int ZmqDataHandle::send(const char* data, size_t size) {
  int r;
  while (true) {
    r = zmq_send(socket_->handle(), data, size, ZMQ_DONTWAIT);
    if (r == -1 && zmq_errno() == EINTR) {
      // yield to avoid this tight loop to block other threads
      std::this_thread::yield();
    } else {
      break;
    }
  }

  Debug("[data] Sent: '%s'. Res: %d\n", data, r);
  return r;
}

ZmqBulkHandleRes ZmqBulkHandle::create(ZmqAgent& agent,
                                       const json& config) {
  std::unique_ptr<ZmqBulkHandle> handle(new ZmqBulkHandle(agent));

  int r;
  r = handle->config(config);
  if (r == 0) {
    r = handle->init();
  }

  return std::make_pair(r == 0 ? handle.release(): nullptr, r);
}

const string_vector ZmqBulkHandle::restart_fields({"/pubkey",
                                                   "/disableIpv6",
                                                   "/heartbeat",
                                                   "/bulk",
                                                   "/bulk_negotiated",
                                                   "/bulkHWM"});

void ZmqBulkHandle::send_data_timer_cb(nsuv::ns_timer*, ZmqBulkHandle* bulk) {
  // keep sending until it fails
  int r;
  do {
    r = bulk->do_send();
  } while (r >= 0);
}

ZmqBulkHandle::ZmqBulkHandle(ZmqAgent& agent)
    : ZmqHandle(agent, ZmqHandle::Bulk),
      timer_(new nsuv::ns_timer()) {}

ZmqBulkHandle::~ZmqBulkHandle() {
  if (timer_->is_active()) {
    if (!timer_->is_closing()) {
      timer_->close_and_delete();
    }
  } else {
    delete timer_;
  }
}

int ZmqBulkHandle::init() {
  int r = timer_->init(agent_.loop());
  if (r != 0) {
    return r;
  }

  r = timer_->start(send_data_timer_cb, 250, 250, this);
  if (r != 0) {
    return r;
  }

  return ZmqHandle::init(agent_.loop());
}

int ZmqBulkHandle::config(const json& configuration) {
  int ret;
  ret = ZmqHandle::config(configuration);
  if (ret != 0) {
    return ret;
  }

  auto it = configuration.find("bulkHWM");
  if (it != configuration.end()) {
    int hwm = *it;
    ret = zmq_setsockopt(socket_->handle(), ZMQ_SNDHWM, &hwm, sizeof(hwm));
    if (ret != 0) {
      return zmq_errno();
    }
  }

  return 0;
}

int ZmqBulkHandle::send(const std::string& envelope,
                        const std::string& payload) {
  data_buffer_.push_back({ envelope, payload });
  return do_send();
}

int ZmqBulkHandle::do_send() {
  int r = -1;
  auto it = data_buffer_.begin();
  if (it == data_buffer_.end()) {
    return UV_ENOENT;
  }

  // First, send the envelope
  while (r == -1) {
    r = zmq_send(socket_->handle(),
                 std::get<0>(*it).c_str(),
                 std::get<0>(*it).length(),
                 ZMQ_SNDMORE | ZMQ_DONTWAIT);
    if (r == -1) {
      if (zmq_errno() == EINTR) {
        // yield to avoid this tight loop to block other threads
        std::this_thread::yield();
      } else {
        return r;
      }
    }
  }

  r = -1;
  while (r == -1) {
    r = zmq_send(socket_->handle(),
                 std::get<1>(*it).c_str(),
                 std::get<1>(*it).length(),
                 ZMQ_DONTWAIT);
    if (r == -1) {
      if (zmq_errno() == EINTR) {
        // yield to avoid this tight loop to block other threads
        std::this_thread::yield();
      } else {
        return r;
      }
    }
  }

  data_buffer_.erase(it);
  return r;
}
}  // namespace nsolid
}  // namespace node
