#include "grpc_agent.h"

#include <grpcpp/create_channel.h>

#include "asserts-cpp/asserts.h"
#include "debug_utils-inl.h"

namespace node {
namespace nsolid {
namespace grpc {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_GRPC_AGENT,
                     std::forward<Args>(args)...);
}


inline void DebugJSON(const char* str, const json& msg) {
  if (UNLIKELY(per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_GRPC_AGENT))) {
    Debug(str, msg.dump(4).c_str());
  }
}

static grpcagent::InfoResponse* CreateInfoResponse(const std::string& processInfo, const char* req_id) {
  nlohmann::json info = json::parse(processInfo.c_str(), nullptr, false);
  ASSERT(!info.is_discarded());

  grpcagent::InfoResponse* info_response = new grpcagent::InfoResponse();

  // Fill in the fields of the InfoResponse.
  grpcagent::CommonResponse* common = new grpcagent::CommonResponse();
  common->set_agentid(GetAgentId());
  if (req_id) {
    common->set_requestid(req_id);
  }

  common->set_command("info");

  grpcagent::InfoBody* body = new grpcagent::InfoBody();
  body->set_app(info["app"].get<std::string>());
  body->set_arch(info["arch"].get<std::string>());
  body->set_cpucores(info["cpuCores"].get<uint32_t>());
  body->set_cpumodel(info["cpuModel"].get<std::string>());
  body->set_execpath(info["execPath"].get<std::string>());
  body->set_hostname(info["hostname"].get<std::string>());
  body->set_id(info["id"].get<std::string>());
  body->set_main(info["main"].get<std::string>());
  body->set_nodeenv(info["nodeEnv"].get<std::string>());
  body->set_pid(info["pid"].get<uint32_t>());
  body->set_platform(info["platform"].get<std::string>());
  body->set_processstart(info["processStart"].get<uint64_t>());
  body->set_totalmem(info["totalMem"].get<uint64_t>());

  // add tags
  for (const auto& tag : info["tags"]) {
    body->add_tags(tag.get<std::string>());
  }

  // add versions
  for (const auto& [key, value] : info["versions"].items()) {
    (*body->mutable_versions())[key] = value.get<std::string>();
  }

  info_response->set_allocated_common(common);
  info_response->set_allocated_body(body);

  return info_response;
}

NSolidServiceClient::NSolidServiceClient():
  channel_(::grpc::CreateChannel("localhost:50051",
                      ::grpc::InsecureChannelCredentials())),
  stub_(grpcagent::NSolidService::NewStub(channel_)),
  messenger_(std::make_unique<ReqRespStream>(stub_.get())) {

  exportEvent("info");
};

int NSolidServiceClient::exportEvent(const std::string& type) {
  auto context = std::make_shared<::grpc::ClientContext>();
  auto event = std::make_shared<grpcagent::Event>();
  // Create an InfoResponse.
  grpcagent::InfoResponse* info = CreateInfoResponse(GetProcessInfo(), nullptr);
  // Set the InfoResponse in the Event to be exported.
  event->set_allocated_info(info);
  // Create a response object and a callback function.
  auto response = std::make_shared<google::protobuf::Empty>();
  std::function<void(::grpc::Status)> callback = [context, event, response](::grpc::Status status) {
    // Handle the status here.
    // The context will be kept alive until this lambda function is destroyed.
    fprintf(stderr, "exportEvent callback\n");
  };

  stub_->async()->Events(context.get(), event.get(), response.get(), callback);
  fprintf(stderr, "exportEvent\n");
}

ReqRespStream::ReqRespStream(grpcagent::NSolidService::Stub* stub) {
  stub->async()->ReqRespStream(&context_, this);
  NextWrite();
  StartRead(&server_request_);
  StartCall();
};

void ReqRespStream::OnDone(const ::grpc::Status& /*s*/) {
  fprintf(stderr, "ReqRespStream::OnDone\n");
}

void ReqRespStream::OnReadDone(bool ok) {
  if (!ok) {
    return;
  }

  if (server_request_.command() == "info") {
    WriteInfoMsg(server_request_.requestid().c_str());
  }

  StartRead(&server_request_);
}

void ReqRespStream::OnWriteDone(bool /*ok*/) {
  write_state_.write_done = true;
  NextWrite();
}

void ReqRespStream::WriteInfoMsg(const char* req_id) {
  grpcagent::RuntimeResponse resp = CreateInfoMsg(req_id);
  // Write(std::move(resp));
  StartWriteLast(&resp, ::grpc::WriteOptions());
}

grpcagent::RuntimeResponse ReqRespStream::CreateInfoMsg(const char* req_id) {
  grpcagent::RuntimeResponse resp;

  // Create an InfoResponse.
  grpcagent::InfoResponse* info_response = node::nsolid::grpc::CreateInfoResponse(GetProcessInfo(), req_id);

  // Set the InfoResponse in the RuntimeResponse.
  resp.set_allocated_info_response(info_response);

  return resp;
}

void ReqRespStream::NextWrite() {
  if (write_state_.write_done && response_q_.dequeue(write_state_.resp)) {
    StartWrite(&write_state_.resp);
    write_state_.write_done = false;
  }
}

void ReqRespStream::Write(grpcagent::RuntimeResponse&& resp) {
  response_q_.enqueue(std::move(resp));
  NextWrite();
}

