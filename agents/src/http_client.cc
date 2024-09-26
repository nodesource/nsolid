#include "http_client.h"
#include "util.h"

#include <queue>

#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {

static const char* const root_certs[] = {
#include "node_root_certs.h"  // NOLINT(build/include_order)
};

CurlContext::CurlContext(HttpClient* http_client, curl_socket_t sockfd):
    http_client_(http_client),
    poll_handle_(new nsuv::ns_poll),
    sockfd_(sockfd) {
  ASSERT_EQ(0, poll_handle_->init_socket(http_client->loop_, sockfd));
  poll_handle_->set_data(this);
}

CurlContext::~CurlContext() {
  poll_handle_->close_and_delete();
}

int CurlContext::start(int events, poll_cb cb) {
  return poll_handle_->start(events, cb);
}

HttpClient::HttpClient(uv_loop_t* loop): loop_(loop),
                                         timeout_(new nsuv::ns_timer) {
  ASSERT_EQ(0, timeout_->init(loop));
  timeout_->set_data(this);
  ASSERT_EQ(0, curl_global_init(CURL_GLOBAL_ALL));
  curl_handle_ = curl_multi_init();
  ASSERT_NOT_NULL(curl_handle_);
  ASSERT_EQ(0, curl_multi_setopt(curl_handle_,
                                 CURLMOPT_SOCKETFUNCTION,
                                 handle_socket_));
  ASSERT_EQ(0, curl_multi_setopt(curl_handle_, CURLMOPT_SOCKETDATA, this));
  ASSERT_EQ(0, curl_multi_setopt(curl_handle_,
                                 CURLMOPT_TIMERFUNCTION,
                                 start_timeout_));
  ASSERT_EQ(0, curl_multi_setopt(curl_handle_, CURLMOPT_TIMERDATA, this));
  for (size_t i = 0; i < node::arraysize(root_certs); i++) {
    cacert_ += root_certs[i];
    cacert_ += "\n";
  }
}

HttpClient::~HttpClient() {
  timeout_->close_and_delete();
  curl_multi_cleanup(curl_handle_);
}

void HttpClient::check_multi_info() {
  CURLMsg* message;
  int pending;
  std::queue<CURLMsg*> q;
  while ((message = curl_multi_info_read(curl_handle_, &pending))) {
    switch (message->msg) {
      case CURLMSG_DONE:
        q.push(message);
      break;
      default:
      break;
    }
  }

  CURL* easy_handle;
  while (!q.empty()) {
    CURLMsg* message = q.front();
    easy_handle = message->easy_handle;
    curl_multi_remove_handle(curl_handle_, easy_handle);
    struct HttpClientStor* stor;
    curl_easy_getinfo(easy_handle, CURLINFO_PRIVATE, &stor);
    stor->client->transfer_done(message, stor);
    curl_easy_cleanup(easy_handle);
    q.pop();
  }
}

/*static*/int HttpClient::handle_socket_(CURL* easy,
                                         curl_socket_t s,
                                         int action,
                                         void* userp,
                                         void* socketp) {
  CurlContext* context = nullptr;
  int events = 0;
  HttpClient* client = reinterpret_cast<HttpClient*>(userp);
  switch (action) {
    case CURL_POLL_IN:
    case CURL_POLL_OUT:
    case CURL_POLL_INOUT:
      context = socketp ? reinterpret_cast<CurlContext*>(socketp)
                        : new CurlContext(client, s);

      curl_multi_assign(client->curl_handle_, s, context);
      if (action != CURL_POLL_IN)
        events |= UV_WRITABLE;
      if (action != CURL_POLL_OUT)
        events |= UV_READABLE;

      context->start(events, curl_perform_);
    break;
    case CURL_POLL_REMOVE:
      if (socketp) {
        context = reinterpret_cast<CurlContext*>(socketp);
        delete context;
        curl_multi_assign(client->curl_handle_, s, nullptr);
      }
    break;
    default:
        abort();
  }

  return 0;
}

/*static*/void HttpClient::on_timeout_(nsuv::ns_timer* timer) {
  int running_handles;
  HttpClient* client = timer->get_data<HttpClient>();
  curl_multi_socket_action(client->curl_handle_,
                           CURL_SOCKET_TIMEOUT,
                           0,
                           &running_handles);
  client->check_multi_info();
}

/*static*/int HttpClient::start_timeout_(CURLM* multi,
                                         long timeout,  // NOLINT(runtime/int)
                                         void* userp) {
  HttpClient* client = reinterpret_cast<HttpClient*>(userp);
  if (timeout < 0) {
    return client->timeout_->stop();
  } else {
    if (timeout == 0) {
      timeout = 1;  // 0 means directly call socket_action, but we will do it
                       // in a bit.
    }

    return client->timeout_->start(on_timeout_, timeout, 0);
  }
}

/*static*/void HttpClient::curl_perform_(nsuv::ns_poll* poll,
                                         int status,
                                         int events) {
  int running_handles;
  int flags = 0;
  CurlContext* context = poll->get_data<CurlContext>();
  if (events & UV_READABLE)
    flags |= CURL_CSELECT_IN;
  if (events & UV_WRITABLE)
    flags |= CURL_CSELECT_OUT;

  HttpClient* client = context->http_client_;
  curl_multi_socket_action(client->curl_handle_,
                           context->sockfd_,
                           flags,
                           &running_handles);
  client->check_multi_info();
}

/*static*/size_t HttpClient::write_cb_(void*, size_t, size_t nmemb, void*) {
  /* Don't write the response anywhere(by default libcurl prints to stdout) */
  return nmemb;
}

}  // namespace nsolid
}  // namespace node
