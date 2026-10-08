#ifndef INCLUDE_NSUV_H_
#define INCLUDE_NSUV_H_

#include <uv.h>
#include <memory>
#include <vector>

/* Allow users to define if they don't want the warning. */
#ifdef NSUV_DISABLE_WUR
#  define NSUV_WUR
#else
/* NSUV_WUR -> NSUV_WARN_UNUSED_RESULT */
#if defined(_MSC_VER) && (_MSC_VER >= 1700)
#  define NSUV_WUR _Check_return_
#elif defined(__clang__) && __has_attribute(warn_unused_result)
#  define NSUV_WUR __attribute__((warn_unused_result))
#elif defined(__GNUC__) && !__INTEL_COMPILER &&                                \
    (__GNUC__ > 4 || (__GNUC__ == 4 && __GNUC_MINOR__ > 0))
#  define NSUV_WUR __attribute__((warn_unused_result))
#else
#  define NSUV_WUR /* NOT SUPPORTED */
#endif
#endif

#if !defined(DEBUG) && defined(_MSC_VER)
#  define NSUV_INLINE __forceinline
#elif !defined(DEBUG) && defined(__clang__) && __has_attribute(always_inline)
#  define NSUV_INLINE inline __attribute__((always_inline))
#else
#  define NSUV_INLINE inline
#endif

#define NSUV_PROXY_FNS(name, ...)                                              \
  template <typename CB_T>                                                     \
  static NSUV_INLINE void name(__VA_ARGS__);                                   \
  template <typename CB_T, typename D_T>                                       \
  static NSUV_INLINE void name(__VA_ARGS__);                                   \
  template <typename CB_T, typename D_T>                                       \
  static NSUV_INLINE void name##wp_(__VA_ARGS__);

#define NSUV_CB_FNS(name, ...)                                                 \
  using name = void (*)(__VA_ARGS__);                                          \
  template <typename D_T>                                                      \
  using name##_d = void (*)(__VA_ARGS__, D_T*);                                \
  template <typename D_T>                                                      \
  using name##_wp = void (*)(__VA_ARGS__, std::weak_ptr<D_T>);

namespace nsuv {

/* uv_req classes */
template <class, class, class>
class ns_req;
template <class>
class ns_connect;
template <class>
class ns_write;
class ns_addrinfo;
class ns_random;
class ns_udp_send;
class ns_work;

/* uv_handle classes */
template <class, class>
class ns_handle;
template <class, class>
class ns_stream;
class ns_async;
class ns_check;
class ns_idle;
class ns_poll;
class ns_prepare;
class ns_tcp;
class ns_timer;
class ns_udp;

/* everything else */
class ns_mutex;
class ns_rwlock;
class ns_thread;

namespace util {

NSUV_INLINE int addr_size(const struct sockaddr*);

template <typename T, typename U>
T check_null_cb(U cb, T proxy);

template <class T>
class no_throw_vec {
 public:
  NSUV_INLINE ~no_throw_vec();
  NSUV_INLINE const T* data();
  NSUV_INLINE size_t size();
  // If internal pointer changes, does not copy values over.
  NSUV_INLINE int reserve(size_t n);
  NSUV_INLINE int replace(const T* b, size_t n);
 private:
  T datasml_[4];  // match uv_write_t::bufsml.
  T* data_ = &datasml_[0];
  size_t size_ = 0;
  size_t capacity_ = sizeof(datasml_) / sizeof(datasml_[0]);
};

}  // namespace util

/**
 * UV_T - uv_<type>_t this class inherits.
 * R_T  - ns_<req_type> that inherits this class.
 * D_T  - data type passed to the callback, etc.
 */
template <class UV_T, class R_T>
class ns_base_req : public UV_T {
 protected:
  template <typename CB, typename D_T = void>
  NSUV_INLINE void init(uv_loop_t* loop, CB cb, D_T* data = nullptr);
  template <typename CB, typename D_T>
  NSUV_INLINE void init(uv_loop_t* loop,
                        CB cb,
                        std::weak_ptr<D_T> data);

 public:
  NSUV_INLINE uv_loop_t* get_loop();
  NSUV_INLINE UV_T* uv_req();
  NSUV_INLINE uv_req_t* base_req();
  NSUV_INLINE uv_req_type get_type();
  NSUV_INLINE const char* type_name();
  NSUV_INLINE NSUV_WUR int cancel();

  /* Enforce better type safety on data getter/setter. */
  template <typename D_T>
  NSUV_INLINE D_T* get_data();
  NSUV_INLINE void set_data(void* ptr);

  static NSUV_INLINE R_T* cast(void* req);
  static NSUV_INLINE R_T* cast(uv_req_t* req);
  static NSUV_INLINE R_T* cast(UV_T* req);

