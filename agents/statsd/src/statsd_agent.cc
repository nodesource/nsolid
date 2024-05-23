#include <openssl/sha.h>
#include <regex>  // NOLINT(build/c++11)
#include <thread>  // NOLINT(build/c++11)
#include <tuple>
#include <utility>

#include "statsd_agent.h"
#include "debug_utils-inl.h"
#include "statsd_endpoint.h"
#include "utils.h"


#define UDP_PACKET_MAX_BYTES 1400

static const char def_bucket[] = "nsolid.${env}.${app}.${hostname}.${shortId}";

namespace node {
namespace nsolid {
namespace statsd {

using nlohmann::json;
using string_vector = std::vector<std::string>;
using udp_req_data_tup = std::tuple<string_vector*, bool>;

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_STATSD_AGENT,
                     std::forward<Args>(args)...);
}


inline void DebugJSON(const char* str, const json& msg) {
  if (UNLIKELY(per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_STATSD_AGENT))) {
    Debug(str, msg.dump(4).c_str());
  }
}


StatsDTcp::StatsDTcp(uv_loop_t* loop,
                     nsuv::ns_async* update_state_msg)
  : loop_(loop),
    update_state_msg_(update_state_msg),
    status_(Initial),
    internal_state_(0) {
  ASSERT_EQ(0, addr_str_lock_.init());
  write_req_.set_data(nullptr);
}

StatsDTcp::~StatsDTcp() {
  addr_str_lock_.destroy();
  // Make sure close_and_delete() is always called before the destructor is
  // called.
  ASSERT_NULL(retry_timer_);
  ASSERT_NULL(tcp_);
}

void StatsDTcp::close_and_delete() {
  // It is technically possible to call close_and_delete() before calling
  // setup(), so need to make sure tcp_ is available.
  if (tcp_) {
    tcp_->close_and_delete();
    tcp_ = nullptr;
  }
  if (retry_timer_) {
    retry_timer_->close_and_delete();
    retry_timer_ = nullptr;
  }

  if (internal_state_ == 0) {
    delete this;
    return;
  }

  internal_state_ |= kClosing;
}

void StatsDTcp::status(const StatsDTcp::Status& status) {
  status_ = status;
  ASSERT_EQ(0, update_state_msg_->send());
}

int StatsDTcp::write(const string_vector& messages) {
  int r;

  if (messages.empty()) {
    return UV_EINVAL;
  }

  if (status_ != Connected) {
    return UV_ENOTCONN;
  }

  auto* req = new nsuv::ns_write<nsuv::ns_tcp>();
  auto* sv = new string_vector(messages);
  std::vector<uv_buf_t> bufs;
  for (auto it = sv->begin(); it != sv->end(); ++it) {
    bufs.push_back(uv_buf_init(const_cast<char*>((*it).c_str()),
                                                 (*it).length()));
  }

  r = tcp_->write(req, bufs, write_cb_, this);
  if (r < 0) {
    delete req;
    delete sv;
    Debug("Error: '%s' writing. Reconnecting...\n", uv_err_name(r));
    prep_retry_timer_();
    connect_();
  }

  internal_state_ |= kWriting;
  req->set_data(sv);
  return r;
}

void StatsDTcp::setup(StatsDEndpoint* endpoint) {
  ASSERT_NOT_NULL(endpoint);

  // If setup() is called while the instance is still attempting to connect,
  // then the instance can already exist.
  if (retry_timer_) {
    USE(retry_timer_->stop());
  }

  if (tcp_ != nullptr) {
    tcp_->close_and_delete();
  }
  tcp_ = new nsuv::ns_tcp();
  ASSERT_EQ(0, tcp_->init(loop_));

  endpoint_.reset(endpoint);
  addr_index_ = 0;
  connect_();
}

