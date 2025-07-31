#ifndef AGENTS_SRC_HTTP_CLIENT_H_
#define AGENTS_SRC_HTTP_CLIENT_H_

#include <curl/curl.h>
#include <string>

#include "nsuv-inl.h"

namespace node {
namespace nsolid {

class HttpClient;

struct HttpClientStor {
  HttpClient* client;
  void* data;
};

class CurlContext {
 public:
  using poll_cb = void(*)(nsuv::ns_poll*, int, int);

  explicit CurlContext(HttpClient* http_client, curl_socket_t sockfd);
  ~CurlContext();

  int start(int events, poll_cb cb);

 private:
  friend class HttpClient;
  HttpClient* http_client_;
  nsuv::ns_poll* poll_handle_;
  curl_socket_t sockfd_;
};

class HttpClient {
 public:
  explicit HttpClient(uv_loop_t* loop);
  virtual ~HttpClient();

  virtual void transfer_done(CURLMsg* message, struct HttpClientStor*) {}

 private:
  static int handle_socket_(CURL* easy,
                            curl_socket_t s,
                            int action,
                            void* userp,
                            void* socketp);

  static void on_timeout_(nsuv::ns_timer* timer);

  // NOLINTNEXTLINE(runtime/int)
  static int start_timeout_(CURLM* multi, long timeout_ms, void* userp);

  static void curl_perform_(nsuv::ns_poll* poll, int status, int events);

  void check_multi_info();

 protected:
  static size_t write_cb_(void*, size_t, size_t, void*);

  friend class CurlContext;
  uv_loop_t* loop_;
  nsuv::ns_timer* timeout_;
  CURLM* curl_handle_;
  std::string cacert_;
  size_t cacert_size_;
};

}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_SRC_HTTP_CLIENT_H_