 protected:
  void (*req_cb_)() = nullptr;
  void* req_cb_data_ = nullptr;
  std::weak_ptr<void> req_cb_wp_;
  uv_loop_t* loop_ = nullptr;
};


/**
 * UV_T - uv_<type>_t this class inherits.
 * R_T  - ns_<req_type> that inherits this class.
 * H_T  - ns_<handle_type> that utilizes this class.
 * D_T  - data type passed to the callback, etc.
 */
template <class UV_T, class R_T, class H_T>
class ns_req : public ns_base_req<UV_T, R_T> {
 public:
  template <typename CB, typename D_T = void>
  NSUV_INLINE void init(CB cb, D_T* data = nullptr);
  template <typename CB, typename D_T>
  NSUV_INLINE void init(CB cb, std::weak_ptr<D_T> data);
  /* Return the ns_handle that has ownership of this req. This uses the
   * UV_T::handle field, and downcasts from the uv_handle_t to H_T.
   */
  NSUV_INLINE H_T* handle();
  /* Add a method to overwrite the handle field. Not sure why they'd need to,
   * but there are tests that do this. This way it's less likely that a
   * uv_handle_t is set that isn't upcast from an ns_handle.
   */
  NSUV_INLINE void handle(H_T* handle);

 private:
  template <class, class>
  friend class ns_stream;
  friend class ns_tcp;
  friend class ns_udp;
};


/* ns_connect */

template <class H_T>
class ns_connect : public ns_req<uv_connect_t, ns_connect<H_T>, H_T> {
 public:
  NSUV_INLINE const struct sockaddr* sockaddr();

 private:
  friend class ns_tcp;

  template <typename CB, typename D_T = void>
  NSUV_INLINE NSUV_WUR int init(const struct sockaddr* addr,
                                CB cb,
                                D_T* data = nullptr);
  template <typename CB, typename D_T>
  NSUV_INLINE NSUV_WUR int init(const struct sockaddr* addr,
                                CB cb,
                                std::weak_ptr<D_T> data);
  struct sockaddr_storage addr_;
};


/* ns_write */

template <class H_T>
class ns_write : public ns_req<uv_write_t, ns_write<H_T>, H_T> {
 public:
  NSUV_INLINE const uv_buf_t* bufs();
  NSUV_INLINE size_t size();

 private:
  template <class, class>
  friend class ns_stream;
  friend class ns_tcp;

  template <typename CB, typename D_T = void>
  NSUV_INLINE NSUV_WUR int init(const uv_buf_t bufs[],
                                size_t nbufs,
                                CB cb,
                                D_T* data = nullptr);
  template <typename CB, typename D_T = void>
  NSUV_INLINE NSUV_WUR int init(const std::vector<uv_buf_t>& bufs,
                                CB cb,
                                D_T* data = nullptr);
  template <typename CB, typename D_T>
  NSUV_INLINE NSUV_WUR int init(const uv_buf_t bufs[],
                                size_t nbufs,
                                CB cb,
                                std::weak_ptr<D_T> data);
  template <typename CB, typename D_T>
  NSUV_INLINE NSUV_WUR int init(const std::vector<uv_buf_t>& bufs,
                                CB cb,
                                std::weak_ptr<D_T> data);

  util::no_throw_vec<uv_buf_t> bufs_;
};


/* ns_udp_send */

class ns_udp_send : public ns_req<uv_udp_send_t, ns_udp_send, ns_udp> {
 public:
  NSUV_INLINE const uv_buf_t* bufs();
  NSUV_INLINE size_t size();
  NSUV_INLINE const struct sockaddr* sockaddr();

 private:
  friend class ns_udp;

  template <typename CB, typename D_T = void*>
  NSUV_INLINE int init(const uv_buf_t bufs[],
                       size_t nbufs,
                       const struct sockaddr* addr,
                       CB cb,
                       D_T* data = nullptr);
  template <typename CB, typename D_T = void*>
  NSUV_INLINE int init(const std::vector<uv_buf_t>& bufs,
                       const struct sockaddr* addr,
                       CB cb,
                       D_T* data = nullptr);
  template <typename CB, typename D_T>
  NSUV_INLINE int init(const uv_buf_t bufs[],
                       size_t nbufs,
                       const struct sockaddr* addr,
                       CB cb,
                       std::weak_ptr<D_T> data);
  template <typename CB, typename D_T>
  NSUV_INLINE int init(const std::vector<uv_buf_t>& bufs,
                       const struct sockaddr* addr,
                       CB cb,
                       std::weak_ptr<D_T> data);

  util::no_throw_vec<uv_buf_t> bufs_;
  std::unique_ptr<struct sockaddr_storage> addr_;
};


/* ns_addrinfo */

class ns_addrinfo : public ns_base_req<uv_getaddrinfo_t, ns_addrinfo> {
 public:
  NSUV_CB_FNS(ns_addrinfo_cb, ns_addrinfo*, int)

  NSUV_INLINE ns_addrinfo();

  NSUV_INLINE ~ns_addrinfo();