void StatsDTcp::connect_cb_(nsuv::ns_connect<nsuv::ns_tcp>* req,
                            int status,
                            StatsDTcp* tcp) {
  tcp->internal_state_ &= ~kConnecting;
  if (tcp->internal_state_ & kClosing) {
    tcp->do_delete();
    return;
  }

  if (status == 0) {
#ifdef DEBUG
    Debug("Successfully connected to : %s\n",
          addr_to_string(req->sockaddr()).c_str());
#endif
    tcp->status(Connected);
    if (tcp->retry_timer_) {
      tcp->retry_timer_->close_and_delete();
      tcp->retry_timer_ = nullptr;
    }
    return;
  }

#ifdef DEBUG
  if (status != 0) {
    // connection error. Try w/ the next address
    Debug("Error '%s' connecting to: %s. Trying with the next address...\n",
          uv_err_name(status), addr_to_string(req->sockaddr()).c_str());
  }
#endif

  tcp->addr_str("");
  if (++tcp->addr_index_ < tcp->endpoint_->addresses().size()) {
    tcp->connect_();
    return;
  }

  tcp->prep_retry_timer_();
  tcp->retry_after_fail_();
}

void StatsDTcp::write_cb_(nsuv::ns_write<nsuv::ns_tcp>* req,
                          int status,
                          StatsDTcp* tcp) {
  string_vector* sv = req->get_data<string_vector>();
  ASSERT_NOT_NULL(sv);
  delete sv;
  delete req;

  tcp->internal_state_ &= ~kWriting;
  if (tcp->internal_state_ & kClosing) {
    tcp->do_delete();
    return;
  }

  if (status < 0) {
    tcp->addr_str("");
    Debug("Error: '%s' writing. Reconnecting...\n", uv_err_name(status));
    tcp->connect_();
  }
}

void StatsDTcp::retry_timer_cb_(nsuv::ns_timer* timer, StatsDTcp* tcp) {
  // tcp should always be valid if this callback is called, since there
  // shouldn't be any multi-threaded resource management for this class.
  tcp->connect_();
}

void StatsDTcp::prep_retry_timer_() {
  if (retry_timer_ == nullptr) {
    retry_timer_ = new nsuv::ns_timer();
    ASSERT_EQ(0, retry_timer_->init(loop_));
  } else {
    USE(retry_timer_->stop());
  }
}

void StatsDTcp::retry_after_fail_() {
  Debug("Error connecting to all addresses. Retry in 3 seconds...\n");
  // All addresses have been attempted.
  status(ConnectionError);
  // Reattempt all IP addresses after 3 seconds.
  addr_index_ = 0;
  ASSERT_EQ(0, retry_timer_->start(retry_timer_cb_, 3000, 0, this));
}

void StatsDTcp::connect_() {
  auto* ss = &endpoint_->addresses()[addr_index_];
  const struct sockaddr* addr = reinterpret_cast<const struct sockaddr*>(ss);
  addr_str("");
  status(Connecting);

#ifdef DEBUG
  Debug("Connecting to: tcp://%s\n", addr_to_string(addr).c_str());
#endif

  int r = tcp_->connect(&connect_req_, addr, connect_cb_, this);
  if (r == 0) {
    addr_str(addr_to_string(addr));
    internal_state_ |= kConnecting;
    return;
  }

  prep_retry_timer_();

  if (++addr_index_ >= endpoint_->addresses().size()) {
    retry_after_fail_();
    return;
  }

#ifdef DEBUG
  // connection error. Try w/ the next address
  Debug("Error '%s' connecting to: %s. Trying with the next address...\n",
        uv_err_name(r), addr_to_string(addr).c_str());
#endif
  // Move on to the next address and try again.
  ASSERT_EQ(0, retry_timer_->start(retry_timer_cb_, 100, 0, this));
}


StatsDUdp::StatsDUdp(uv_loop_t* loop,
                     nsuv::ns_async* update_state_msg)
  : loop_(loop),
    update_state_msg_(update_state_msg),
    status_(Initial) {
  ASSERT_EQ(0, addr_str_lock_.init());
}

StatsDUdp::~StatsDUdp() {
  addr_str_lock_.destroy();
  udp_->close_and_delete();
  if (retry_timer_) {
    retry_timer_->close_and_delete();
  }
}

