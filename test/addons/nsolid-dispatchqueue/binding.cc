#include <node.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <atomic>
#include <vector>
using node::nsolid::DispatchQueue;

struct Foo {
};

DispatchQueue<Foo> global_qd;
Foo foo;

// JS related functions //

uint64_t last_start_call = uv_hrtime();

static void start_cb(std::queue<Foo>&& q) {
  printf("start_cb: %ld %lu\n", q.size(), uv_hrtime() - last_start_call);
}

static void check_init(int er, DispatchQueue<Foo>* f) {
  printf("check_init: %d\n", er);
  if (er) {
    return;
  }
  er = f->Start(100, 100, start_cb);
  if (er) {
    // Nothing to do.
  }
}

static void RunDispatch(const v8::FunctionCallbackInfo<v8::Value>& args) {
  printf("RunDispatch\n");
  global_qd.Init(check_init);
}

static void EnqueueItem(const v8::FunctionCallbackInfo<v8::Value>& args) {
  printf("EnqueueItem\n");
  global_qd.Enqueue(foo);
}

// Scheduling test. The N|Solid thread is held at known points so the batch
// sizes don't depend on timing: blocked_sem is posted when it's held and
// release_sem lets it go.

DispatchQueue<Foo> sched_qd;
uv_mutex_t batches_lock;
std::vector<size_t> batches;
std::atomic<bool> hold_next_batch = {false};
uv_sem_t blocked_sem;
uv_sem_t release_sem;

static void hold_thread() {
  uv_sem_post(&blocked_sem);
  uv_sem_wait(&release_sem);
}

static void sched_cb(std::queue<Foo>&& q) {
  uv_mutex_lock(&batches_lock);
  batches.push_back(q.size());
  uv_mutex_unlock(&batches_lock);
  if (hold_next_batch.exchange(false)) {
    hold_thread();
  }
}

static void sched_init(int er, DispatchQueue<Foo>* q) {
  assert(er == 0);
  // The periodic timer never fires during the test.
  er = q->Start(3600 * 1000, 100, sched_cb);
  assert(er == 0);
  uv_sem_post(&blocked_sem);
}

// Like the trace hooks changing, which restarts the span queue.
static void Restart(const v8::FunctionCallbackInfo<v8::Value>& args) {
  int er = sched_qd.Start(3600 * 1000, 100, sched_cb);
  assert(er == 0);
}

static void InitSchedule(const v8::FunctionCallbackInfo<v8::Value>& args) {
  int er = uv_mutex_init(&batches_lock);
  assert(er == 0);
  er = uv_sem_init(&blocked_sem, 0);
  assert(er == 0);
  er = uv_sem_init(&release_sem, 0);
  assert(er == 0);
  er = sched_qd.Init(sched_init);
  assert(er == 0);
  uv_sem_wait(&blocked_sem);
}

// Returns once the N|Solid thread has run everything queued before and is
// held.
static void HoldThread(const v8::FunctionCallbackInfo<v8::Value>& args) {
  int er = node::nsolid::EnvList::Inst()->QueueCallback(
      [](void*) { hold_thread(); }, nullptr);
  assert(er == 0);
  uv_sem_wait(&blocked_sem);
}

static void HoldNextBatch(const v8::FunctionCallbackInfo<v8::Value>& args) {
  hold_next_batch = true;
}

static void WaitHeld(const v8::FunctionCallbackInfo<v8::Value>& args) {
  uv_sem_wait(&blocked_sem);
}

static void Release(const v8::FunctionCallbackInfo<v8::Value>& args) {
  uv_sem_post(&release_sem);
}

static void Enqueue(const v8::FunctionCallbackInfo<v8::Value>& args) {
  uint32_t n = args[0].As<v8::Uint32>()->Value();
  for (uint32_t i = 0; i < n; i++) {
    sched_qd.Enqueue(foo);
  }
}

static void Batches(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::Local<v8::Context> context = isolate->GetCurrentContext();
  uv_mutex_lock(&batches_lock);
  std::vector<size_t> copy = batches;
  uv_mutex_unlock(&batches_lock);
  v8::Local<v8::Array> arr = v8::Array::New(isolate, copy.size());
  for (size_t i = 0; i < copy.size(); i++) {
    arr->Set(context, i, v8::Number::New(isolate, copy[i])).Check();
  }
  args.GetReturnValue().Set(arr);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "runDispatch", RunDispatch);
  NODE_SET_METHOD(exports, "enqueueItem", EnqueueItem);
  NODE_SET_METHOD(exports, "initSchedule", InitSchedule);
  NODE_SET_METHOD(exports, "holdThread", HoldThread);
  NODE_SET_METHOD(exports, "holdNextBatch", HoldNextBatch);
  NODE_SET_METHOD(exports, "waitHeld", WaitHeld);
  NODE_SET_METHOD(exports, "release", Release);
  NODE_SET_METHOD(exports, "enqueue", Enqueue);
  NODE_SET_METHOD(exports, "restart", Restart);
  NODE_SET_METHOD(exports, "batches", Batches);
}