  NSUV_INLINE NSUV_WUR int get(uv_loop_t* loop,
                               ns_addrinfo_cb cb,
                               const char* node,
                               const char* service,
                               const struct addrinfo* hints);
  template <typename D_T = void>
  NSUV_INLINE NSUV_WUR int get(uv_loop_t* loop,
                               ns_addrinfo_cb_d<D_T> cb,
                               const char* node,
                               const char* service,
                               const struct addrinfo* hints,
                               D_T* data = nullptr);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int get(uv_loop_t* loop,
                               ns_addrinfo_cb_wp<D_T> cb,
                               const char* node,
                               const char* service,
                               const struct addrinfo* hints,
                               std::weak_ptr<D_T> data);
  NSUV_INLINE const struct addrinfo* info();
  NSUV_INLINE void free();

 private:
  NSUV_PROXY_FNS(addrinfo_proxy_, uv_getaddrinfo_t*, int, struct addrinfo*)
};


/* ns_fs */

#define NSUV_FS_FN(name, ...)                                                  \
  NSUV_INLINE NSUV_WUR int name(__VA_ARGS__);                                  \
  NSUV_INLINE NSUV_WUR int name(uv_loop_t*, __VA_ARGS__, ns_fs_cb);            \
  template <typename D_T>                                                      \
  NSUV_INLINE NSUV_WUR int name(                                               \
      uv_loop_t*, __VA_ARGS__, ns_fs_cb_d<D_T>, D_T*);                         \
  template <typename D_T>                                                      \
  NSUV_INLINE NSUV_WUR int name(                                               \
      uv_loop_t*, __VA_ARGS__, ns_fs_cb_wp<D_T>, std::weak_ptr<D_T>);

class ns_fs : public ns_base_req<uv_fs_t, ns_fs> {
 public:
  NSUV_CB_FNS(ns_fs_cb, ns_fs*)

  NSUV_INLINE uv_fs_type get_type();
  NSUV_INLINE ssize_t get_result();
  NSUV_INLINE int get_system_error();
  NSUV_INLINE void* get_ptr();
  NSUV_INLINE const char* get_path();
  NSUV_INLINE uv_stat_t* get_statbuf();
  // TODO(trevnorris): Automate this in the destructor?
  NSUV_INLINE void cleanup();

  NSUV_INLINE NSUV_WUR int scandir_next(uv_dirent_t* ent);

  NSUV_FS_FN(close, uv_file file)
  NSUV_FS_FN(open, const char* path, int flags, int mode)
  NSUV_FS_FN(read,
             uv_file file,
             const uv_buf_t bufs[],
             unsigned int nbufs,
             int64_t offset)
  NSUV_FS_FN(read,
             uv_file file,
             const std::vector<uv_buf_t>& bufs,
             int64_t offset)
  NSUV_FS_FN(unlink, const char* path)
  NSUV_FS_FN(write,
             uv_file file,
             const uv_buf_t bufs[],
             unsigned int nbufs,
             int64_t offset)
  NSUV_FS_FN(write,
             uv_file file,
             const std::vector<uv_buf_t>& bufs,
             int64_t offset)
  NSUV_FS_FN(copyfile, const char* path, const char* new_path, int flags)
  NSUV_FS_FN(mkdir, const char* path, int mode)
  NSUV_FS_FN(mkdtemp, const char* tpl)
  NSUV_FS_FN(mkstemp, const char* tpl)
  NSUV_FS_FN(rmdir, const char* path)
  NSUV_FS_FN(scandir, const char* path, int flags)
  NSUV_FS_FN(opendir, const char* path)
  NSUV_FS_FN(readdir, uv_dir_t* dir)
  NSUV_FS_FN(closedir, uv_dir_t* dir)
  NSUV_FS_FN(stat, const char* path)
  NSUV_FS_FN(fstat, uv_file file)
  NSUV_FS_FN(rename, const char* path, const char* new_path)
  NSUV_FS_FN(fsync, uv_file file)
  NSUV_FS_FN(fdatasync, uv_file file)
  NSUV_FS_FN(ftruncate, uv_file file, int64_t offset)
  NSUV_FS_FN(sendfile,
             uv_file out_fd,
             uv_file in_fd,
             int64_t in_offset,
             size_t length)
  NSUV_FS_FN(access, const char* path, int mode)
  NSUV_FS_FN(chmod, const char* path, int mode)
  NSUV_FS_FN(utime, const char* path, double atime, double mtime)
  NSUV_FS_FN(futime, uv_file file, double atime, double mtime)
  NSUV_FS_FN(lutime, const char* path, double atime, double mtime)
  NSUV_FS_FN(lstat, const char* path)
  NSUV_FS_FN(link, const char* path, const char* new_path)
  NSUV_FS_FN(symlink, const char* path, const char* new_path, int flags)
  NSUV_FS_FN(readlink, const char* path)
  NSUV_FS_FN(realpath, const char* path)
  NSUV_FS_FN(fchmod, uv_file file, int mode)
  NSUV_FS_FN(chown, const char* path, uv_uid_t uid, uv_gid_t gid)
  NSUV_FS_FN(fchown, uv_file file, uv_uid_t uid, uv_gid_t gid)
  NSUV_FS_FN(lchown, const char* path, uv_uid_t uid, uv_gid_t gid)
  NSUV_FS_FN(statfs, const char* path)

