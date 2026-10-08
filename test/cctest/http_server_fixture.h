#ifndef TEST_CCTEST_HTTP_SERVER_FIXTURE_H_
#define TEST_CCTEST_HTTP_SERVER_FIXTURE_H_

#include <string>
#include <unordered_map>

#include "nsuv-inl.h"
#include "llhttp.h"

class HttpServer;

struct HttpRequest {
  HttpServer* server;
  nsuv::ns_tcp* client;
  uint8_t method;
  std::string url;
  std::unordered_map<std::string, std::string> headers;
  // To temporarely store header field and value.
  std::string aux0;
  std::string aux1;
};

using request_cb = void(*)(const HttpRequest&);

class HttpServer {
 public:
  explicit HttpServer(uv_loop_t* loop);
  ~HttpServer();

  void Close();
  void Start(int* port, request_cb cb);
  void HandleClient(nsuv::ns_tcp* client);
  void HandleRequest(nsuv::ns_tcp* client, const uv_buf_t* buf, ssize_t nread);
  void SendResponse(nsuv::ns_tcp* client,
                    int response_code,
                    const std::string& content_type = "plain/text",
                    const std::string& response_body = "");

 private:
  // llhttp callbacks
  static int on_url(llhttp_t*, const char*, size_t);
  static int on_header_field(llhttp_t*, const char*, size_t);
  static int on_header_value(llhttp_t*, const char*, size_t);
  static int on_message_complete(llhttp_t*);
  static int on_method_complete(llhttp_t*);
  static int on_header_field_complete(llhttp_t*);
  static int on_header_value_complete(llhttp_t*);

 private:
  uv_loop_t* loop_;
  nsuv::ns_tcp server_;
  request_cb request_cb_ = nullptr;
};

#endif  // TEST_CCTEST_HTTP_SERVER_FIXTURE_H_
