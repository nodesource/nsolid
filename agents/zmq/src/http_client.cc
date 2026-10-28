#include "http_client.h"
#include "debug_utils-inl.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {
namespace zmq {

struct HandleStor {
  struct curl_slist* header_list;
  std::string body;
  auth_proxy_sig proxy;
  void* user_data;
};

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_ZMQ_AGENT,
                     std::forward<Args>(args)...);
}

ZmqHttpClient::ZmqHttpClient(uv_loop_t* loop): HttpClient(loop) {
}

/*virtual*/void ZmqHttpClient::transfer_done(CURLMsg* message,
                                             struct HttpClientStor* stor) {
  long response_code = -1;  // NOLINT(runtime/int)
  CURL* handle = message->easy_handle;
  HandleStor* handle_stor = reinterpret_cast<HandleStor*>(stor->data);

  CURLcode result = message->data.result;
  if (result == CURLE_OK) {
    ASSERT_EQ(0, curl_easy_getinfo(handle,
                                   CURLINFO_RESPONSE_CODE,
                                   &response_code));
    Debug("Got Response: %d\n%s\n", response_code, handle_stor->body.c_str());
  }

  handle_stor->proxy(result,
                     response_code,
                     handle_stor->body,
                     handle_stor->user_data);

  curl_slist_free_all(handle_stor->header_list);
  delete handle_stor;
  delete stor;
}

/*static*/size_t ZmqHttpClient::write_cb_(char* data,
                                          size_t size,
                                          size_t nmemb,
                                          void* user_data) {
  HandleStor* stor = reinterpret_cast<HandleStor*>(user_data);
  stor->body.append(data, nmemb);
  return nmemb;
}

void ZmqHttpClient::do_auth(const std::string& url,
                            const std::string& saas_token,
                            auth_proxy_sig proxy,
                            void* data) {
  Debug("Auth to '%s'. Token: '%s'\n", url.c_str(), saas_token.c_str());
  CURL* handle = curl_easy_init();
  ASSERT_NOT_NULL(handle);

  static std::string auth = "NSOLID-SAAS-TOKEN: ";
  struct curl_slist* header_list = nullptr;
  header_list = curl_slist_append(header_list,
                                  std::string(auth + saas_token).c_str());
  header_list = curl_slist_append(header_list, "Content-Type: ");

  auto handle_stor = new HandleStor{ header_list, "", proxy, data };
  auto stor = new HttpClientStor{ this, handle_stor };

  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_PRIVATE, stor));
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_URL, url.c_str()));
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_POST, 1L));
  // Set an empty POST request body
  curl_easy_setopt(handle, CURLOPT_POSTFIELDS, "");
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_HTTPHEADER, header_list));
  ASSERT_EQ(0, curl_easy_setopt(handle,
                                CURLOPT_WRITEFUNCTION,
                                write_cb_));
  ASSERT_EQ(0, curl_easy_setopt(handle,
                                CURLOPT_WRITEDATA,
                                handle_stor));
  struct curl_blob blob;
  blob.data = const_cast<char*>(cacert_.c_str());
  blob.len = cacert_.size();
  blob.flags = CURL_BLOB_NOCOPY;
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_CAINFO_BLOB, &blob));
  ASSERT_EQ(0, curl_multi_add_handle(curl_handle_, handle));
}


}  // namespace zmq
}  // namespace nsolid
}  // namespace node