 private:
  NSUV_PROXY_FNS(cb_proxy_, uv_fs_t*)
};

#undef NSUV_FS_FN


/* ns_random */

class ns_random : public ns_base_req<uv_random_t, ns_random> {
 public:
  NSUV_CB_FNS(ns_random_cb, ns_random*, int, void*, size_t)

  static NSUV_INLINE NSUV_WUR int get(void* buf,
                                      size_t buflen,
                                      uint32_t flags);
  NSUV_INLINE NSUV_WUR int get(uv_loop_t* loop,
                               void* buf,
                               size_t buflen,
                               uint32_t flags,
                               ns_random_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int get(uv_loop_t* loop,
                               void* buf,
                               size_t buflen,
                               uint32_t flags,
                               ns_random_cb_d<D_T> cb,
                               D_T* data);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int get(uv_loop_t* loop,
                               void* buf,
                               size_t buflen,
                               uint32_t flags,
                               ns_random_cb_wp<D_T> cb,
                               std::weak_ptr<D_T> data);

 private:
  NSUV_PROXY_FNS(random_proxy_,
                 uv_random_t* handle,
                 int status,
                 void* buf,
                 size_t buflen)
};


/* ns_work */

class ns_work : public ns_base_req<uv_work_t, ns_work> {
 public:
  NSUV_CB_FNS(ns_work_cb, ns_work*)
  NSUV_CB_FNS(ns_after_work_cb, ns_work*, int)