/*static*/ SharedGrpcAgent GrpcAgent::Inst() {
  static SharedGrpcAgent agent(new GrpcAgent(), [](GrpcAgent* agent) {
    delete agent;
  });
  return agent;
}

GrpcAgent::GrpcAgent(): hooks_init_(false),
                        ready_(false) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
  ASSERT_EQ(0, stop_lock_.init(true));
}

GrpcAgent::~GrpcAgent() {
  
}

int GrpcAgent::start() {
  int r = 0;
  if (ready_ == false) {
    uv_mutex_lock(&start_lock_);
    r = thread_.create(run_, weak_from_this());
    if (r == 0) {
      while (ready_ == false) {
        uv_cond_wait(&start_cond_, &start_lock_);
      }
    }

    uv_mutex_unlock(&start_lock_);
  }

  return r;
}

int GrpcAgent::stop() {
  if (utils::are_threads_equal(thread_.base(), uv_thread_self())) {
    do_stop();
  } else {
    ASSERT_EQ(0, shutdown_.send());
    ASSERT_EQ(0, thread_.join());
  }

  return 0;
}

/*static*/ void GrpcAgent::run_(nsuv::ns_thread*,
                                      WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->do_start();
  do {
    ASSERT_EQ(0, uv_run(&agent->loop_, UV_RUN_DEFAULT));
  } while (uv_loop_alive(&agent->loop_));
}

/*static*/ void GrpcAgent::shutdown_cb_(nsuv::ns_async*,
                                        WeakGrpcAgent agent_wp) {
}

/*static*/ void GrpcAgent::config_agent_cb(std::string config,
                                           WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  json cfg = json::parse(config, nullptr, false);
  // assert because the runtime should never send me an invalid JSON config
  ASSERT(!cfg.is_discarded());
  agent->config_msg_q_.enqueue(cfg);
  ASSERT_EQ(0, agent->config_msg_.send());
}

/*static*/ void GrpcAgent::config_msg_cb_(nsuv::ns_async*,
                                          WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  int r = 0;
  json config_msg;

  while (agent->config_msg_q_.dequeue(config_msg)) {
    r = agent->config(config_msg);
  }

  if (r != 0) {
    agent->do_stop();
  }
}

void GrpcAgent::env_creation_cb(SharedEnvInst envinst,
                                WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  agent->env_msg_q_.enqueue({ envinst, true });
  ASSERT_EQ(0, agent->env_msg_.send());
}

void GrpcAgent::env_deletion_cb(SharedEnvInst envinst,
                                WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  agent->env_msg_q_.enqueue({ envinst, false });
  if (!agent->env_msg_.is_closing()) {
    ASSERT_EQ(0, agent->env_msg_.send());
  }
}

/*static*/ void GrpcAgent::env_msg_cb(nsuv::ns_async*, WeakGrpcAgent) {

}

int GrpcAgent::config(const json& config) {
  int ret;

  json old_config = config_;
  config_ = config;
  json diff = json::diff(old_config, config_);
  DebugJSON("Old Config: \n%s\n", old_config);
  DebugJSON("NewConfig: \n%s\n", config_);
  DebugJSON("Diff: \n%s\n", diff);
  if (utils::find_any_fields_in_diff(diff, { "/grpc" })) {
    // if "grpc" changed,
  }

  // // If metrics timer is not active or if the diff contains metrics fields,
  // // recalculate the metrics status. (stop/start/what period)
  // if (!metrics_timer_.is_active() ||
  //     utils::find_any_fields_in_diff(diff, { "/interval", "/pauseMetrics" })) {
  //   uint64_t period = 0;
  //   auto it = config_.find("pauseMetrics");
  //   if (it != config_.end()) {
  //     bool pause = *it;
  //     if (!pause) {
  //       it = config_.find("interval");
  //       if (it != config_.end()) {
  //         period = *it;
  //       }
  //     }
  //   }

  //   return setup_metrics_timer(period);
  // }

  return 0;
}

void GrpcAgent::do_start() {
  uv_mutex_lock(&start_lock_);

  fprintf(stderr, "GrpcAgent::do_start1\n");

  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb_, weak_from_this()));

  fprintf(stderr, "GrpcAgent::do_start2\n");

  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb, weak_from_this()));

  fprintf(stderr, "GrpcAgent::do_start3\n");

  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb_, weak_from_this()));

  fprintf(stderr, "GrpcAgent::do_start4\n");

  ready_ = true;

  // if (hooks_init_ == false) {
  //   ASSERT_EQ(0, OnConfigurationHook(config_agent_cb, weak_from_this()));
  //   ASSERT_EQ(0, ThreadAddedHook(env_creation_cb, weak_from_this()));
  //   ASSERT_EQ(0, ThreadRemovedHook(env_deletion_cb, weak_from_this()));
  //   hooks_init_ = true;
  // }

  fprintf(stderr, "GrpcAgent::do_start5\n");

  auto client = new NSolidServiceClient();

  fprintf(stderr, "GrpcAgent::do_start5.5\n");

  uv_cond_signal(&start_cond_);
  uv_mutex_unlock(&start_lock_);

  fprintf(stderr, "GrpcAgent::do_start6\n");
}

void GrpcAgent::do_stop() {
  ready_ = false;
  config_msg_.close();
  env_msg_.close();
  shutdown_.close();
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