int StatsDUdp::write(const string_vector& messages) {
  int r;

  if (messages.empty()) {
    return UV_EINVAL;
  }

  if (status_ != Connected) {
    return UV_ENOTCONN;
  }

  nsuv::ns_udp_send* req = nullptr;
  udp_req_data_tup* req_data = nullptr;
  udp_req_data_tup* last_req_data = nullptr;
  bool data_sent = false;
  std::vector<uv_buf_t> bufs;
  auto* sv = new (std::nothrow) string_vector(messages);
  if (sv == nullptr) {
    return UV_ENOMEM;
  }

  auto do_send = [&]() -> int {
    req = new (std::nothrow) nsuv::ns_udp_send();
    if (req == nullptr) {
      return UV_ENOMEM;
    }

    req_data = new (std::nothrow) udp_req_data_tup({ sv, false });
    if (req_data == nullptr) {
      return UV_ENOMEM;
    }

    req->set_data(req_data);

    return udp_->send(req, bufs, nullptr, write_cb_, this);
  };

  size_t dgram_size = 0;
  for (auto& line : *sv) {
    if (dgram_size + line.length() > UDP_PACKET_MAX_BYTES) {
      r = do_send();
      if (r < 0) {
        goto cleanup_and_error;
      }

      last_req_data = req_data;
      req_data = nullptr;
      data_sent = true;

      bufs.clear();
      dgram_size = 0;
    }

    bufs.push_back(uv_buf_init(const_cast<char*>(line.c_str()), line.length()));
    dgram_size += line.length();
  }

  r = do_send();
  if (r < 0) {
    goto cleanup_and_error;
  } else {
    // mark the last datagram
    std::get<bool>(*req_data) = true;
    return r;
  }

cleanup_and_error:
  delete req_data;
  delete req;
  // If there was no data sent, delete the string_vector, otherwise, mark the
  // last successfully sent data as the 'last' datagram
  if (data_sent == false) {
    delete sv;
  } else if (last_req_data != nullptr) {
    std::get<bool>(*last_req_data) = true;
  }

  return r;
}

void StatsDUdp::setup(StatsDEndpoint* endpoint) {
  ASSERT_NOT_NULL(endpoint);

  // If setup() is called while the instance is still attempting to connect,
  // then the instance can already exist.
  if (retry_timer_) {
    USE(retry_timer_->stop());
  }

  if (udp_ != nullptr) {
    udp_->close_and_delete();
  }
  udp_ = new nsuv::ns_udp();
  ASSERT_EQ(0, udp_->init(loop_));

  endpoint_.reset(endpoint);
  addr_index_ = 0;
  connect_();
}

void StatsDUdp::write_cb_(nsuv::ns_udp_send* req, int status, StatsDUdp* udp) {
  if (status < 0) {
    struct sockaddr_storage ss;
    struct sockaddr* addr = reinterpret_cast<struct sockaddr*>(&ss);
    int len = sizeof(ss);
    int r = uv_udp_getpeername(req->handle(), addr, &len);
    if (r == 0) {
      Debug("Error '%s' sending data to: %s.\n",
            uv_err_name(status), addr_to_string(addr).c_str());
    } else {
      Debug("Error '%s' sending data to\n", uv_err_name(status));
    }
  }

  udp_req_data_tup* req_data = req->get_data<udp_req_data_tup>();
  ASSERT_NOT_NULL(req_data);
  // only delete the string vector if it's the last datagram
  if (std::get<1>(*req_data) == true) {
    delete std::get<string_vector*>(*req_data);
  }

  delete req_data;
  delete req;
}

void StatsDUdp::retry_timer_cb_(nsuv::ns_timer*, StatsDUdp* udp) {
  // udp should always be valid if this callback is called, since there
  // shouldn't be any multi-threaded resource management for this class.
  udp->connect_();
}

void StatsDUdp::prep_retry_timer_() {
  if (retry_timer_ == nullptr) {
    retry_timer_ = new nsuv::ns_timer();
    ASSERT_EQ(0, retry_timer_->init(loop_));
  } else {
    USE(retry_timer_->stop());
  }
}