  NSUV_INLINE NSUV_WUR int queue_work(uv_loop_t* loop,
                                      ns_work_cb work_cb,
                                      ns_after_work_cb after_cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int queue_work(uv_loop_t* loop,
                                      ns_work_cb_d<D_T> work_cb,
                                      ns_after_work_cb_d<D_T> after_cb,
                                      D_T* data);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int queue_work(uv_loop_t* loop,
                                      ns_work_cb_wp<D_T> work_cb,
                                      ns_after_work_cb_wp<D_T> after_cb,
                                      std::weak_ptr<D_T> data);
  // libuv allows passing nullptr as after_cb, so create another overload.
  NSUV_INLINE NSUV_WUR int queue_work(uv_loop_t* loop,
                                      ns_work_cb work_cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int queue_work(uv_loop_t* loop,
                                      ns_work_cb_d<D_T> work_cb,
                                      D_T* data);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int queue_work(uv_loop_t* loop,
                                      ns_work_cb_wp<D_T> work_cb,
                                      std::weak_ptr<D_T> data);

 private:
  NSUV_PROXY_FNS(work_proxy_, uv_work_t*)
  NSUV_PROXY_FNS(after_proxy_, uv_work_t*, int)

  void (*work_cb_ptr_)() = nullptr;
  void (*after_cb_ptr_)() = nullptr;
  void* cb_data_ = nullptr;
  std::weak_ptr<void> cb_wp_;
};


/* ns_handle */

/* ns_handle is a wrapper for that abstracts libuv API calls specific to
 * uv_handle_t. All inheriting classes must then implement methods that pertain
 * specifically to that handle type.
 */
template <class UV_T, class H_T>
class ns_handle : public UV_T {
 public:
  NSUV_CB_FNS(ns_close_cb, H_T*)

  NSUV_INLINE UV_T* uv_handle();
  NSUV_INLINE uv_handle_t* base_handle();
  NSUV_INLINE uv_loop_t* get_loop();
  NSUV_INLINE uv_handle_type get_type();
  NSUV_INLINE const char* type_name();
  NSUV_INLINE bool is_closing();
  NSUV_INLINE bool is_active();

  NSUV_INLINE void close();
  NSUV_INLINE void close(ns_close_cb cb);
  template <typename D_T>
  NSUV_INLINE void close(ns_close_cb_d<D_T>, D_T* data);
  NSUV_INLINE void close(void (*cb)(H_T*, void*), std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE void close(ns_close_cb_wp<D_T>, std::weak_ptr<D_T> data);
  /* Convinence method to just delete the handle after it's closed. */
  NSUV_INLINE void close_and_delete();
  NSUV_INLINE void set_data(void* data);
  /* A void* always needs to be cast anyway, so allow what it will be cast to
   * as a template type.
   */
  template <typename D_T>
  NSUV_INLINE D_T* get_data();
  NSUV_INLINE void unref();

  static NSUV_INLINE H_T* cast(void* handle);
  static NSUV_INLINE H_T* cast(uv_handle_t* handle);
  static NSUV_INLINE H_T* cast(UV_T* handle);

 private:
  NSUV_PROXY_FNS(close_proxy_, uv_handle_t* handle)

  static NSUV_INLINE void close_delete_cb_(uv_handle_t* handle);

  void (*close_cb_ptr_)() = nullptr;
  void* close_cb_data_ = nullptr;
  std::weak_ptr<void> close_cb_wp_;
};


/* ns_stream */

template <class UV_T, class H_T>
class ns_stream : public ns_handle<UV_T, H_T> {
 public:
  NSUV_CB_FNS(ns_listen_cb, H_T*, int)
  NSUV_CB_FNS(ns_alloc_cb, H_T*, size_t, uv_buf_t*)
  NSUV_CB_FNS(ns_read_cb, H_T*, ssize_t, const uv_buf_t*)
  NSUV_CB_FNS(ns_write_cb, ns_write<H_T>*, int)

  NSUV_INLINE uv_stream_t* base_stream();
  NSUV_INLINE size_t get_write_queue_size();
  NSUV_INLINE int is_readable();
  NSUV_INLINE int is_writable();
  NSUV_INLINE NSUV_WUR int set_blocking(bool blocking);
  NSUV_INLINE NSUV_WUR int listen(int backlog, ns_listen_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int listen(int backlog,
                                  ns_listen_cb_d<D_T> cb,
                                  D_T* data);
  NSUV_INLINE NSUV_WUR int listen(int backlog,
                                  void (*cb)(H_T*, int, void*),
                                  std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int listen(int backlog,
                                  ns_listen_cb_wp<D_T> cb,
                                  std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int accept(H_T* handle);
  NSUV_INLINE NSUV_WUR int read_start(ns_alloc_cb alloc_cb,
                                      ns_read_cb read_cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int read_start(ns_alloc_cb_d<D_T> alloc_cb,
                                      ns_read_cb_d<D_T> read_cb,
                                      D_T* data);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int read_start(ns_alloc_cb_wp<D_T> alloc_cb,
                                      ns_read_cb_wp<D_T> read_cb,
                                      std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int read_stop();
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const uv_buf_t bufs[],
                                 size_t nbufs,
                                 ns_write_cb cb);
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const std::vector<uv_buf_t>& bufs,
                                 ns_write_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const uv_buf_t bufs[],
                                 size_t nbufs,
                                 ns_write_cb_d<D_T> cb,
                                 D_T* data);
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const uv_buf_t bufs[],
                                 size_t nbufs,
                                 void (*cb)(ns_write<H_T>*, int, void*),
                                 std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const uv_buf_t bufs[],
                                 size_t nbufs,
                                 ns_write_cb_wp<D_T> cb,
                                 std::weak_ptr<D_T> data);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const std::vector<uv_buf_t>& bufs,
                                 ns_write_cb_d<D_T> cb,
                                 D_T* data);
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const std::vector<uv_buf_t>& bufs,
                                 void (*cb)(ns_write<H_T>*, int, void*),
                                 std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int write(ns_write<H_T>* req,
                                 const std::vector<uv_buf_t>& bufs,
                                 ns_write_cb_wp<D_T> cb,
                                 std::weak_ptr<D_T> data);

 private:
  NSUV_PROXY_FNS(listen_proxy_, uv_stream_t* handle, int status)
  NSUV_PROXY_FNS(alloc_proxy_, uv_handle_t*, size_t, uv_buf_t*)
  NSUV_PROXY_FNS(read_proxy_, uv_stream_t*, ssize_t, const uv_buf_t*)
  NSUV_PROXY_FNS(write_proxy_, uv_write_t* uv_req, int status)

  void (*listen_cb_ptr_)() = nullptr;
  void* listen_cb_data_ = nullptr;
  std::weak_ptr<void> listen_cb_wp_;
  void (*alloc_cb_ptr_)() = nullptr;
  void (*read_cb_ptr_)() = nullptr;
  void* read_cb_data_ = nullptr;
  std::weak_ptr<void> read_cb_wp_;
};


/* ns_async */

class ns_async : public ns_handle<uv_async_t, ns_async> {
 public:
  NSUV_CB_FNS(ns_async_cb, ns_async*)

  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop, ns_async_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop,
                                ns_async_cb_d<D_T> cb,
                                D_T* data);
  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop,
                                void (*cb)(ns_async*, void*),
                                std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop,
                                ns_async_cb_wp<D_T> cb,
                                std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int send();

 private:
  NSUV_PROXY_FNS(async_proxy_, uv_async_t* handle)

  void (*async_cb_ptr_)() = nullptr;
  void* async_cb_data_ = nullptr;
  std::weak_ptr<void> async_cb_wp_;
};


/* ns_poll */

class ns_poll : public ns_handle<uv_poll_t, ns_poll> {
 public:
  NSUV_CB_FNS(ns_poll_cb, ns_poll*, int, int)

  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop, int fd);
  NSUV_INLINE NSUV_WUR int init_socket(uv_loop_t* loop, uv_os_sock_t socket);

  NSUV_INLINE NSUV_WUR int start(int events, ns_poll_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int start(int events,
                                 ns_poll_cb_d<D_T> cb,
                                 D_T* data);
  NSUV_INLINE NSUV_WUR int start(int events,
                                 void (*cb)(ns_poll*, int, int, void*),
                                 std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int start(int events,
                                 ns_poll_cb_wp<D_T> cb,
                                 std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int stop();

 private:
  NSUV_PROXY_FNS(poll_proxy_, uv_poll_t* handle, int poll, int events)

  void (*poll_cb_ptr_)() = nullptr;
  void* poll_cb_data_ = nullptr;
  std::weak_ptr<void> poll_cb_wp_;
};


/* ns_tcp */

class ns_tcp : public ns_stream<uv_tcp_t, ns_tcp> {
 public:
  NSUV_CB_FNS(ns_connect_cb, ns_connect<ns_tcp>*, int)

  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop);
  NSUV_INLINE NSUV_WUR int init_ex(uv_loop_t* loop, unsigned int flags);
  NSUV_INLINE NSUV_WUR int open(uv_os_sock_t sock);
  NSUV_INLINE NSUV_WUR int nodelay(bool enable);
  NSUV_INLINE NSUV_WUR int keepalive(bool enable, int delay);
  NSUV_INLINE NSUV_WUR int simultaneous_accepts(bool enable);

  NSUV_INLINE NSUV_WUR int bind(const struct sockaddr* addr,
                                unsigned int flags = 0);
  NSUV_INLINE NSUV_WUR int getsockname(struct sockaddr* name, int* namelen);
  NSUV_INLINE NSUV_WUR int getpeername(struct sockaddr* name, int* namelen);

  NSUV_INLINE NSUV_WUR int close_reset(ns_close_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int close_reset(ns_close_cb_d<D_T> cb, D_T* data);
  NSUV_INLINE NSUV_WUR int close_reset(void (*cb)(ns_tcp*, void*),
                                       std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int close_reset(ns_close_cb_wp<D_T> cb,
                                       std::weak_ptr<D_T> data);

  NSUV_INLINE NSUV_WUR int connect(ns_connect<ns_tcp>* req,
                                   const struct sockaddr* addr,
                                   ns_connect_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int connect(ns_connect<ns_tcp>* req,
                                   const struct sockaddr* addr,
                                   ns_connect_cb_d<D_T> cb,
                                   D_T* data);
  NSUV_INLINE NSUV_WUR int connect(ns_connect<ns_tcp>* req,
                                   const struct sockaddr* addr,
                                   void (*cb)(ns_connect<ns_tcp>*, int, void*),
                                   std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int connect(ns_connect<ns_tcp>* req,
                                   const struct sockaddr* addr,
                                   ns_connect_cb_wp<D_T> cb,
                                   std::weak_ptr<D_T> data);

 private:
  NSUV_PROXY_FNS(connect_proxy_, uv_connect_t* uv_req, int status)
  NSUV_PROXY_FNS(close_reset_proxy_, uv_handle_t* handle)

  void (*close_reset_cb_ptr_)() = nullptr;
  void* close_reset_data_ = nullptr;
  std::weak_ptr<void> close_reset_wp_;
};


/* ns_timer */

class ns_timer : public ns_handle<uv_timer_t, ns_timer> {
 public:
  NSUV_CB_FNS(ns_timer_cb, ns_timer*)

  NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop);
  NSUV_INLINE NSUV_WUR int start(ns_timer_cb cb,
                                 uint64_t timeout,
                                 uint64_t repeat);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int start(ns_timer_cb_d<D_T> cb,
                                 uint64_t timeout,
                                 uint64_t repeat,
                                 D_T* data);
  NSUV_INLINE NSUV_WUR int start(void (*cb)(ns_timer*, void*),
                                 uint64_t timeout,
                                 uint64_t repeat,
                                 std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int start(ns_timer_cb_wp<D_T> cb,
                                 uint64_t timeout,
                                 uint64_t repeat,
                                 std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int stop();
  NSUV_INLINE size_t get_repeat();

 private:
  NSUV_PROXY_FNS(timer_proxy_, uv_timer_t* handle)
  void (*timer_cb_ptr_)() = nullptr;
  void* timer_cb_data_ = nullptr;
  std::weak_ptr<void> timer_cb_wp_;
};


/* ns_check, ns_idle, ns_prepare */

#define NSUV_LOOP_WATCHER_DEFINE(name)                                         \
  class ns_##name : public ns_handle<uv_##name##_t, ns_##name> {               \
   public:                                                                     \
    NSUV_CB_FNS(ns_##name##_cb, ns_##name*)                                    \
    NSUV_INLINE NSUV_WUR int init(uv_loop_t* loop);                            \
    NSUV_INLINE NSUV_WUR int start(ns_##name##_cb cb);                         \
    template <typename D_T>                                                    \
    NSUV_INLINE NSUV_WUR int start(ns_##name##_cb_d<D_T> cb, D_T* data);       \
    NSUV_INLINE NSUV_WUR int start(void (*cb)(ns_##name*, void*),              \
                                   std::nullptr_t);                            \
    template <typename D_T>                                                    \
    NSUV_INLINE NSUV_WUR int start(ns_##name##_cb_wp<D_T> cb,                  \
                                   std::weak_ptr<D_T> data);                   \
    NSUV_INLINE NSUV_WUR int stop();                                           \
                                                                               \
   private:                                                                    \
    NSUV_PROXY_FNS(name##_proxy_, uv_##name##_t* handle)                       \
    void (*name##_cb_ptr_)() = nullptr;                                        \
    void* name##_cb_data_ = nullptr;                                           \
    std::weak_ptr<void> name##_cb_wp_;                                         \
  };

NSUV_LOOP_WATCHER_DEFINE(check)
NSUV_LOOP_WATCHER_DEFINE(idle)
NSUV_LOOP_WATCHER_DEFINE(prepare)

#undef NSUV_LOOP_WATCHER_DEFINE


/* ns_udp */

class ns_udp : public ns_handle<uv_udp_t, ns_udp> {
 public:
  NSUV_CB_FNS(ns_udp_send_cb, ns_udp_send*, int)

  NSUV_INLINE NSUV_WUR int init(uv_loop_t*);
  NSUV_INLINE NSUV_WUR int init_ex(uv_loop_t*, unsigned int);
  NSUV_INLINE NSUV_WUR int bind(const struct sockaddr* addr,
                                unsigned int flags);
  NSUV_INLINE NSUV_WUR int connect(const struct sockaddr* addr);
  NSUV_INLINE NSUV_WUR int getpeername(struct sockaddr* name, int* namelen);
  NSUV_INLINE NSUV_WUR int getsockname(struct sockaddr* name, int* namelen);
  NSUV_INLINE NSUV_WUR int try_send(const uv_buf_t bufs[],
                                    size_t nbufs,
                                    const struct sockaddr* addr);
  NSUV_INLINE NSUV_WUR int try_send(const std::vector<uv_buf_t>& bufs,
                                    const struct sockaddr* addr);
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                const struct sockaddr* addr);
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const std::vector<uv_buf_t>& bufs,
                                const struct sockaddr* addr);
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                const struct sockaddr* addr,
                                ns_udp_send_cb cb);
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const std::vector<uv_buf_t>& bufs,
                                const struct sockaddr* addr,
                                ns_udp_send_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                const struct sockaddr* addr,
                                ns_udp_send_cb_d<D_T> cb,
                                D_T* data);
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                const struct sockaddr* addr,
                                void (*cb)(ns_udp_send*, int, void*),
                                std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                const struct sockaddr* addr,
                                ns_udp_send_cb_wp<D_T> cb,
                                std::weak_ptr<D_T> data);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const std::vector<uv_buf_t>& bufs,
                                const struct sockaddr* addr,
                                ns_udp_send_cb_d<D_T> cb,
                                D_T* data);
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const std::vector<uv_buf_t>& bufs,
                                const struct sockaddr* addr,
                                void (*cb)(ns_udp_send*, int, void*),
                                std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int send(ns_udp_send* req,
                                const std::vector<uv_buf_t>& bufs,
                                const struct sockaddr* addr,
                                ns_udp_send_cb_wp<D_T> cb,
                                std::weak_ptr<D_T> data);

  NSUV_INLINE const struct sockaddr* local_addr();
  NSUV_INLINE const struct sockaddr* remote_addr();

 private:
  NSUV_PROXY_FNS(send_proxy_, uv_udp_send_t* uv_req, int status)
  std::unique_ptr<struct sockaddr_storage> local_addr_;
  std::unique_ptr<struct sockaddr_storage> remote_addr_;
};


/**
 * The following aren't handles or reqs.
 */


/* ns_mutex */

class ns_mutex {
 public:
  // Constructor for allowing auto init() and destroy().
  NSUV_INLINE explicit ns_mutex(int* er, bool recursive = false);
  ns_mutex() = default;
  NSUV_INLINE ~ns_mutex();

  // Leaving the manual init() available in case the user decides to use the
  // default constructor. For cases where default constructor must be used,
  // such as being placed as a class member, pass true to init() to enable auto
  // destroy().
  NSUV_INLINE NSUV_WUR int init(bool ad = false);
  NSUV_INLINE NSUV_WUR int init_recursive(bool ad = false);
  NSUV_INLINE void destroy();
  NSUV_INLINE void lock();
  NSUV_INLINE NSUV_WUR int trylock();
  NSUV_INLINE void unlock();
  // Return if destroy() has been called on the mutex.
  NSUV_INLINE bool destroyed();
  NSUV_INLINE uv_mutex_t* base();

  class scoped_lock {
   public:
    scoped_lock() = delete;
    scoped_lock(scoped_lock&&) = delete;
    scoped_lock& operator=(const scoped_lock&) = delete;
    scoped_lock& operator=(scoped_lock&&) = delete;
    NSUV_INLINE explicit scoped_lock(ns_mutex* mutex);
    NSUV_INLINE explicit scoped_lock(const ns_mutex& mutex);
    NSUV_INLINE ~scoped_lock();

   private:
    const ns_mutex& ns_mutex_;
  };

 private:
  friend class scoped_lock;
  mutable uv_mutex_t mutex_;
  bool auto_destruct_ = false;
  bool destroyed_ = false;
};


/* ns_rwlock */

class ns_rwlock {
 public:
  // Constructor for allowing auto init() and destroy().
  NSUV_INLINE explicit ns_rwlock(int* er);
  ns_rwlock() = default;
  NSUV_INLINE ~ns_rwlock();

  // Leaving the manual init() available in case the user decides to use the
  // default constructor. For cases where default constructor must be used,
  // such as being placed as a class member, pass true to init() to enable auto
  // destroy().
  NSUV_INLINE NSUV_WUR int init(bool ad = false);
  NSUV_INLINE void destroy();
  NSUV_INLINE void rdlock();
  NSUV_INLINE NSUV_WUR int tryrdlock();
  NSUV_INLINE void rdunlock();
  NSUV_INLINE void wrlock();
  NSUV_INLINE NSUV_WUR int trywrlock();
  NSUV_INLINE void wrunlock();
  // Return if destroy() has been called on the mutex.
  NSUV_INLINE bool destroyed();
  NSUV_INLINE uv_rwlock_t* base();

  class scoped_rdlock {
   public:
    scoped_rdlock() = delete;
    scoped_rdlock(scoped_rdlock&&) = delete;
    scoped_rdlock& operator=(const scoped_rdlock&) = delete;
    scoped_rdlock& operator=(scoped_rdlock&&) = delete;
    NSUV_INLINE explicit scoped_rdlock(ns_rwlock* lock);
    NSUV_INLINE explicit scoped_rdlock(const ns_rwlock& lock);
    NSUV_INLINE ~scoped_rdlock();

   private:
    const ns_rwlock& ns_rwlock_;
  };

  class scoped_wrlock {
   public:
    scoped_wrlock() = delete;
    scoped_wrlock(scoped_wrlock&&) = delete;
    scoped_wrlock& operator=(const scoped_wrlock&) = delete;
    scoped_wrlock& operator=(scoped_wrlock&&) = delete;
    NSUV_INLINE explicit scoped_wrlock(ns_rwlock* lock);
    NSUV_INLINE explicit scoped_wrlock(const ns_rwlock& lock);
    NSUV_INLINE ~scoped_wrlock();

   private:
    const ns_rwlock& ns_rwlock_;
  };

 private:
  friend class scoped_rdlock;
  friend class scoped_wrlock;
  mutable uv_rwlock_t lock_;
  bool auto_destruct_ = false;
  bool destroyed_ = false;
};


/* ns_thread */

class ns_thread {
 public:
  NSUV_CB_FNS(ns_thread_cb, ns_thread*)

  NSUV_INLINE NSUV_WUR int create(ns_thread_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int create(ns_thread_cb_d<D_T> cb, D_T* data);
  NSUV_INLINE NSUV_WUR int create(void (*cb)(ns_thread*, void*),
                                  std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int create(ns_thread_cb_wp<D_T> cb,
                                  std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int create_ex(const uv_thread_options_t* params,
                                     ns_thread_cb cb);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int create_ex(const uv_thread_options_t* params,
                                     ns_thread_cb_d<D_T> cb,
                                     D_T* data);
  NSUV_INLINE NSUV_WUR int create_ex(const uv_thread_options_t* params,
                                     void (*cb)(ns_thread*, void*),
                                     std::nullptr_t);
  template <typename D_T>
  NSUV_INLINE NSUV_WUR int create_ex(const uv_thread_options_t* params,
                                     ns_thread_cb_wp<D_T> cb,
                                     std::weak_ptr<D_T> data);
  NSUV_INLINE NSUV_WUR int join();
  NSUV_INLINE uv_thread_t base();
  NSUV_INLINE NSUV_WUR bool equal(uv_thread_t* t2);
  NSUV_INLINE NSUV_WUR bool equal(uv_thread_t&& t2);
  NSUV_INLINE NSUV_WUR bool equal(ns_thread* t2);
  NSUV_INLINE NSUV_WUR bool equal(ns_thread&& t2);
  static NSUV_INLINE bool equal(const uv_thread_t& t1, const uv_thread_t& t2);
  static NSUV_INLINE bool equal(uv_thread_t&& t1, uv_thread_t&& t2);
  static NSUV_INLINE uv_thread_t self();

 private:
  NSUV_PROXY_FNS(create_proxy_, void* arg)

  uv_thread_t thread_;
  void (*thread_cb_ptr_)() = nullptr;
  void* thread_cb_data_ = nullptr;
  std::weak_ptr<void> thread_cb_wp_;
};

}  // namespace nsuv

#undef NSUV_CB_FNS
#undef NSUV_PROXY_FNS
#undef NSUV_INLINE
#undef NSUV_WUR

#endif  // INCLUDE_NSUV_H_
