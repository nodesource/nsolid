#include "grpc_agent.h"

namespace node {
namespace nsolid {
namespace grpc {

/*static*/ SharedGrpcAgent GrpcAgent::Inst() {
  static SharedGrpcAgent inst = std::make_shared<GrpcAgent>();
  return inst;
}

GrpcAgent::GrpcAgent(): ready_(false), {
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
    r = thread_.create(run_, this);
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

}

/*static*/ void SharedGrpcAgent::run_(nsuv::ns_thread*, WeakGrpcAgent) {

}

void SharedGrpcAgent::do_stop() {
  
}

void SharedGrpcAgent::do_start() {

}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