void StatsDUdp::connect_() {
  auto* ss = &endpoint_->addresses()[addr_index_];
  const struct sockaddr* addr = reinterpret_cast<const struct sockaddr*>(ss);
  status(Connecting);

#ifdef DEBUG
  Debug("Connecting to: udp://%s\n", addr_to_string(addr).c_str());
#endif

  int r = udp_->connect(addr);
  if (r == 0) {
    addr_str(addr_to_string(addr));
    status(Connected);
    if (retry_timer_) {
      retry_timer_->close_and_delete();
      retry_timer_ = nullptr;
    }
    return;
  }

  prep_retry_timer_();

  if (++addr_index_ > endpoint_->addresses().size()) {
    Debug("Error connecting to all addresses. Retry in 3 seconds...\n");
    status(ConnectionError);
    // Reattempt all IP addresses after 3 seconds.
    addr_index_ = 0;
    ASSERT_EQ(0, retry_timer_->start(retry_timer_cb_, 3000, 0, this));
    return;
  }

#ifdef DEBUG
  // connection error. Try w/ the next address
  Debug("Error '%s' connecting to: udp://%s. Trying with the next address\n",
        uv_err_name(r), addr_to_string(addr).c_str());
#endif
  ASSERT_EQ(0, retry_timer_->start(retry_timer_cb_, 100, 0, this));
}


SharedStatsDAgent StatsDAgent::Inst() {
  static SharedStatsDAgent agent(new StatsDAgent(), [](StatsDAgent* agent) {
    delete agent;
  });
  return agent;
}

StatsDAgent::StatsDAgent(): hooks_init_(false),
                            proc_metrics_(),
                            config_(default_agent_config),
                            status_(Unconfigured),
                            bucket_(),
                            tags_(),
                            status_cb_(nullptr) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
  ASSERT_EQ(0, bucket_lock_.init(true));
  ASSERT_EQ(0, tags_lock_.init(true));
  ASSERT_EQ(0, stop_lock_.init(true));
}

StatsDAgent::~StatsDAgent() {
  int r;

  if (status_ != Unconfigured) {
    if (utils::are_threads_equal(thread_.base(), uv_thread_self())) {
      do_stop();
    } else {
      ASSERT_EQ(0, shutdown_.send());
      ASSERT_EQ(0, thread_.join());
    }
  }

  uv_mutex_destroy(&start_lock_);
  uv_cond_destroy(&start_cond_);
  // The destructor will be called from the main thread, being StatsDAgent a
  // static singleton, and it may happen that the StatsD thread is exiting while
  // this happens. Wait until the StatsD thread exists.
  while ((r = uv_loop_close(&loop_)) != 0) {
    ASSERT_EQ(r, UV_EBUSY);
    uv_run(&loop_, UV_RUN_ONCE);
  }
}

int StatsDAgent::start() {
  int r = 0;
  if (status_ == Unconfigured) {
    // This method is not thread-safe and it's supposed to be called only from
    // the NSolid thread, so it's safe to use this lock after having checked
    // the status_ variable as there won't be any concurrent calls.
    uv_mutex_lock(&start_lock_);
    r = thread_.create(run_, weak_from_this());
    if (r == 0) {
      while (status_ == Unconfigured) {
        uv_cond_wait(&start_cond_, &start_lock_);
      }
    }

    uv_mutex_unlock(&start_lock_);
  }
  return r;
}

void StatsDAgent::do_start() {
  uv_mutex_lock(&start_lock_);

  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb_, weak_from_this()));

  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb, weak_from_this()));

  ASSERT_EQ(0, metrics_msg_.init(&loop_, metrics_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, update_state_msg_.init(&loop_,
                                      update_state_msg_cb_,
                                      weak_from_this()));

  ASSERT_EQ(0, send_stats_msg_.init(&loop_,
                                    send_stats_msg_cb_,
                                    weak_from_this()));

  ASSERT_EQ(0, metrics_timer_.init(&loop_));

  status(Initializing);

  if (hooks_init_ == false) {
    ASSERT_EQ(0, OnConfigurationHook(config_agent_cb, weak_from_this()));
    ASSERT_EQ(0, ThreadAddedHook(env_creation_cb, weak_from_this()));
    ASSERT_EQ(0, ThreadRemovedHook(env_deletion_cb, weak_from_this()));
    hooks_init_ = true;
  }

  uv_cond_signal(&start_cond_);
  uv_mutex_unlock(&start_lock_);
}

