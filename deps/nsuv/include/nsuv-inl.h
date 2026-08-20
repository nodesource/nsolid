#ifndef INCLUDE_NSUV_INL_H_
#define INCLUDE_NSUV_INL_H_

#include "./nsuv.h"

#if !defined(_WIN32)
#include <sys/un.h>  // sockaddr_un
#endif

#include <cstdlib>  // abort
#include <cstring>  // memcpy
#include <new>      // nothrow
#include <type_traits>  // is_trivial

namespace nsuv {

#define NSUV_CAST_NULLPTR static_cast<void*>(nullptr)

#define NSUV_OK 0

/* ns_base_req */

template <class UV_T, class R_T>
template <typename CB, typename D_T>
void ns_base_req<UV_T, R_T>::init(uv_loop_t* loop, CB cb, D_T* data) {
  req_cb_ = reinterpret_cast<void (*)()>(cb);
  req_cb_data_ = data;
  loop_ = loop;
}

template <class UV_T, class R_T>
template <typename CB, typename D_T>
void ns_base_req<UV_T, R_T>::init(uv_loop_t* loop,
                                  CB cb,
                                  std::weak_ptr<D_T> data) {
  req_cb_ = reinterpret_cast<void (*)()>(cb);
  req_cb_wp_ = data;
  loop_ = loop;
}

template <class UV_T, class R_T>
uv_loop_t* ns_base_req<UV_T, R_T>::get_loop() {
  return loop_;
}

template <class UV_T, class R_T>
UV_T* ns_base_req<UV_T, R_T>::uv_req() {
  return static_cast<UV_T*>(this);
}

template <class UV_T, class R_T>
uv_req_t* ns_base_req<UV_T, R_T>::base_req() {
  return reinterpret_cast<uv_req_t*>(uv_req());
}

template <class UV_T, class R_T>
uv_req_type ns_base_req<UV_T, R_T>::get_type() {
#if UV_VERSION_HEX >= 70400
  return uv_req_get_type(base_req());
#else
  return UV_T::type;
#endif
}

template <class UV_T, class R_T>
const char* ns_base_req<UV_T, R_T>::type_name() {
#if UV_VERSION_HEX >= 70400
  return uv_req_type_name(get_type());
#else
  switch (get_type()) {
#  define XX(uc, lc)                                                           \
    case UV_##uc:                                                              \
      return #lc;
    UV_REQ_TYPE_MAP(XX)
#  undef XX
    case UV_REQ_TYPE_MAX:
    case UV_UNKNOWN_REQ:
      return nullptr;
  }
  return nullptr;
#endif
}

template <class UV_T, class R_T>
int ns_base_req<UV_T, R_T>::cancel() {
  return uv_cancel(base_req());
}

template <class UV_T, class R_T>
template <typename D_T>
D_T* ns_base_req<UV_T, R_T>::get_data() {
  return static_cast<D_T*>(UV_T::data);
}

template <class UV_T, class R_T>
void ns_base_req<UV_T, R_T>::set_data(void* ptr) {
  UV_T::data = ptr;
}

template <class UV_T, class R_T>
R_T* ns_base_req<UV_T, R_T>::cast(void* req) {
  return cast(static_cast<uv_req_t*>(req));
}

template <class UV_T, class R_T>
R_T* ns_base_req<UV_T, R_T>::cast(uv_req_t* req) {
  return cast(reinterpret_cast<UV_T*>(req));
}

template <class UV_T, class R_T>
R_T* ns_base_req<UV_T, R_T>::cast(UV_T* req) {
  return static_cast<R_T*>(req);
}

/* ns_req */

template <class UV_T, class R_T, class H_T>
template <typename CB, typename D_T>
void ns_req<UV_T, R_T, H_T>::init(CB cb, D_T* data) {
  ns_base_req<UV_T, R_T>::req_cb_ = reinterpret_cast<void (*)()>(cb);
  ns_base_req<UV_T, R_T>::req_cb_data_ = data;
}

template <class UV_T, class R_T, class H_T>
template <typename CB, typename D_T>
void ns_req<UV_T, R_T, H_T>::init(CB cb, std::weak_ptr<D_T> data) {
  ns_base_req<UV_T, R_T>::req_cb_ = reinterpret_cast<void (*)()>(cb);
  ns_base_req<UV_T, R_T>::req_cb_wp_ = data;
}

template <class UV_T, class R_T, class H_T>
H_T* ns_req<UV_T, R_T, H_T>::handle() {
  return H_T::cast(static_cast<UV_T*>(this)->handle);
}

template <class UV_T, class R_T, class H_T>
void ns_req<UV_T, R_T, H_T>::handle(H_T* handle) {
  static_cast<UV_T*>(this)->handle = handle->uv_handle();
}

/* ns_connect */

template <class H_T>
template <typename CB, typename D_T>
int ns_connect<H_T>::init(const struct sockaddr* addr, CB cb, D_T* data) {
  int len = util::addr_size(addr);
  if (len < 0)
    return len;

  ns_req<uv_connect_t, ns_connect<H_T>, H_T>::init(cb, data);
  std::memcpy(&addr_, addr, len);

  return NSUV_OK;
}

template <class H_T>
template <typename CB, typename D_T>
int ns_connect<H_T>::init(const struct sockaddr* addr,
                          CB cb,
                          std::weak_ptr<D_T> data) {
  int len = util::addr_size(addr);
  if (len < 0)
    return len;

  ns_req<uv_connect_t, ns_connect<H_T>, H_T>::init(cb, data);
  std::memcpy(&addr_, addr, len);

  return NSUV_OK;
}

template <class H_T>
const sockaddr* ns_connect<H_T>::sockaddr() {
  return reinterpret_cast<struct sockaddr*>(&addr_);
}


/* ns_write */

template <class H_T>
template <typename CB, typename D_T>
int ns_write<H_T>::init(
    const uv_buf_t bufs[], size_t nbufs, CB cb, D_T* data) {
  ns_req<uv_write_t, ns_write<H_T>, H_T>::init(cb, data);

  int er = bufs_.reserve(nbufs);
  if (er)
    return er;
  return bufs_.replace(bufs, nbufs);
}

template <class H_T>
template <typename CB, typename D_T>
int ns_write<H_T>::init(const std::vector<uv_buf_t>& bufs,
                        CB cb,
                        D_T* data) {
  ns_req<uv_write_t, ns_write<H_T>, H_T>::init(cb, data);

  int er = bufs_.reserve(bufs.size());
  if (er)
    return er;
  return bufs_.replace(bufs.data(), bufs.size());
}

template <class H_T>
template <typename CB, typename D_T>
int ns_write<H_T>::init(const uv_buf_t bufs[],
                        size_t nbufs,
                        CB cb,
                        std::weak_ptr<D_T> data) {
  ns_req<uv_write_t, ns_write<H_T>, H_T>::init(cb, data);

  int er = bufs_.reserve(nbufs);
  if (er)
    return er;
  return bufs_.replace(bufs, nbufs);
}

template <class H_T>
template <typename CB, typename D_T>
int ns_write<H_T>::init(const std::vector<uv_buf_t>& bufs,
                        CB cb,
                        std::weak_ptr<D_T> data) {
  ns_req<uv_write_t, ns_write<H_T>, H_T>::init(cb, data);

  int er = bufs_.reserve(bufs.size());
  if (er)
    return er;
  return bufs_.replace(bufs.data(), bufs.size());
}

template <class H_T>
const uv_buf_t* ns_write<H_T>::bufs() {
  return bufs_.data();
}

template <class H_T>
size_t ns_write<H_T>::size() {
  return bufs_.size();
}


/* ns_udp_send */

template <typename CB, typename D_T>
int ns_udp_send::init(const uv_buf_t bufs[],
                      size_t nbufs,
                      const struct sockaddr* addr,
                      CB cb,
                      D_T* data) {
  ns_req<uv_udp_send_t, ns_udp_send, ns_udp>::init(cb, data);

  if (addr != nullptr) {
    addr_.reset(new (std::nothrow) struct sockaddr_storage());
    if (addr == nullptr)
      return UV_ENOMEM;

    int len = util::addr_size(addr);
    if (len < 0)
      return len;

    std::memcpy(addr_.get(), addr, len);
  }

  int er = bufs_.reserve(nbufs);
  if (er)
    return er;
  return bufs_.replace(bufs, nbufs);
}

template <typename CB, typename D_T>
int ns_udp_send::init(const std::vector<uv_buf_t>& bufs,
                      const struct sockaddr* addr,
                      CB cb,
                      D_T* data) {
  ns_req<uv_udp_send_t, ns_udp_send, ns_udp>::init(cb, data);

  if (addr != nullptr) {
    addr_.reset(new (std::nothrow) struct sockaddr_storage());
    if (addr == nullptr)
      return UV_ENOMEM;

    int len = util::addr_size(addr);
    if (len < 0)
      return len;

    std::memcpy(addr_.get(), addr, len);
  }

  int er = bufs_.reserve(bufs.size());
  if (er)
    return er;
  return bufs_.replace(bufs.data(), bufs.size());
}
template <typename CB, typename D_T>
int ns_udp_send::init(const uv_buf_t bufs[],
                      size_t nbufs,
                      const struct sockaddr* addr,
                      CB cb,
                      std::weak_ptr<D_T> data) {
  ns_req<uv_udp_send_t, ns_udp_send, ns_udp>::init(cb, data);

  if (addr != nullptr) {
    addr_.reset(new (std::nothrow) struct sockaddr_storage());
    if (addr == nullptr)
      return UV_ENOMEM;

    int len = util::addr_size(addr);
    if (len < 0)
      return len;

    std::memcpy(addr_.get(), addr, len);
  }

  int er = bufs_.reserve(nbufs);
  if (er)
    return er;
  return bufs_.replace(bufs, nbufs);
}

template <typename CB, typename D_T>
int ns_udp_send::init(const std::vector<uv_buf_t>& bufs,
                      const struct sockaddr* addr,
                      CB cb,
                      std::weak_ptr<D_T> data) {
  ns_req<uv_udp_send_t, ns_udp_send, ns_udp>::init(cb, data);

  if (addr != nullptr) {
    addr_.reset(new (std::nothrow) struct sockaddr_storage());
    if (addr == nullptr)
      return UV_ENOMEM;

    int len = util::addr_size(addr);
    if (len < 0)
      return len;

    std::memcpy(addr_.get(), addr, len);
  }

  int er = bufs_.reserve(bufs.size());
  if (er)
    return er;
  return bufs_.replace(bufs.data(), bufs.size());
}


const uv_buf_t* ns_udp_send::bufs() {
  return bufs_.data();
}

size_t ns_udp_send::size() {
  return bufs_.size();
}

const sockaddr* ns_udp_send::sockaddr() {
  return reinterpret_cast<struct sockaddr*>(addr_.get());
}


/* ns_addrinfo */

ns_addrinfo::ns_addrinfo() {
  // Make sure to assign nullptr right away so there will be no issues with
  // the destructor.
  uv_getaddrinfo_t::addrinfo = nullptr;
}

ns_addrinfo::~ns_addrinfo() {
  // Passing nullptr to uv_freeaddrinfo is a noop
  uv_freeaddrinfo(uv_getaddrinfo_t::addrinfo);
}

template <typename D_T>
int ns_addrinfo::get(uv_loop_t* loop,
                     ns_addrinfo_cb_d<D_T> cb,
                     const char* node,
                     const char* service,
                     const struct addrinfo* hints,
                     D_T* data) {
  ns_base_req<uv_getaddrinfo_t, ns_addrinfo>::init(loop, cb, data);
  free();

  return uv_getaddrinfo(
      loop,
      uv_req(),
      util::check_null_cb(cb, &addrinfo_proxy_<decltype(cb), D_T>),
      node,
      service,
      hints);
}

template <typename D_T>
int ns_addrinfo::get(uv_loop_t* loop,
                     ns_addrinfo_cb_wp<D_T> cb,
                     const char* node,
                     const char* service,
                     const struct addrinfo* hints,
                     std::weak_ptr<D_T> data) {
  ns_base_req<uv_getaddrinfo_t, ns_addrinfo>::init(loop, cb, data);
  free();

  return uv_getaddrinfo(
      loop,
      uv_req(),
      util::check_null_cb(cb, &addrinfo_proxy_wp_<decltype(cb), D_T>),
      node,
      service,
      hints);
}

int ns_addrinfo::get(uv_loop_t* loop,
                     ns_addrinfo_cb cb,
                     const char* node,
                     const char* service,
                     const struct addrinfo* hints) {
  ns_base_req<uv_getaddrinfo_t, ns_addrinfo>::init(loop, cb);
  free();

  return uv_getaddrinfo(loop,
                        uv_req(),
                        util::check_null_cb(cb, &addrinfo_proxy_<decltype(cb)>),
                        node,
                        service,
                        hints);
}

const addrinfo* ns_addrinfo::info() {
  return uv_getaddrinfo_t::addrinfo;
}

void ns_addrinfo::free() {
  uv_freeaddrinfo(uv_getaddrinfo_t::addrinfo);
  uv_getaddrinfo_t::addrinfo = nullptr;
}

template <typename CB_T>
void ns_addrinfo::addrinfo_proxy_(uv_getaddrinfo_t* req,
                                  int status,
                                  struct addrinfo*) {
  auto* ai_req = ns_addrinfo::cast(req);
  auto* cb_ = reinterpret_cast<CB_T>(ai_req->req_cb_);
  cb_(ai_req, status);
}

template <typename CB_T, typename D_T>
void ns_addrinfo::addrinfo_proxy_(uv_getaddrinfo_t* req,
                                  int status,
                                  struct addrinfo*) {
  auto* ai_req = ns_addrinfo::cast(req);
  auto* cb_ = reinterpret_cast<CB_T>(ai_req->req_cb_);
  cb_(ai_req, status, static_cast<D_T*>(ai_req->req_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_addrinfo::addrinfo_proxy_wp_(uv_getaddrinfo_t* req,
                                     int status,
                                     struct addrinfo*) {
  auto* ai_req = ns_addrinfo::cast(req);
  auto* cb_ = reinterpret_cast<CB_T>(ai_req->req_cb_);
  auto data = ai_req->req_cb_wp_.lock();
  cb_(ai_req, status, std::static_pointer_cast<D_T>(data));
}


/* ns_fs */

uv_fs_type ns_fs::get_type() {
  return uv_fs_get_type(this);
}

ssize_t ns_fs::get_result() {
  return uv_fs_get_result(this);
}

int ns_fs::get_system_error() {
  return uv_fs_get_system_error(this);
}

void* ns_fs::get_ptr() {
  return uv_fs_get_ptr(this);
}

const char* ns_fs::get_path() {
  return uv_fs_get_path(this);
}

uv_stat_t* ns_fs::get_statbuf() {
  return uv_fs_get_statbuf(this);
}

void ns_fs::cleanup() {
  return uv_fs_req_cleanup(this);
}

int ns_fs::scandir_next(uv_dirent_t* ent) {
  return uv_fs_scandir_next(this, ent);
}

#define NSUV_ARGS(...) __VA_ARGS__
#define NSUV_STRIP(X) X
#define NSUV_PASS(X) NSUV_STRIP(NSUV_ARGS X)
#define NSUV_FS_FN(name, P1, P2)                                               \
  int ns_fs::name(NSUV_PASS(P1)) {                                             \
    return uv_fs_##name(nullptr, this, NSUV_PASS(P2), nullptr);                \
  }                                                                            \
  int ns_fs::name(uv_loop_t* loop, NSUV_PASS(P1), ns_fs_cb cb) {               \
    ns_base_req<uv_fs_t, ns_fs>::init(loop, cb);                               \
    return uv_fs_##name(loop,                                                  \
                        this,                                                  \
                        NSUV_PASS(P2),                                         \
                        util::check_null_cb(cb, &cb_proxy_<decltype(cb)>));    \
  }                                                                            \
  template <typename D_T>                                                      \
  int ns_fs::name(uv_loop_t* loop, NSUV_PASS(P1), ns_fs_cb_d<D_T> cb, D_T* d) {\
    ns_base_req<uv_fs_t, ns_fs>::init(loop, cb, d);                            \
    return uv_fs_##name(                                                       \
      loop,                                                                    \
      this,                                                                    \
      NSUV_PASS(P2),                                                           \
      util::check_null_cb(cb, &cb_proxy_<decltype(cb), D_T>));                 \
  }                                                                            \
  template <typename D_T>                                                      \
  int ns_fs::name(uv_loop_t* loop,                                             \
                  NSUV_PASS(P1),                                               \
                  ns_fs_cb_wp<D_T> cb,                                         \
                  std::weak_ptr<D_T> d) {                                      \
    ns_base_req<uv_fs_t, ns_fs>::init(loop, cb, d);                            \
    return uv_fs_##name(                                                       \
      loop,                                                                    \
      this,                                                                    \
      NSUV_PASS(P2),                                                           \
      util::check_null_cb(cb, &cb_proxy_wp_<decltype(cb), D_T>));              \
  }

NSUV_FS_FN(close, (uv_file file), (file))
NSUV_FS_FN(open, (const char* path, int flags, int mode), (path, flags, mode))
NSUV_FS_FN(
    read,
    (uv_file file, const uv_buf_t bufs[], unsigned int nbufs, int64_t offset),
    (file, bufs, nbufs, offset))
NSUV_FS_FN(
    read,
    (uv_file file, const std::vector<uv_buf_t>& bufs, int64_t offset),
    (file, bufs.data(), bufs.size(), offset))
NSUV_FS_FN(unlink, (const char* path), (path))
NSUV_FS_FN(
    write,
    (uv_file file, const uv_buf_t bufs[], unsigned int nbufs, int64_t offset),
    (file, bufs, nbufs, offset))
NSUV_FS_FN(
    write,
    (uv_file file, const std::vector<uv_buf_t>& bufs, int64_t offset),
    (file, bufs.data(), bufs.size(), offset))
NSUV_FS_FN(copyfile,
           (const char* path, const char* new_path, int flags),
           (path, new_path, flags))
NSUV_FS_FN(mkdir, (const char* path, int mode), (path, mode))
NSUV_FS_FN(mkdtemp, (const char* tpl), (tpl))
NSUV_FS_FN(mkstemp, (const char* tpl), (tpl))
NSUV_FS_FN(rmdir, (const char* path), (path))
NSUV_FS_FN(scandir, (const char* path, int flags), (path, flags))
NSUV_FS_FN(opendir, (const char* path), (path))
NSUV_FS_FN(readdir, (uv_dir_t* dir), (dir))
NSUV_FS_FN(closedir, (uv_dir_t* dir), (dir))
NSUV_FS_FN(stat, (const char* path), (path))
NSUV_FS_FN(fstat, (uv_file file), (file))
NSUV_FS_FN(rename, (const char* path, const char* new_path), (path, new_path))
NSUV_FS_FN(fsync, (uv_file file), (file))
NSUV_FS_FN(fdatasync, (uv_file file), (file))
NSUV_FS_FN(ftruncate, (uv_file file, int64_t offset), (file, offset))
NSUV_FS_FN(sendfile,
           (uv_file out_fd, uv_file in_fd, int64_t in_offset, size_t length),
           (out_fd, in_fd, in_offset, length))
NSUV_FS_FN(access, (const char* path, int mode), (path, mode))
NSUV_FS_FN(chmod, (const char* path, int mode), (path, mode))
NSUV_FS_FN(utime,
           (const char* path, double atime, double mtime),
           (path, atime, mtime))
NSUV_FS_FN(futime,
           (uv_file file, double atime, double mtime),
           (file, atime, mtime))
NSUV_FS_FN(lutime,
           (const char* path, double atime, double mtime),
           (path, atime, mtime))
NSUV_FS_FN(lstat, (const char* path), (path))
NSUV_FS_FN(link, (const char* path, const char* new_path), (path, new_path))
NSUV_FS_FN(symlink,
           (const char* path, const char* new_path, int flags),
           (path, new_path, flags))
NSUV_FS_FN(readlink, (const char* path), (path))
NSUV_FS_FN(realpath, (const char* path), (path))
NSUV_FS_FN(fchmod, (uv_file file, int mode), (file, mode))
NSUV_FS_FN(chown,
           (const char* path, uv_uid_t uid, uv_gid_t gid),
           (path, uid, gid))
NSUV_FS_FN(fchown, (uv_file file, uv_uid_t uid, uv_gid_t gid), (file, uid, gid))
NSUV_FS_FN(lchown,
           (const char* path, uv_uid_t uid, uv_gid_t gid),
           (path, uid, gid))
NSUV_FS_FN(statfs, (const char* path), (path))

#undef NSUV_FS_FN
#undef NSUV_PASS
#undef NSUV_STRIP
#undef NSUV_ARGS

template <typename CB_T>
void ns_fs::cb_proxy_(uv_fs_t* req) {
  auto* fs_req = ns_fs::cast(req);
  auto* cb = reinterpret_cast<CB_T>(fs_req->req_cb_);
  cb(fs_req);
}

template <typename CB_T, typename D_T>
void ns_fs::cb_proxy_(uv_fs_t* req) {
  auto* fs_req = ns_fs::cast(req);
  auto* cb = reinterpret_cast<CB_T>(fs_req->req_cb_);
  cb(fs_req, static_cast<D_T*>(fs_req->req_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_fs::cb_proxy_wp_(uv_fs_t* req) {
  auto* fs_req = ns_fs::cast(req);
  auto* cb = reinterpret_cast<CB_T>(fs_req->req_cb_);
  auto data = fs_req->req_cb_wp_.lock();
  cb(fs_req, std::static_pointer_cast<D_T>(data));
}


/* ns_random */

int ns_random::get(void* buf, size_t buflen, uint32_t flags) {
  return uv_random(nullptr, nullptr, buf, buflen, flags, nullptr);
}

int ns_random::get(uv_loop_t* loop,
                   void* buf,
                   size_t buflen,
                   uint32_t flags,
                   ns_random_cb cb) {
  ns_base_req<uv_random_t, ns_random>::init(loop, cb);

  return uv_random(loop,
                   this,
                   buf,
                   buflen,
                   flags,
                   util::check_null_cb(cb, &random_proxy_<decltype(cb)>));
}

template <typename D_T>
int ns_random::get(uv_loop_t* loop,
                   void* buf,
                   size_t buflen,
                   uint32_t flags,
                   ns_random_cb_d<D_T> cb,
                   D_T* data) {
  ns_base_req<uv_random_t, ns_random>::init(loop, cb, data);

  return uv_random(loop,
                   this,
                   buf,
                   buflen,
                   flags,
                   util::check_null_cb(cb, &random_proxy_<decltype(cb), D_T>));
}

template <typename D_T>
int ns_random::get(uv_loop_t* loop,
                   void* buf,
                   size_t buflen,
                   uint32_t flags,
                   ns_random_cb_wp<D_T> cb,
                   std::weak_ptr<D_T> data) {
  ns_base_req<uv_random_t, ns_random>::init(loop, cb, data);

  return uv_random(
      loop,
      this,
      buf,
      buflen,
      flags,
      util::check_null_cb(cb, &random_proxy_wp_<decltype(cb), D_T>));
}

template <typename CB_T>
void ns_random::random_proxy_(uv_random_t* req,
                              int status,
                              void* buf,
                              size_t buflen) {
  auto* r_req = ns_random::cast(req);
  auto* cb = reinterpret_cast<CB_T>(r_req->req_cb_);
  cb(r_req, status, buf, buflen);
}

template <typename CB_T, typename D_T>
void ns_random::random_proxy_(uv_random_t* req,
                              int status,
                              void* buf,
                              size_t buflen) {
  auto* r_req = ns_random::cast(req);
  auto* cb = reinterpret_cast<CB_T>(r_req->req_cb_);
  cb(r_req, status, buf, buflen, static_cast<D_T*>(r_req->req_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_random::random_proxy_wp_(uv_random_t* req,
                                 int status,
                                 void* buf,
                                 size_t buflen) {
  auto* r_req = ns_random::cast(req);
  auto* cb = reinterpret_cast<CB_T>(r_req->req_cb_);
  auto data = r_req->req_cb_wp_.lock();
  cb(r_req, status, buf, buflen, std::static_pointer_cast<D_T>(data));
}


/* ns_work */

int ns_work::queue_work(uv_loop_t* loop,
                        ns_work_cb work_cb,
                        ns_after_work_cb after_cb) {
  work_cb_ptr_ = reinterpret_cast<void (*)()>(work_cb);
  after_cb_ptr_ = reinterpret_cast<void (*)()>(after_cb);

  return uv_queue_work(
      loop,
      this,
      util::check_null_cb(work_cb, &work_proxy_<decltype(work_cb)>),
      util::check_null_cb(after_cb, &after_proxy_<decltype(after_cb)>));
}

template <typename D_T>
int ns_work::queue_work(uv_loop_t* loop,
                        ns_work_cb_d<D_T> work_cb,
                        ns_after_work_cb_d<D_T> after_cb,
                        D_T* data) {
  work_cb_ptr_ = reinterpret_cast<void (*)()>(work_cb);
  after_cb_ptr_ = reinterpret_cast<void (*)()>(after_cb);
  cb_data_ = data;

  // Need a nullptr check in case someone decides to static_cast a nullptr to
  // the work_cb sig. Yes the user shouldn't do this but still need to check.
  return uv_queue_work(
      loop,
      this,
      util::check_null_cb(work_cb, &work_proxy_<decltype(work_cb), D_T>),
      util::check_null_cb(after_cb, &after_proxy_<decltype(after_cb), D_T>));
}

template <typename D_T>
int ns_work::queue_work(uv_loop_t* loop,
                        ns_work_cb_wp<D_T> work_cb,
                        ns_after_work_cb_wp<D_T> after_cb,
                        std::weak_ptr<D_T> data) {
  work_cb_ptr_ = reinterpret_cast<void (*)()>(work_cb);
  after_cb_ptr_ = reinterpret_cast<void (*)()>(after_cb);
  cb_wp_ = data;

  // Need a nullptr check in case someone decides to static_cast a nullptr to
  // the work_cb sig. Yes the user shouldn't do this but still need to check.
  return uv_queue_work(
      loop,
      this,
      util::check_null_cb(work_cb, &work_proxy_wp_<decltype(work_cb), D_T>),
      util::check_null_cb(after_cb, &after_proxy_wp_<decltype(after_cb), D_T>));
}

int ns_work::queue_work(uv_loop_t* loop, ns_work_cb work_cb) {
  work_cb_ptr_ = reinterpret_cast<void (*)()>(work_cb);

  return uv_queue_work(
      loop,
      this,
      util::check_null_cb(work_cb, &work_proxy_<decltype(work_cb)>),
      nullptr);
}

template <typename D_T>
int ns_work::queue_work(uv_loop_t* loop,
                        ns_work_cb_d<D_T> work_cb,
                        D_T* data) {
  work_cb_ptr_ = reinterpret_cast<void (*)()>(work_cb);
  cb_data_ = data;

  return uv_queue_work(
      loop,
      this,
      util::check_null_cb(work_cb, &work_proxy_<decltype(work_cb), D_T>),
      nullptr);
}

template <typename D_T>
int ns_work::queue_work(uv_loop_t* loop,
                        ns_work_cb_wp<D_T> work_cb,
                        std::weak_ptr<D_T> data) {
  work_cb_ptr_ = reinterpret_cast<void (*)()>(work_cb);
  cb_wp_ = data;

  return uv_queue_work(
      loop,
      this,
      util::check_null_cb(work_cb, &work_proxy_wp_<decltype(work_cb), D_T>),
      nullptr);
}

template <typename CB_T>
void ns_work::work_proxy_(uv_work_t* req) {
  auto* w_req = ns_work::cast(req);
  auto* cb = reinterpret_cast<CB_T>(w_req->work_cb_ptr_);
  cb(w_req);
}

template <typename CB_T>
void ns_work::after_proxy_(uv_work_t* req, int status) {
  auto* w_req = ns_work::cast(req);
  auto* cb = reinterpret_cast<CB_T>(w_req->after_cb_ptr_);
  cb(w_req, status);
}

template <typename CB_T, typename D_T>
void ns_work::work_proxy_(uv_work_t* req) {
  auto* w_req = ns_work::cast(req);
  auto* cb = reinterpret_cast<CB_T>(w_req->work_cb_ptr_);
  cb(w_req, static_cast<D_T*>(w_req->cb_data_));
}

template <typename CB_T, typename D_T>
void ns_work::work_proxy_wp_(uv_work_t* req) {
  auto* w_req = ns_work::cast(req);
  auto* cb = reinterpret_cast<CB_T>(w_req->work_cb_ptr_);
  auto data = w_req->cb_wp_.lock();
  cb(w_req, std::static_pointer_cast<D_T>(data));
}

template <typename CB_T, typename D_T>
void ns_work::after_proxy_(uv_work_t* req, int status) {
  auto* w_req = ns_work::cast(req);
  auto* cb = reinterpret_cast<CB_T>(w_req->after_cb_ptr_);
  cb(w_req, status, static_cast<D_T*>(w_req->cb_data_));
}

template <typename CB_T, typename D_T>
void ns_work::after_proxy_wp_(uv_work_t* req, int status) {
  auto* w_req = ns_work::cast(req);
  auto* cb = reinterpret_cast<CB_T>(w_req->after_cb_ptr_);
  auto data = w_req->cb_wp_.lock();
  cb(w_req, status, std::static_pointer_cast<D_T>(data));
}


/* ns_handle */

template <class UV_T, class H_T>
UV_T* ns_handle<UV_T, H_T>::uv_handle() {
  return static_cast<UV_T*>(this);
}

template <class UV_T, class H_T>
uv_handle_t* ns_handle<UV_T, H_T>::base_handle() {
  return reinterpret_cast<uv_handle_t*>(uv_handle());
}

template <class UV_T, class H_T>
uv_loop_t* ns_handle<UV_T, H_T>::get_loop() {
  return base_handle()->loop;
}

template <class UV_T, class H_T>
uv_handle_type ns_handle<UV_T, H_T>::get_type() {
#if UV_VERSION_HEX >= 70400
  return uv_handle_get_type(base_handle());
#else
  return UV_T::type;
#endif
}

template <class UV_T, class H_T>
const char* ns_handle<UV_T, H_T>::type_name() {
#if UV_VERSION_HEX >= 70400
  return uv_handle_type_name(get_type());
#else
  switch (get_type()) {
#  define XX(uc, lc)                                                           \
    case UV_##uc:                                                              \
      return #lc;
    UV_HANDLE_TYPE_MAP(XX)
#  undef XX
    case UV_FILE:
      return "file";
    case UV_HANDLE_TYPE_MAX:
    case UV_UNKNOWN_HANDLE:
      return nullptr;
  }
  return nullptr;
#endif
}

template <class UV_T, class H_T>
bool ns_handle<UV_T, H_T>::is_closing() {
  return uv_is_closing(base_handle()) > 0;
}

template <class UV_T, class H_T>
bool ns_handle<UV_T, H_T>::is_active() {
  return uv_is_active(base_handle()) > 0;
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::close() {
  uv_close(base_handle(), nullptr);
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::close(ns_close_cb cb) {
  close_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  uv_close(base_handle(),
           util::check_null_cb(cb, &close_proxy_<decltype(cb)>));
}

template <class UV_T, class H_T>
template <typename D_T>
void ns_handle<UV_T, H_T>::close(ns_close_cb_d<D_T> cb, D_T* data) {
  close_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  close_cb_data_ = data;
  uv_close(base_handle(),
           util::check_null_cb(cb, &close_proxy_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::close(void (*cb)(H_T*, void*), std::nullptr_t) {
  return close(cb, NSUV_CAST_NULLPTR);
}

template <class UV_T, class H_T>
template <typename D_T>
void ns_handle<UV_T, H_T>::close(ns_close_cb_wp<D_T> cb,
                                 std::weak_ptr<D_T> data) {
  close_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  close_cb_wp_ = data;
  uv_close(base_handle(),
           util::check_null_cb(cb, &close_proxy_wp_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::close_and_delete() {
  if (get_type() == UV_UNKNOWN_HANDLE) {
    delete H_T::cast(base_handle());
  } else {
    uv_close(base_handle(), close_delete_cb_);
  }
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::set_data(void* data) {
  UV_T::data = data;
}

template <class UV_T, class H_T>
template <typename D_T>
D_T* ns_handle<UV_T, H_T>::get_data() {
  return static_cast<D_T*>(UV_T::data);
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::unref() {
  uv_unref(base_handle());
}

template <class UV_T, class H_T>
H_T* ns_handle<UV_T, H_T>::cast(void* handle) {
  return cast(static_cast<uv_handle_t*>(handle));
}

template <class UV_T, class H_T>
H_T* ns_handle<UV_T, H_T>::cast(uv_handle_t* handle) {
  return cast(reinterpret_cast<UV_T*>(handle));
}

template <class UV_T, class H_T>
H_T* ns_handle<UV_T, H_T>::cast(UV_T* handle) {
  return static_cast<H_T*>(handle);
}

template <class UV_T, class H_T>
template <typename CB_T>
void ns_handle<UV_T, H_T>::close_proxy_(uv_handle_t* handle) {
  H_T* wrap = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->close_cb_ptr_);
  cb_(wrap);
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_handle<UV_T, H_T>::close_proxy_(uv_handle_t* handle) {
  H_T* wrap = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->close_cb_ptr_);
  cb_(wrap, static_cast<D_T*>(wrap->close_cb_data_));
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_handle<UV_T, H_T>::close_proxy_wp_(uv_handle_t* handle) {
  H_T* wrap = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->close_cb_ptr_);
  auto data = wrap->close_cb_wp_.lock();
  cb_(wrap, std::static_pointer_cast<D_T>(data));
}

template <class UV_T, class H_T>
void ns_handle<UV_T, H_T>::close_delete_cb_(uv_handle_t* handle) {
  delete H_T::cast(handle);
}


/* ns_stream */

template <class UV_T, class H_T>
uv_stream_t* ns_stream<UV_T, H_T>::base_stream() {
  return reinterpret_cast<uv_stream_t*>(this->uv_handle());
}

template <class UV_T, class H_T>
size_t ns_stream<UV_T, H_T>::get_write_queue_size() {
  return uv_stream_get_write_queue_size(base_stream());
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::is_readable() {
  return uv_is_readable(base_stream());
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::is_writable() {
  return uv_is_writable(base_stream());
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::set_blocking(bool blocking) {
  return uv_stream_set_blocking(base_stream(), blocking ? 1 : 0);
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::listen(int backlog, ns_listen_cb cb) {
  listen_cb_ptr_ = reinterpret_cast<void (*)()>(cb);

  return uv_listen(base_stream(),
                   backlog,
                   util::check_null_cb(cb, &listen_proxy_<decltype(cb)>));
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::listen(int backlog,
                                 ns_listen_cb_d<D_T> cb,
                                 D_T* data) {
  listen_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  listen_cb_data_ = data;

  return uv_listen(base_stream(),
                   backlog,
                   util::check_null_cb(cb, &listen_proxy_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::listen(int backlog,
                                 void (*cb)(H_T*, int, void*),
                                 std::nullptr_t) {
  return listen(backlog, cb, NSUV_CAST_NULLPTR);
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::listen(int backlog,
                                 ns_listen_cb_wp<D_T> cb,
                                 std::weak_ptr<D_T> data) {
  listen_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  listen_cb_wp_ = data;

  return uv_listen(
      base_stream(),
      backlog,
      util::check_null_cb(cb, &listen_proxy_wp_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::accept(H_T* handle) {
  return uv_accept(base_stream(), handle->base_stream());
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::read_start(ns_alloc_cb alloc_cb,
                                     ns_read_cb read_cb) {
  alloc_cb_ptr_ = reinterpret_cast<void (*)()>(alloc_cb);
  read_cb_ptr_ = reinterpret_cast<void (*)()>(read_cb);

  return uv_read_start(
      base_stream(),
      util::check_null_cb(alloc_cb, &alloc_proxy_<decltype(alloc_cb)>),
      util::check_null_cb(read_cb, &read_proxy_<decltype(read_cb)>));
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::read_start(ns_alloc_cb_d<D_T> alloc_cb,
                                     ns_read_cb_d<D_T> read_cb,
                                     D_T* data) {
  alloc_cb_ptr_ = reinterpret_cast<void (*)()>(alloc_cb);
  read_cb_ptr_ = reinterpret_cast<void (*)()>(read_cb);
  read_cb_data_ = data;

  return uv_read_start(
      base_stream(),
      util::check_null_cb(alloc_cb, &alloc_proxy_<decltype(alloc_cb), D_T>),
      util::check_null_cb(read_cb, &read_proxy_<decltype(read_cb), D_T>));
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::read_start(ns_alloc_cb_wp<D_T> alloc_cb,
                                     ns_read_cb_wp<D_T> read_cb,
                                     std::weak_ptr<D_T> data) {
  alloc_cb_ptr_ = reinterpret_cast<void (*)()>(alloc_cb);
  read_cb_ptr_ = reinterpret_cast<void (*)()>(read_cb);
  read_cb_wp_ = data;

  return uv_read_start(
      base_stream(),
      util::check_null_cb(alloc_cb, &alloc_proxy_wp_<decltype(alloc_cb), D_T>),
      util::check_null_cb(read_cb, &read_proxy_wp_<decltype(read_cb), D_T>));
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::read_stop() {
  return uv_read_stop(base_stream());
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                ns_write_cb cb) {
  int ret = req->init(bufs, nbufs, cb);
  if (ret != NSUV_OK)
    return ret;

  return uv_write(req->uv_req(),
                  base_stream(),
                  req->bufs(),
                  req->size(),
                  util::check_null_cb(cb, &write_proxy_<decltype(cb)>));
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const std::vector<uv_buf_t>& bufs,
                                ns_write_cb cb) {
  int ret = req->init(bufs, cb);
  if (ret != NSUV_OK)
    return ret;

  return uv_write(req->uv_req(),
                  base_stream(),
                  req->bufs(),
                  req->size(),
                  util::check_null_cb(cb, &write_proxy_<decltype(cb)>));
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                ns_write_cb_d<D_T> cb,
                                D_T* data) {
  int ret = req->init(bufs, nbufs, cb, data);
  if (ret != NSUV_OK)
    return ret;

  return uv_write(req->uv_req(),
                  base_stream(),
                  req->bufs(),
                  req->size(),
                  util::check_null_cb(cb, &write_proxy_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                void (*cb)(ns_write<H_T>*, int, void*),
                                std::nullptr_t) {
  return write(req, bufs, nbufs, cb, NSUV_CAST_NULLPTR);
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const uv_buf_t bufs[],
                                size_t nbufs,
                                ns_write_cb_wp<D_T> cb,
                                std::weak_ptr<D_T> data) {
  int ret = req->init(bufs, nbufs, cb, data);
  if (ret != NSUV_OK)
    return ret;

  return uv_write(req->uv_req(),
                  base_stream(),
                  req->bufs(),
                  req->size(),
                  util::check_null_cb(cb, &write_proxy_wp_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const std::vector<uv_buf_t>& bufs,
                                ns_write_cb_d<D_T> cb,
                                D_T* data) {
  int ret = req->init(bufs, cb, data);
  if (ret != NSUV_OK)
    return ret;

  return uv_write(req->uv_req(),
                  base_stream(),
                  req->bufs(),
                  req->size(),
                  util::check_null_cb(cb, &write_proxy_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const std::vector<uv_buf_t>& bufs,
                                void (*cb)(ns_write<H_T>*, int, void*),
                                std::nullptr_t) {
  return write(req, bufs, cb, NSUV_CAST_NULLPTR);
}

template <class UV_T, class H_T>
template <typename D_T>
int ns_stream<UV_T, H_T>::write(ns_write<H_T>* req,
                                const std::vector<uv_buf_t>& bufs,
                                ns_write_cb_wp<D_T> cb,
                                std::weak_ptr<D_T> data) {
  int ret = req->init(bufs, cb, data);
  if (ret != NSUV_OK)
    return ret;

  return uv_write(req->uv_req(),
                  base_stream(),
                  req->bufs(),
                  req->size(),
                  util::check_null_cb(cb, &write_proxy_wp_<decltype(cb), D_T>));
}

template <class UV_T, class H_T>
template <typename CB_T>
void ns_stream<UV_T, H_T>::listen_proxy_(uv_stream_t* handle, int status) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->listen_cb_ptr_);
  cb_(server, status);
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::listen_proxy_(uv_stream_t* handle, int status) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->listen_cb_ptr_);
  cb_(server, status, static_cast<D_T*>(server->listen_cb_data_));
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::listen_proxy_wp_(uv_stream_t* handle, int status) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->listen_cb_ptr_);
  auto data = server->listen_cb_wp_.lock();
  cb_(server, status, std::static_pointer_cast<D_T>(data));
}

template <class UV_T, class H_T>
template <typename CB_T>
void ns_stream<UV_T, H_T>::alloc_proxy_(uv_handle_t* handle,
                                        size_t suggested_size,
                                        uv_buf_t* buf) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->alloc_cb_ptr_);
  cb_(server, suggested_size, buf);
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::alloc_proxy_(uv_handle_t* handle,
                                        size_t suggested_size,
                                        uv_buf_t* buf) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->alloc_cb_ptr_);
  cb_(server, suggested_size, buf, static_cast<D_T*>(server->read_cb_data_));
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::alloc_proxy_wp_(uv_handle_t* handle,
                                           size_t suggested_size,
                                           uv_buf_t* buf) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->alloc_cb_ptr_);
  auto data = server->read_cb_wp_.lock();
  cb_(server, suggested_size, buf, std::static_pointer_cast<D_T>(data));
}

template <class UV_T, class H_T>
template <typename CB_T>
void ns_stream<UV_T, H_T>::read_proxy_(uv_stream_t* handle,
                                       ssize_t nread,
                                       const uv_buf_t* buf) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->read_cb_ptr_);
  cb_(server, nread, buf);
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::read_proxy_(uv_stream_t* handle,
                                       ssize_t nread,
                                       const uv_buf_t* buf) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->read_cb_ptr_);
  cb_(server, nread, buf, static_cast<D_T*>(server->read_cb_data_));
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::read_proxy_wp_(uv_stream_t* handle,
                                          ssize_t nread,
                                          const uv_buf_t* buf) {
  auto* server = H_T::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(server->read_cb_ptr_);
  auto data = server->read_cb_wp_.lock();
  cb_(server, nread, buf, std::static_pointer_cast<D_T>(data));
}

template <class UV_T, class H_T>
template <typename CB_T>
void ns_stream<UV_T, H_T>::write_proxy_(uv_write_t* uv_req, int status) {
  auto* wreq = ns_write<H_T>::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(wreq->req_cb_);
  cb_(wreq, status);
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::write_proxy_(uv_write_t* uv_req, int status) {
  auto* wreq = ns_write<H_T>::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(wreq->req_cb_);
  cb_(wreq, status, static_cast<D_T*>(wreq->req_cb_data_));
}

template <class UV_T, class H_T>
template <typename CB_T, typename D_T>
void ns_stream<UV_T, H_T>::write_proxy_wp_(uv_write_t* uv_req, int status) {
  auto* wreq = ns_write<H_T>::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(wreq->req_cb_);
  auto data = wreq->req_cb_wp_.lock();
  cb_(wreq, status, std::static_pointer_cast<D_T>(data));
}


/* ns_async */

int ns_async::init(uv_loop_t* loop, ns_async_cb cb) {
  async_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  async_cb_data_ = nullptr;

  return uv_async_init(loop,
                       uv_handle(),
                       util::check_null_cb(cb, &async_proxy_<decltype(cb)>));
}

template <typename D_T>
int ns_async::init(uv_loop_t* loop, ns_async_cb_d<D_T> cb, D_T* data) {
  async_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  async_cb_data_ = data;

  return uv_async_init(
    loop,
    uv_handle(),
    util::check_null_cb(cb, &async_proxy_<decltype(cb), D_T>));
}

int ns_async::init(uv_loop_t* loop,
                   void (*cb)(ns_async*, void*),
                   std::nullptr_t) {
  return init(loop, cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_async::init(uv_loop_t* loop,
                   ns_async_cb_wp<D_T> cb,
                   std::weak_ptr<D_T> data) {
  async_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  async_cb_wp_ = data;

  return uv_async_init(
    loop,
    uv_handle(),
    util::check_null_cb(cb, &async_proxy_wp_<decltype(cb), D_T>));
}

int ns_async::send() {
  return uv_async_send(uv_handle());
}

template <typename CB_T>
void ns_async::async_proxy_(uv_async_t* handle) {
  ns_async* wrap = ns_async::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->async_cb_ptr_);
  cb_(wrap);
}

template <typename CB_T, typename D_T>
void ns_async::async_proxy_(uv_async_t* handle) {
  auto* wrap = ns_async::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->async_cb_ptr_);
  cb_(wrap, static_cast<D_T*>(wrap->async_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_async::async_proxy_wp_(uv_async_t* handle) {
  auto* wrap = ns_async::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->async_cb_ptr_);
  auto data = wrap->async_cb_wp_.lock();
  cb_(wrap, std::static_pointer_cast<D_T>(data));
}


/* ns_poll */

int ns_poll::init(uv_loop_t* loop, int fd) {
  poll_cb_ptr_ = nullptr;
  poll_cb_data_ = nullptr;
  return uv_poll_init(loop, uv_handle(), fd);
}

int ns_poll::init_socket(uv_loop_t* loop, uv_os_sock_t socket) {
  poll_cb_ptr_ = nullptr;
  poll_cb_data_ = nullptr;
  return uv_poll_init_socket(loop, uv_handle(), socket);
}

int ns_poll::start(int events, ns_poll_cb cb) {
  poll_cb_ptr_ = reinterpret_cast<void (*)()>(cb);

  return uv_poll_start(uv_handle(),
                       events,
                       util::check_null_cb(cb, &poll_proxy_<decltype(cb)>));
}

template <typename D_T>
int ns_poll::start(int events,
                   ns_poll_cb_d<D_T> cb,
                   D_T* data) {
  poll_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  poll_cb_data_ = data;

  return uv_poll_start(
    uv_handle(),
    events,
    util::check_null_cb(cb, &poll_proxy_<decltype(cb), D_T>));
}

int ns_poll::start(int events,
                   void (*cb)(ns_poll*, int, int, void*),
                   std::nullptr_t) {
  return start(events, cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_poll::start(int events,
                   ns_poll_cb_wp<D_T> cb,
                   std::weak_ptr<D_T> data) {
  poll_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  poll_cb_wp_ = data;

  return uv_poll_start(
    uv_handle(),
    events,
    util::check_null_cb(cb, &poll_proxy_wp_<decltype(cb), D_T>));
}

int ns_poll::stop() {
  return uv_poll_stop(uv_handle());
}

template <typename CB_T>
void ns_poll::poll_proxy_(uv_poll_t* handle, int poll, int events) {
  ns_poll* wrap = ns_poll::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->poll_cb_ptr_);
  cb_(wrap, poll, events);
}

template <typename CB_T, typename D_T>
void ns_poll::poll_proxy_(uv_poll_t* handle, int poll, int events) {
  ns_poll* wrap = ns_poll::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->poll_cb_ptr_);
  cb_(wrap, poll, events, static_cast<D_T*>(wrap->poll_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_poll::poll_proxy_wp_(uv_poll_t* handle, int poll, int events) {
  ns_poll* wrap = ns_poll::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->poll_cb_ptr_);
  auto data = wrap->poll_cb_wp_.lock();
  cb_(wrap, poll, events, std::static_pointer_cast<D_T>(data));
}


/* ns_tcp */

int ns_tcp::init(uv_loop_t* loop) {
  return uv_tcp_init(loop, uv_handle());
}

int ns_tcp::init_ex(uv_loop_t* loop, unsigned int flags) {
  return uv_tcp_init_ex(loop, uv_handle(), flags);
}

int ns_tcp::open(uv_os_sock_t sock) {
  return uv_tcp_open(uv_handle(), sock);
}

int ns_tcp::nodelay(bool enable) {
  return uv_tcp_nodelay(uv_handle(), enable);
}

int ns_tcp::keepalive(bool enable, int delay) {
  return uv_tcp_keepalive(uv_handle(), enable, delay);
}

int ns_tcp::simultaneous_accepts(bool enable) {
  return uv_tcp_simultaneous_accepts(uv_handle(), enable);
}

int ns_tcp::bind(const struct sockaddr* addr, unsigned int flags) {
  return uv_tcp_bind(uv_handle(), addr, flags);
}

int ns_tcp::getsockname(struct sockaddr* name, int* namelen) {
  return uv_tcp_getsockname(uv_handle(), name, namelen);
}

int ns_tcp::getpeername(struct sockaddr* name, int* namelen) {
  return uv_tcp_getpeername(uv_handle(), name, namelen);
}

int ns_tcp::close_reset(ns_close_cb cb) {
  close_reset_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  return uv_tcp_close_reset(
      uv_handle(),
      util::check_null_cb(cb, &close_reset_proxy_<decltype(cb)>));
}

template <typename D_T>
int ns_tcp::close_reset(ns_close_cb_d<D_T> cb, D_T* data) {
  close_reset_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  close_reset_data_ = data;

  return uv_tcp_close_reset(
      uv_handle(),
      util::check_null_cb(cb, &close_reset_proxy_<decltype(cb), D_T>));
}

int ns_tcp::close_reset(void (*cb)(ns_tcp*, void*), std::nullptr_t) {
  return close_reset(cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_tcp::close_reset(ns_close_cb_wp<D_T> cb, std::weak_ptr<D_T> data) {
  close_reset_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  close_reset_wp_ = data;

  return uv_tcp_close_reset(
      uv_handle(),
      util::check_null_cb(cb, &close_reset_proxy_wp_<decltype(cb), D_T>));
}

int ns_tcp::connect(ns_connect<ns_tcp>* req,
                    const struct sockaddr* addr,
                    ns_connect_cb cb) {
  int ret = req->init(addr, cb);
  if (ret != NSUV_OK)
    return ret;

  return uv_tcp_connect(
      req->uv_req(),
      uv_handle(),
      addr,
      util::check_null_cb(cb, &connect_proxy_<decltype(cb)>));
}

template <typename D_T>
int ns_tcp::connect(ns_connect<ns_tcp>* req,
                    const struct sockaddr* addr,
                    ns_connect_cb_d<D_T> cb,
                    D_T* data) {
  int ret = req->init(addr, cb, data);
  if (ret != NSUV_OK)
    return ret;

  return uv_tcp_connect(
      req->uv_req(),
      uv_handle(),
      addr,
      util::check_null_cb(cb, &connect_proxy_<decltype(cb), D_T>));
}

int ns_tcp::connect(ns_connect<ns_tcp>* req,
                    const struct sockaddr* addr,
                    void (*cb)(ns_connect<ns_tcp>*, int, void*),
                    std::nullptr_t) {
  return connect(req, addr, cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_tcp::connect(ns_connect<ns_tcp>* req,
                    const struct sockaddr* addr,
                    ns_connect_cb_wp<D_T> cb,
                    std::weak_ptr<D_T> data) {
  int ret = req->init(addr, cb, data);
  if (ret != NSUV_OK)
    return ret;

  return uv_tcp_connect(
      req->uv_req(),
      uv_handle(),
      addr,
      util::check_null_cb(cb, &connect_proxy_wp_<decltype(cb), D_T>));
}

template <typename CB_T>
void ns_tcp::connect_proxy_(uv_connect_t* uv_req, int status) {
  auto* creq = ns_connect<ns_tcp>::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(creq->req_cb_);
  cb_(creq, status);
}

template <typename CB_T, typename D_T>
void ns_tcp::connect_proxy_(uv_connect_t* uv_req, int status) {
  auto* creq = ns_connect<ns_tcp>::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(creq->req_cb_);
  cb_(creq, status, static_cast<D_T*>(creq->req_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_tcp::connect_proxy_wp_(uv_connect_t* uv_req, int status) {
  auto* creq = ns_connect<ns_tcp>::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(creq->req_cb_);
  auto data = creq->req_cb_wp_.lock();
  cb_(creq, status, std::static_pointer_cast<D_T>(data));
}

template <typename CB_T>
void ns_tcp::close_reset_proxy_(uv_handle_t* handle) {
  ns_tcp* wrap = ns_tcp::cast(handle);
  auto* cb = reinterpret_cast<CB_T>(wrap->close_reset_cb_ptr_);
  cb(wrap);
}

template <typename CB_T, typename D_T>
void ns_tcp::close_reset_proxy_(uv_handle_t* handle) {
  ns_tcp* wrap = ns_tcp::cast(handle);
  auto* cb = reinterpret_cast<CB_T>(wrap->close_reset_cb_ptr_);
  cb(wrap, static_cast<D_T*>(wrap->close_reset_data_));
}

template <typename CB_T, typename D_T>
void ns_tcp::close_reset_proxy_wp_(uv_handle_t* handle) {
  ns_tcp* wrap = ns_tcp::cast(handle);
  auto* cb = reinterpret_cast<CB_T>(wrap->close_reset_cb_ptr_);
  auto data = wrap->close_reset_wp_.lock();
  cb(wrap, std::static_pointer_cast<D_T>(data));
}


/* ns_timer */

int ns_timer::init(uv_loop_t* loop) {
  timer_cb_ptr_ = nullptr;
  timer_cb_data_ = nullptr;
  return uv_timer_init(loop, uv_handle());
}

int ns_timer::start(ns_timer_cb cb, uint64_t timeout, uint64_t repeat) {
  timer_cb_ptr_ = reinterpret_cast<void (*)()>(cb);

  return uv_timer_start(uv_handle(),
                        util::check_null_cb(cb, &timer_proxy_<decltype(cb)>),
                        timeout,
                        repeat);
}

template <typename D_T>
int ns_timer::start(ns_timer_cb_d<D_T> cb,
                    uint64_t timeout,
                    uint64_t repeat,
                    D_T* data) {
  timer_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  timer_cb_data_ = data;

  return uv_timer_start(
    uv_handle(),
    util::check_null_cb(cb, &timer_proxy_<decltype(cb), D_T>),
    timeout,
    repeat);
}

int ns_timer::start(void (*cb)(ns_timer*, void*),
                    uint64_t timeout,
                    uint64_t repeat,
                    std::nullptr_t) {
  return start(cb, timeout, repeat, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_timer::start(ns_timer_cb_wp<D_T> cb,
                    uint64_t timeout,
                    uint64_t repeat,
                    std::weak_ptr<D_T> data) {
  timer_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  timer_cb_wp_ = data;

  return uv_timer_start(
    uv_handle(),
    util::check_null_cb(cb, &timer_proxy_wp_<decltype(cb), D_T>),
    timeout,
    repeat);
}

int ns_timer::stop() {
  return uv_timer_stop(uv_handle());
}

size_t ns_timer::get_repeat() {
  return uv_timer_get_repeat(uv_handle());
}

template <typename CB_T>
void ns_timer::timer_proxy_(uv_timer_t* handle) {
  ns_timer* wrap = ns_timer::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->timer_cb_ptr_);
  cb_(wrap);
}

template <typename CB_T, typename D_T>
void ns_timer::timer_proxy_(uv_timer_t* handle) {
  ns_timer* wrap = ns_timer::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->timer_cb_ptr_);
  cb_(wrap, static_cast<D_T*>(wrap->timer_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_timer::timer_proxy_wp_(uv_timer_t* handle) {
  ns_timer* wrap = ns_timer::cast(handle);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->timer_cb_ptr_);
  auto data = wrap->timer_cb_wp_.lock();
  cb_(wrap, std::static_pointer_cast<D_T>(data));
}


/* ns_check, ns_idle, ns_prepare */

#define NSUV_LOOP_WATCHER_DEFINE(name)                                         \
  int ns_##name::init(uv_loop_t* loop) {                                       \
    name##_cb_ptr_ = nullptr;                                                  \
    name##_cb_data_ = nullptr;                                                 \
    return uv_##name##_init(loop, uv_handle());                                \
  }                                                                            \
                                                                               \
  int ns_##name::start(ns_##name##_cb cb) {                                    \
    if (is_active())                                                           \
      return 0;                                                                \
    name##_cb_ptr_ = reinterpret_cast<void (*)()>(cb);                         \
    return uv_##name##_start(                                                  \
        uv_handle(),                                                           \
        util::check_null_cb(cb, &name##_proxy_<decltype(cb)>));                \
  }                                                                            \
                                                                               \
  template <typename D_T>                                                      \
  int ns_##name::start(ns_##name##_cb_d<D_T> cb, D_T* data) {                  \
    if (is_active())                                                           \
      return 0;                                                                \
    name##_cb_ptr_ = reinterpret_cast<void (*)()>(cb);                         \
    name##_cb_data_ = data;                                                    \
    return uv_##name##_start(                                                  \
        uv_handle(),                                                           \
        util::check_null_cb(cb, &name##_proxy_<decltype(cb), D_T>));           \
  }                                                                            \
                                                                               \
  int ns_##name::start(void (*cb)(ns_##name*, void*), std::nullptr_t) {        \
    return start(cb, NSUV_CAST_NULLPTR);                                       \
  }                                                                            \
                                                                               \
  template <typename D_T>                                                      \
  int ns_##name::start(ns_##name##_cb_wp<D_T> cb, std::weak_ptr<D_T> data) {   \
    if (is_active())                                                           \
      return 0;                                                                \
    name##_cb_ptr_ = reinterpret_cast<void (*)()>(cb);                         \
    name##_cb_wp_ = data;                                                      \
    return uv_##name##_start(                                                  \
        uv_handle(),                                                           \
        util::check_null_cb(cb, &name##_proxy_wp_<decltype(cb), D_T>));        \
  }                                                                            \
                                                                               \
  int ns_##name::stop() { return uv_##name##_stop(uv_handle()); }              \
                                                                               \
  template <typename CB_T>                                                     \
  void ns_##name::name##_proxy_(uv_##name##_t* handle) {                       \
    ns_##name* wrap = ns_##name::cast(handle);                                 \
    auto* cb_ = reinterpret_cast<CB_T>(wrap->name##_cb_ptr_);                  \
    cb_(wrap);                                                                 \
  }                                                                            \
                                                                               \
  template <typename CB_T, typename D_T>                                       \
  void ns_##name::name##_proxy_(uv_##name##_t* handle) {                       \
    ns_##name* wrap = ns_##name::cast(handle);                                 \
    auto* cb_ = reinterpret_cast<CB_T>(wrap->name##_cb_ptr_);                  \
    cb_(wrap, static_cast<D_T*>(wrap->name##_cb_data_));                       \
  }                                                                            \
                                                                               \
  template <typename CB_T, typename D_T>                                       \
  void ns_##name::name##_proxy_wp_(uv_##name##_t* handle) {                    \
    ns_##name* wrap = ns_##name::cast(handle);                                 \
    auto* cb_ = reinterpret_cast<CB_T>(wrap->name##_cb_ptr_);                  \
    auto data = wrap->name##_cb_wp_.lock();                                    \
    cb_(wrap, std::static_pointer_cast<D_T>(data));                            \
  }


NSUV_LOOP_WATCHER_DEFINE(check)
NSUV_LOOP_WATCHER_DEFINE(idle)
NSUV_LOOP_WATCHER_DEFINE(prepare)

#undef NSUV_LOOP_WATCHER_DEFINE


/* ns_udp */

int ns_udp::init(uv_loop_t* loop) {
  return uv_udp_init(loop, uv_handle());
}

int ns_udp::init_ex(uv_loop_t* loop, unsigned int flags) {
  return uv_udp_init_ex(loop, uv_handle(), flags);
}

int ns_udp::bind(const struct sockaddr* addr, unsigned int flags) {
  int r = uv_udp_bind(uv_handle(), addr, flags);
  if (r == 0) {
    if (addr == nullptr) {
      local_addr_.reset(nullptr);
    } else {
      local_addr_.reset(new (std::nothrow) struct sockaddr_storage());
      if (local_addr_ == nullptr)
        return UV_ENOMEM;

      int len = util::addr_size(addr);
      if (len < 0)
        return len;

      std::memcpy(local_addr_.get(), addr, len);
    }
  }

  return r;
}

int ns_udp::connect(const struct sockaddr* addr) {
  int r = uv_udp_connect(uv_handle(), addr);
  if (r == 0) {
    if (addr == nullptr) {
      remote_addr_.reset(nullptr);
    } else {
      remote_addr_.reset(new (std::nothrow) struct sockaddr_storage());
      if (remote_addr_ == nullptr)
        return UV_ENOMEM;

      int len = util::addr_size(addr);
      if (len < 0)
        return len;

      std::memcpy(remote_addr_.get(), addr, len);
    }
  }

  return r;
}

int ns_udp::getpeername(struct sockaddr* name, int* namelen) {
  return uv_udp_getpeername(uv_handle(), name, namelen);
}

int ns_udp::getsockname(struct sockaddr* name, int* namelen) {
  return uv_udp_getsockname(uv_handle(), name, namelen);
}

int ns_udp::try_send(const uv_buf_t bufs[],
                     size_t nbufs,
                     const struct sockaddr* addr) {
  return uv_udp_try_send(uv_handle(), bufs, nbufs, addr);
}

int ns_udp::try_send(const std::vector<uv_buf_t>& bufs,
                     const struct sockaddr* addr) {
  return uv_udp_try_send(uv_handle(), bufs.data(), bufs.size(), addr);
}

int ns_udp::send(ns_udp_send* req,
                 const uv_buf_t bufs[],
                 size_t nbufs,
                 const struct sockaddr* addr) {
  int r = req->init(bufs, nbufs, addr, NSUV_CAST_NULLPTR);
  if (r != 0)
    return r;

  return uv_udp_send(req->uv_req(),
                     uv_handle(),
                     req->bufs(),
                     req->size(),
                     addr,
                     nullptr);
}

int ns_udp::send(ns_udp_send* req,
                 const std::vector<uv_buf_t>& bufs,
                 const struct sockaddr* addr) {
  int r = req->init(bufs, addr, NSUV_CAST_NULLPTR);
  if (r != 0)
    return r;

  return uv_udp_send(req->uv_req(),
                     uv_handle(),
                     req->bufs(),
                     req->size(),
                     addr,
                     nullptr);
}

int ns_udp::send(ns_udp_send* req,
                 const uv_buf_t bufs[],
                 size_t nbufs,
                 const struct sockaddr* addr,
                 ns_udp_send_cb cb) {
  int r = req->init(bufs, nbufs, addr, cb);
  if (r != 0)
    return r;

  return uv_udp_send(req->uv_req(),
                     uv_handle(),
                     req->bufs(),
                     req->size(),
                     addr,
                     util::check_null_cb(cb, &send_proxy_<decltype(cb)>));
}

int ns_udp::send(ns_udp_send* req,
                 const std::vector<uv_buf_t>& bufs,
                 const struct sockaddr* addr,
                 ns_udp_send_cb cb) {
  int r = req->init(bufs, addr, cb);
  if (r != 0)
    return r;

  return uv_udp_send(req->uv_req(),
                     uv_handle(),
                     req->bufs(),
                     req->size(),
                     addr,
                     util::check_null_cb(cb, &send_proxy_<decltype(cb)>));
}

template <typename D_T>
int ns_udp::send(ns_udp_send* req,
                 const uv_buf_t bufs[],
                 size_t nbufs,
                 const struct sockaddr* addr,
                 ns_udp_send_cb_d<D_T> cb,
                 D_T* data) {
  int r = req->init(bufs, nbufs, addr, cb, data);
  if (r != 0)
    return r;

  return uv_udp_send(req->uv_req(),
                     uv_handle(),
                     req->bufs(),
                     req->size(),
                     addr,
                     util::check_null_cb(cb, &send_proxy_<decltype(cb), D_T>));
}

int ns_udp::send(ns_udp_send* req,
                 const uv_buf_t bufs[],
                 size_t nbufs,
                 const struct sockaddr* addr,
                 void (*cb)(ns_udp_send*, int, void*),
                 std::nullptr_t) {
  return send(req, bufs, nbufs, addr, cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_udp::send(ns_udp_send* req,
                 const uv_buf_t bufs[],
                 size_t nbufs,
                 const struct sockaddr* addr,
                 ns_udp_send_cb_wp<D_T> cb,
                 std::weak_ptr<D_T> data) {
  int r = req->init(bufs, nbufs, addr, cb, data);
  if (r != 0)
    return r;

  return uv_udp_send(
      req->uv_req(),
      uv_handle(),
      req->bufs(),
      req->size(),
      addr,
      util::check_null_cb(cb, &send_proxy_wp_<decltype(cb), D_T>));
}

template <typename D_T>
int ns_udp::send(ns_udp_send* req,
                 const std::vector<uv_buf_t>& bufs,
                 const struct sockaddr* addr,
                 ns_udp_send_cb_d<D_T> cb,
                 D_T* data) {
  int r = req->init(bufs, addr, cb, data);
  if (r != 0)
    return r;

  return uv_udp_send(req->uv_req(),
                     uv_handle(),
                     req->bufs(),
                     req->size(),
                     addr,
                     util::check_null_cb(cb, &send_proxy_<decltype(cb), D_T>));
}

int ns_udp::send(ns_udp_send* req,
                 const std::vector<uv_buf_t>& bufs,
                 const struct sockaddr* addr,
                 void (*cb)(ns_udp_send*, int, void*),
                 std::nullptr_t) {
  return send(req, bufs, addr, cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_udp::send(ns_udp_send* req,
                 const std::vector<uv_buf_t>& bufs,
                 const struct sockaddr* addr,
                 ns_udp_send_cb_wp<D_T> cb,
                 std::weak_ptr<D_T> data) {
  int r = req->init(bufs, addr, cb, data);
  if (r != 0)
    return r;

  return uv_udp_send(
      req->uv_req(),
      uv_handle(),
      req->bufs(),
      req->size(),
      addr,
      util::check_null_cb(cb, &send_proxy_wp_<decltype(cb), D_T>));
}

const sockaddr* ns_udp::local_addr() {
  if (local_addr_ == nullptr) {
    local_addr_.reset(new (std::nothrow) struct sockaddr_storage());
    if (local_addr_ == nullptr)
      return nullptr;

    int len = sizeof(struct sockaddr_storage);
    int r = getsockname(
        reinterpret_cast<struct sockaddr*>(local_addr_.get()),
        &len);
    if (r != 0)
      local_addr_.reset(nullptr);
  }

  return reinterpret_cast<struct sockaddr*>(local_addr_.get());
}

const sockaddr* ns_udp::remote_addr() {
  return reinterpret_cast<struct sockaddr*>(remote_addr_.get());
}

template <typename CB_T>
void ns_udp::send_proxy_(uv_udp_send_t* uv_req, int status) {
  auto* ureq = ns_udp_send::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(ureq->req_cb_);
  cb_(ureq, status);
}

template <typename CB_T, typename D_T>
void ns_udp::send_proxy_(uv_udp_send_t* uv_req, int status) {
  auto* ureq = ns_udp_send::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(ureq->req_cb_);
  cb_(ureq, status, static_cast<D_T*>(ureq->req_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_udp::send_proxy_wp_(uv_udp_send_t* uv_req, int status) {
  auto* ureq = ns_udp_send::cast(uv_req);
  auto* cb_ = reinterpret_cast<CB_T>(ureq->req_cb_);
  auto data = ureq->req_cb_wp_.lock();
  cb_(ureq, status, std::static_pointer_cast<D_T>(data));
}


/* ns_mutex */

ns_mutex::ns_mutex(int* er, bool recursive) : auto_destruct_(true) {
  *er = recursive ? init_recursive() : init();
}

ns_mutex::~ns_mutex() {
  if (auto_destruct_ && !destroyed_)
    destroy();
}

int ns_mutex::init(bool ad) {
  auto_destruct_ = ad;
  destroyed_ = false;
  return uv_mutex_init(&mutex_);
}

int ns_mutex::init_recursive(bool ad) {
  auto_destruct_ = ad;
  destroyed_ = false;
  return uv_mutex_init_recursive(&mutex_);
}

void ns_mutex::destroy() {
  destroyed_ = true;
  uv_mutex_destroy(&mutex_);
}

void ns_mutex::lock() {
  uv_mutex_lock(&mutex_);
}

int ns_mutex::trylock() {
  return uv_mutex_trylock(&mutex_);
}

void ns_mutex::unlock() {
  uv_mutex_unlock(&mutex_);
}

bool ns_mutex::destroyed() {
  return destroyed_;
}

uv_mutex_t* ns_mutex::base() {
  return &mutex_;
}

ns_mutex::scoped_lock::scoped_lock(ns_mutex* mutex) : ns_mutex_(*mutex) {
  uv_mutex_lock(&ns_mutex_.mutex_);
}

ns_mutex::scoped_lock::scoped_lock(const ns_mutex& mutex) : ns_mutex_(mutex) {
  uv_mutex_lock(&ns_mutex_.mutex_);
}

ns_mutex::scoped_lock::~scoped_lock() {
  uv_mutex_unlock(&ns_mutex_.mutex_);
}

/* ns_rwlock */

ns_rwlock::ns_rwlock(int* er) : auto_destruct_(true) {
  *er = init();
}

ns_rwlock::~ns_rwlock() {
  if (auto_destruct_)
    destroy();
}

int ns_rwlock::init(bool ad) {
  auto_destruct_ = ad;
  destroyed_ = false;
  return uv_rwlock_init(&lock_);
}

void ns_rwlock::destroy() {
  destroyed_ = true;
  uv_rwlock_destroy(&lock_);
}

void ns_rwlock::rdlock() {
  uv_rwlock_rdlock(&lock_);
}

int ns_rwlock::tryrdlock() {
  return uv_rwlock_tryrdlock(&lock_);
}

void ns_rwlock::rdunlock() {
  uv_rwlock_rdunlock(&lock_);
}

void ns_rwlock::wrlock() {
  uv_rwlock_wrlock(&lock_);
}

int ns_rwlock::trywrlock() {
  return uv_rwlock_trywrlock(&lock_);
}

void ns_rwlock::wrunlock() {
  uv_rwlock_wrunlock(&lock_);
}

bool ns_rwlock::destroyed() {
  return destroyed_;
}

uv_rwlock_t* ns_rwlock::base() {
  return &lock_;
}

ns_rwlock::scoped_rdlock::scoped_rdlock(ns_rwlock* lock) : ns_rwlock_(*lock) {
  uv_rwlock_rdlock(&ns_rwlock_.lock_);
}

ns_rwlock::scoped_rdlock::scoped_rdlock(const ns_rwlock& lock) :
    ns_rwlock_(lock) {
  uv_rwlock_rdlock(&ns_rwlock_.lock_);
}

ns_rwlock::scoped_rdlock::~scoped_rdlock() {
  uv_rwlock_rdunlock(&ns_rwlock_.lock_);
}

ns_rwlock::scoped_wrlock::scoped_wrlock(ns_rwlock* lock) : ns_rwlock_(*lock) {
  uv_rwlock_wrlock(&ns_rwlock_.lock_);
}

ns_rwlock::scoped_wrlock::scoped_wrlock(const ns_rwlock& lock) :
    ns_rwlock_(lock) {
  uv_rwlock_wrlock(&ns_rwlock_.lock_);
}

ns_rwlock::scoped_wrlock::~scoped_wrlock() {
  uv_rwlock_wrunlock(&ns_rwlock_.lock_);
}


/* ns_thread */

int ns_thread::create(ns_thread_cb cb) {
  thread_cb_ptr_ = reinterpret_cast<void (*)()>(cb);

  return uv_thread_create(&thread_,
                          util::check_null_cb(cb, &create_proxy_<decltype(cb)>),
                          this);
}

template <typename D_T>
int ns_thread::create(ns_thread_cb_d<D_T> cb, D_T* data) {
  thread_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  thread_cb_data_ = data;

  return uv_thread_create(
      &thread_,
      util::check_null_cb(cb, &create_proxy_<decltype(cb), D_T>),
      this);
}

int ns_thread::create(void (*cb)(ns_thread*, void*), std::nullptr_t) {
  return create(cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_thread::create(ns_thread_cb_wp<D_T> cb, std::weak_ptr<D_T> data) {
  thread_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  thread_cb_wp_ = data;

  return uv_thread_create(
      &thread_,
      util::check_null_cb(cb, &create_proxy_wp_<decltype(cb), D_T>),
      this);
}

int ns_thread::create_ex(const uv_thread_options_t* params,
                         ns_thread_cb cb) {
  thread_cb_ptr_ = reinterpret_cast<void (*)()>(cb);

  return uv_thread_create_ex(
      &thread_,
      params,
      util::check_null_cb(cb, &create_proxy_<decltype(cb)>),
      this);
}

template <typename D_T>
int ns_thread::create_ex(const uv_thread_options_t* params,
                         ns_thread_cb_d<D_T> cb,
                         D_T* data) {
  thread_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  thread_cb_data_ = data;

  return uv_thread_create_ex(
      &thread_,
      params,
      util::check_null_cb(cb, &create_proxy_<decltype(cb), D_T>),
      this);
}

int ns_thread::create_ex(const uv_thread_options_t* params,
                         void (*cb)(ns_thread*, void*),
                         std::nullptr_t) {
  return create_ex(params, cb, NSUV_CAST_NULLPTR);
}

template <typename D_T>
int ns_thread::create_ex(const uv_thread_options_t* params,
                         ns_thread_cb_wp<D_T> cb,
                         std::weak_ptr<D_T> data) {
  thread_cb_ptr_ = reinterpret_cast<void (*)()>(cb);
  thread_cb_wp_ = data;

  return uv_thread_create_ex(
      &thread_,
      params,
      util::check_null_cb(cb, &create_proxy_wp_<decltype(cb), D_T>),
      this);
}

int ns_thread::join() {
  return uv_thread_join(&thread_);
}

uv_thread_t ns_thread::base() {
  return thread_;
}

bool ns_thread::equal(uv_thread_t* t2) {
  return uv_thread_equal(&thread_, t2) == 0;
}

bool ns_thread::equal(uv_thread_t&& t2) {
  return uv_thread_equal(&thread_, &t2) == 0;
}

bool ns_thread::equal(ns_thread* t2) {
  return t2->equal(&thread_) == 0;
}

bool ns_thread::equal(ns_thread&& t2) {
  return t2.equal(&thread_) == 0;
}

bool ns_thread::equal(const uv_thread_t& t1, const uv_thread_t& t2) {
  return uv_thread_equal(&t1, &t2) == 0;
}

bool ns_thread::equal(uv_thread_t&& t1, uv_thread_t&& t2) {
  return uv_thread_equal(&t1, &t2) == 0;
}

uv_thread_t ns_thread::self() {
  return uv_thread_self();
}

template <typename CB_T>
void ns_thread::create_proxy_(void* arg) {
  auto* wrap = static_cast<ns_thread*>(arg);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->thread_cb_ptr_);
  cb_(wrap);
}

template <typename CB_T, typename D_T>
void ns_thread::create_proxy_(void* arg) {
  auto* wrap = static_cast<ns_thread*>(arg);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->thread_cb_ptr_);
  cb_(wrap, static_cast<D_T*>(wrap->thread_cb_data_));
}

template <typename CB_T, typename D_T>
void ns_thread::create_proxy_wp_(void* arg) {
  auto* wrap = static_cast<ns_thread*>(arg);
  auto* cb_ = reinterpret_cast<CB_T>(wrap->thread_cb_ptr_);
  auto data = wrap->thread_cb_wp_.lock();
  cb_(wrap, std::static_pointer_cast<D_T>(data));
}

int util::addr_size(const struct sockaddr* addr) {
  if (addr == nullptr) {
    return 0;
  }

  int len;
  if (addr->sa_family == AF_INET) {
    len = sizeof(struct sockaddr_in);
  } else if (addr->sa_family == AF_INET6) {
    len = sizeof(struct sockaddr_in6);
#if defined(AF_UNIX) && !defined(_WIN32)
  } else if (addr->sa_family == AF_UNIX) {
    len = sizeof(struct sockaddr_un);
#endif
  } else {
    return UV_EINVAL;
  }

  return len;
}

template <typename T, typename U>
T util::check_null_cb(U cb, T proxy) {
  if (cb == nullptr) return nullptr;
  return proxy;
}

template <class T>
util::no_throw_vec<T>::~no_throw_vec() {
  if (data_ != datasml_)
    delete[] data_;
}

template <class T>
const T* util::no_throw_vec<T>::data() {
  return data_;
}

template <class T>
size_t util::no_throw_vec<T>::size() {
  return size_;
}

template <class T>
int util::no_throw_vec<T>::reserve(size_t n) {
  // There's no need to handle the n == 0 case since it's unlikely to
  // happen, and if it does then there's no harm in allocating an array of 0.
  if (n > sizeof(datasml_) / sizeof(datasml_[0])) {
    if (data_ == datasml_) {
      data_ = new (std::nothrow) T[n]();
      if (data_ == nullptr)
        return UV_ENOMEM;
      capacity_ = n;

    } else if (capacity_ < n) {
      if (data_ != datasml_)
        delete[] data_;
      data_ = datasml_;
      capacity_ = sizeof(datasml_) / sizeof(datasml_[0]);
    }
  } else {
    if (data_ != datasml_)
      delete[] data_;
    data_ = datasml_;
    capacity_ = sizeof(datasml_) / sizeof(datasml_[0]);
  }
  return NSUV_OK;
}

template <class T>
int util::no_throw_vec<T>::replace(const T* b, size_t n) {
  // This shouldn't be necessary, but just for safety of the memcpy().
  static_assert(std::is_trivially_copyable<T>::value,
                "type is not trivially copyable");

  memcpy(data_, b, n * sizeof(b[0]));
  // Zero out the remaining values.
  if (n < capacity_)
    memset(&data_[n], 0, (capacity_ - n) * sizeof(data_[0]));
  size_ = n;

  return NSUV_OK;
}

#undef NSUV_CAST_NULLPTR

}  // namespace nsuv

#endif  // INCLUDE_NSUV_INL_H_
