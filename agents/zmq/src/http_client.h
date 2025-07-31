#ifndef AGENTS_ZMQ_SRC_HTTP_CLIENT_H_
#define AGENTS_ZMQ_SRC_HTTP_CLIENT_H_

#include "../../src/http_client.h"

#include <functional>
#include <memory>

namespace node {
namespace nsolid {
namespace zmq {

// NOLINTNEXTLINE(runtime/int)
using auth_proxy_sig = void(*)(CURLcode, long, const std::string&, void*);

template <typename G>
// NOLINTNEXTLINE(runtime/int)
void auth_proxy_(CURLcode, long, const std::string&, void*);

class ZmqHttpClient: public HttpClient {
 public:
  explicit ZmqHttpClient(uv_loop_t* loop);
  ~ZmqHttpClient() {}

  template <typename Cb, typename... Data>
  void auth(const std::string& url,
            const std::string& saas_token,
            Cb&& cb,
            Data&&... data);

  virtual void transfer_done(CURLMsg* message, struct HttpClientStor* stor);

 private:
  static size_t write_cb_(char*, size_t, size_t, void*);

  void do_auth(const std::string& url,
               const std::string& saas_token,
               auth_proxy_sig proxy,
               void* data);
};


template <typename G>
void auth_proxy_(CURLcode result,
                 long status,  // NOLINT(runtime/int)
                 const std::string& body,
                 void* user_data) {
  G* g = static_cast<G*>(user_data);
  (*g)(result, status, body);
  delete g;
}


template <typename Cb, typename... Data>
void ZmqHttpClient::auth(const std::string& url,
                         const std::string& saas_token,
                         Cb&& cb,
                         Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, _3, std::forward<Data>(data)...));

  // _1 - CURLcode result
  // _2 - long status_code
  // _3 - std::string response_body
  UserData* user_data = new UserData(std::bind(
        std::forward<Cb>(cb), _1, _2, _3, std::forward<Data>(data)...));

  do_auth(url, saas_token, auth_proxy_<UserData>, user_data);
}

}  // namespace zmq
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_ZMQ_SRC_HTTP_CLIENT_H_