void StatsDAgent::do_stop() {
  {
    nsuv::ns_rwlock::scoped_wrlock lock(stop_lock_);
    status(Unconfigured);
  }
  if (connection_) {
    connection_->close_and_delete();
    connection_ = nullptr;
  }
  send_stats_msg_.close();
  update_state_msg_.close();
  config_msg_.close();
  metrics_msg_.close();
  env_msg_.close();
  shutdown_.close();
  metrics_timer_.close();
}

void StatsDAgent::run_(nsuv::ns_thread*, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->do_start();
  do {
    ASSERT_EQ(0, uv_run(&agent->loop_, UV_RUN_DEFAULT));
  } while (uv_loop_alive(&agent->loop_));
}

void StatsDAgent::env_creation_cb(SharedEnvInst envinst,
                                  WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, true });
  ASSERT_EQ(0, agent->env_msg_.send());
}

void StatsDAgent::env_deletion_cb(SharedEnvInst envinst,
                                  WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  uint64_t thread_id = GetThreadId(envinst);

  // If the main thread is gone, StatsDAgent is already gone, so return
  // immediately to avoiding a possible crash.
  if (thread_id == 0) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, false });
  if (!agent->env_msg_.is_closing()) {
    ASSERT_EQ(0, agent->env_msg_.send());
  }
}

void StatsDAgent::env_msg_cb(nsuv::ns_async*, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  std::tuple<SharedEnvInst, bool> tup;
  while (agent->env_msg_q_.dequeue(tup)) {
    SharedEnvInst envinst = std::get<0>(tup);
    bool creation = std::get<1>(tup);
    if (creation) {
      auto pair = agent->env_metrics_map_.emplace(
        GetThreadId(envinst), ThreadMetrics::Create(envinst));
      ASSERT(pair.second);
    } else {
      ASSERT_EQ(1, agent->env_metrics_map_.erase(GetThreadId(envinst)));
    }
  }
}

void StatsDAgent::shutdown_cb_(nsuv::ns_async*, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->do_stop();
}

