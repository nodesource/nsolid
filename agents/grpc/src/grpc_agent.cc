#include "grpc_agent.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {
namespace grpc {

NSolidMessenger::NSolidMessenger(grpcagent::NSolidService::Stub* stub, uv_loop_t* loop) {
  stub->async()->ReqRespStream(&context_, this);
  // NextWrite();
  StartRead(&server_request_);
  StartCall();
};

/*static*/ SharedGrpcAgent GrpcAgent::Inst() {
  static SharedGrpcAgent agent(new GrpcAgent(), [](GrpcAgent* agent) {
    delete agent;
  });
  return agent;
}

GrpcAgent::GrpcAgent(): ready_(false) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
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

/*static*/ void GrpcAgent::env_msg_cb(nsuv::ns_async*, WeakGrpcAgent) {

}

/*static*/ void GrpcAgent::shutdown_cb_(nsuv::ns_async*,
                                              WeakGrpcAgent agent_wp) {
}

/*static*/ void GrpcAgent::config_msg_cb_(nsuv::ns_async*,
                                                WeakGrpcAgent agent_wp) {
}

void GrpcAgent::do_start() {
  uv_mutex_lock(&start_lock_);

  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb_, weak_from_this()));

  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb, weak_from_this()));

  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb_, weak_from_this()));

  uv_cond_signal(&start_cond_);
  uv_mutex_unlock(&start_lock_);
}

void GrpcAgent::do_stop() {
  config_msg_.close();
  env_msg_.close();
  shutdown_.close();
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
