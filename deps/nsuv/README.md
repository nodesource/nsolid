# nsuv
C++ wrapper around libuv focused on making callback arg passing safer.

Example usage:
```cpp
// Notice that the second argument of the callback can contain
// any pointer type, and it'll automatically be checked from
// the callsite, and give a compiler error if it doesn't match.

void thread_cb(ns_thread*, ns_async* async) {
  async->send();
}

void async_cb(ns_async*, ns_thread* thread) {
  thread->join();
}

int main() {
  ns_thread thread;
  ns_async async;

  async.init(uv_default_loop(), async_cb, &thread);
  thread.create(thread_cb, &async);
}
```

Additional usage can be seen in `test/`.