void StatsDAgent::metrics_msg_cb_(nsuv::ns_async*, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  ThreadMetrics::MetricsStor stor;
  while (agent->metrics_msg_q_.dequeue(stor)) {
    json body = {
#define V(Type, CName, JSName, MType, Unit) \
      { #JSName, stor.CName },
      NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
    };

    agent->send_metrics(body, stor.thread_id, stor.thread_name.c_str());
  }
}

// Callback to be registered in nsolid API
void StatsDAgent::config_agent_cb(std::string config,
                                  WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  json cfg = json::parse(config, nullptr, false);
  // assert because the runtime should never send me an invalid JSON config
  ASSERT(!cfg.is_discarded());
  agent->config_msg_q_.enqueue(cfg);
  ASSERT_EQ(0, agent->config_msg_.send());
}

void StatsDAgent::config_msg_cb_(nsuv::ns_async*, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  int r = 0;
  json config_msg;

  while (agent->config_msg_q_.dequeue(config_msg)) {
    r = agent->config(config_msg);
    if (agent->status_ != Unconfigured) {
      ASSERT_EQ(0, agent->update_state_msg_.send());
    }
  }

  if (r != 0) {
    agent->do_stop();
  }
}

void StatsDAgent::update_state_msg_cb_(nsuv::ns_async*,
                                       WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  agent->status(agent->calculate_status());
}

void StatsDAgent::send_stats_msg_cb_(nsuv::ns_async*,
                                     WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  string_vector sv;
  while (agent->send_stats_msg_q_.dequeue(sv)) {
    agent->connection_->write(sv);
  }
}

int StatsDAgent::send(const std::vector<std::string>& sv, size_t len) {
  send_stats_msg_q_.enqueue(sv);
  return send_stats_msg_.send();
}

std::string StatsDAgent::status() const {
  switch (status_) {
#define X(type, str)                                                         \
  case StatsDAgent::type:                                                    \
  {                                                                          \
    return str;                                                              \
  }
  AGENT_STATUS(X)
#undef X
  default:
    ASSERT(false);
  }
}

const std::string StatsDAgent::tcp_ip() {
  if (!connection_ ||
      connection_->endpoint()->type() != StatsDEndpoint::Type::Tcp)
    return std::string();
  return connection_->addr_str();
}

const std::string StatsDAgent::udp_ip() {
  if (!connection_ ||
      connection_->endpoint()->type() != StatsDEndpoint::Type::Udp)
    return std::string();
  return connection_->addr_str();
}

void StatsDAgent::set_status_cb(status_cb cb) {
  // For testing purposes only, it should only be called once
  ASSERT_NULL(status_cb_);
  status_cb_ = cb;
}

int StatsDAgent::setup_metrics_timer(uint64_t period) {
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

  return metrics_timer_.start(metrics_timer_cb_,
                              period,
                              period,
                              weak_from_this());
}

int StatsDAgent::config_handles() {
  auto it = config_.find("statsd");

  if (it == config_.end()) {
    Debug("No statsd configuration. Stopping the agent\n");
    config_ = default_agent_config;
    return UV_EINVAL;
  }

  // parse the endpoint and then create the corresponding handle
  const std::string statsd = *it;
  auto endpoint = StatsDEndpoint::create(statsd);
  if (endpoint == nullptr) {
    // print some kind of error here
    Debug("Invalid endpoint: '%s'. Stopping the agent\n", statsd.c_str());
    config_ = default_agent_config;
    return UV_EINVAL;
  }

  if (connection_) {
    connection_->close_and_delete();
    connection_ = nullptr;
  }

  if (endpoint->protocol() == "tcp") {
    connection_ = new StatsDTcp(&loop_, &update_state_msg_);
    connection_->setup(endpoint);
  } else if (endpoint->protocol() == "udp") {
    connection_ = new StatsDUdp(&loop_, &update_state_msg_);
    connection_->setup(endpoint);
  } else {
    abort();  // UNREACHABLE
  }

  return 0;
}

#define STATSD_BUCKET_REGEX_REPLACE(X)                                         \
  X(env, "env")                                                                \
  X(app, "app")                                                                \
  X(hostname, "hostname")

std::string StatsDAgent::calculate_bucket(const std::string& tpl) const {
  std::string str(tpl);
#define X(tpl_v, config_v)                                                     \
  {                                                                            \
    auto it = config_.find(config_v);                                          \
    if (it != config_.end()) {                                                 \
      std::string val = it->is_string() ? it->get<std::string>() : "";         \
      str = std::regex_replace(                                                \
        str,                                                                   \
        std::regex("\\$\\{" #tpl_v "\\}", std::regex::icase),                  \
        std::regex_replace(val, std::regex("\\."),  "-"));                     \
    }                                                                          \
  }
  STATSD_BUCKET_REGEX_REPLACE(X)
#undef X
  const std::string id = GetAgentId();
  str = std::regex_replace(
    str,
    std::regex("\\$\\{id\\}", std::regex::icase),
    id);
  str = std::regex_replace(
    str,
    std::regex("\\$\\{shortId\\}", std::regex::icase),
    id.substr(0, 7));

  return str;
}

std::string StatsDAgent::calculate_tags(const std::string& tpl) const {
  std::string str(calculate_bucket(tpl));
  auto it = config_.find("tags");
  if (it != config_.end()) {
    ASSERT(it->is_array());
    str = std::regex_replace(str,
                             std::regex("\\$\\{tags\\}", std::regex::icase),
                             vec_join(*it, ","));
  }

  return "|#" + std::regex_replace(str, std::regex("\\."),  "-");
}

void StatsDAgent::config_bucket() {
  auto it = config_.find("statsdBucket");
  {
    nsuv::ns_mutex::scoped_lock lock(&bucket_lock_);
    bucket_ = calculate_bucket(it != config_.end() ?
                               it->get<std::string>() :
                               def_bucket);
  }
}

void StatsDAgent::config_tags() {
  auto it = config_.find("statsdTags");
  {
    nsuv::ns_mutex::scoped_lock lock(&tags_lock_);
    if (it == config_.end()) {
      tags_ = "";
    } else {
      tags_ = calculate_tags(*it);
    }
  }
}

int StatsDAgent::config(const json& config) {
  int ret;

  json old_config = config_;
  config_ = config;
  json diff = json::diff(old_config, config_);
  DebugJSON("Old Config: \n%s\n", old_config);
  DebugJSON("NewConfig: \n%s\n", config_);
  DebugJSON("Diff: \n%s\n", diff);
  if (utils::find_any_fields_in_diff(diff, { "/statsd" })) {
    // if "statsd" changed, reset the corresponding handle
    ret = config_handles();
    if (ret != 0) {
      // TODO(trevnorris): Should this return early, or still continue
      // processing the other config changes?
      return ret;
    }
  }

  if (bucket().empty() ||
      utils::find_any_fields_in_diff(diff, { "/statsdBucket",
                                             "/statsdTags" })) {
    config_bucket();
    // if "statsdTags" changed, recalculate tags_
    config_tags();
  }

  // If metrics timer is not active or if the diff contains metrics fields,
  // recalculate the metrics status. (stop/start/what period)
  if (!metrics_timer_.is_active() ||
      utils::find_any_fields_in_diff(diff, { "/interval", "/pauseMetrics" })) {
    uint64_t period = 0;
    auto it = config_.find("pauseMetrics");
    if (it != config_.end()) {
      bool pause = *it;
      if (!pause) {
        it = config_.find("interval");
        if (it != config_.end()) {
          period = *it;
        }
      }
    }

    return setup_metrics_timer(period);
  }

  return 0;
}

void StatsDAgent::metrics_timer_cb_(nsuv::ns_timer*, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  ProcessMetrics::MetricsStor proc_stor;

  // Retrieve metrics from every thread
  for (auto it = agent->env_metrics_map_.begin();
       it != agent->env_metrics_map_.end();
       ++it) {
    SharedThreadMetrics& e_metrics = std::get<1>(*it);
    // Retrieve metrics from the Metrics API. Ignore any return error since
    // there's nothing to be done.
    e_metrics->Update(env_metrics_cb_, agent);
  }

  // Get and send proc metrics
  ASSERT_EQ(0, agent->proc_metrics_.Update());
  proc_stor = agent->proc_metrics_.Get();
  json body = {
#define V(Type, CName, JSName, MType, Unit) \
    { #JSName, proc_stor.CName },
    NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V
  };

  agent->send_metrics(body);
}

void StatsDAgent::env_metrics_cb_(SharedThreadMetrics metrics,
                                  WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  if (agent->status_ == Unconfigured) {
    return;
  }

  agent->metrics_msg_q_.enqueue(metrics->Get());
  ASSERT_EQ(0, agent->metrics_msg_.send());
}

int StatsDAgent::send_metrics(const json& metrics,
                              uint64_t thread_id,
                              const char* thread_name) {
  if (status_.load() != Ready) {
    Debug("Not sending metrics because agent not ready\n");
    return -1;
  }

  ASSERT_NOT_NULL(connection_);
  Debug("send_metrics: \t%s\n", metrics.dump(4).c_str());
  // stringify metrics
  string_vector serialized_metrics;
  std::string tags = tags_;
  if (thread_id != static_cast<uint64_t>(-1)) {
    if (tags.length() == 0) {
      tags = "|#";
    } else {
      tags += ",";
    }

    tags += "threadId:" + std::to_string(thread_id);
    if (thread_name && strlen(thread_name)) {
      tags += ",threadName:" + std::string(thread_name);
    }
  }

  for (const auto& item : metrics.items()) {
    std::string key = item.key();
    if (key != "user" && key != "title") {
      serialized_metrics.push_back(
        bucket_ + "." + key + ":" + item.value().dump() + "|g" + tags + "\n");
    }
  }

  return connection_->write(serialized_metrics);
}

void StatsDAgent::status_command_cb_(SharedEnvInst, WeakStatsDAgent agent_wp) {
  SharedStatsDAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->status_cb_(agent->status());
}

void StatsDAgent::status(const Status& st) {
  if (st != status_) {
    status_ = st;
    if (status_cb_) {
      RunCommand(GetEnvInst(EnvList::Inst()->main_thread_id()),
                 CommandType::EventLoop,
                 status_command_cb_,
                 weak_from_this());
    }
  }
}

StatsDAgent::Status StatsDAgent::calculate_status() const {
  if (connection_ == nullptr) {
    return Initializing;
  }

  if (connection_->status() != StatsDConnection::Connected) {
    return Connecting;
  }

  return Ready;
}

}  // namespace statsd
}  // namespace nsolid
}  // namespace node
