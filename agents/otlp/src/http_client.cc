#include "http_client.h"
#include "debug_utils-inl.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {
namespace otlp {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_OTLP_AGENT,
                     std::forward<Args>(args)...);
}

OTLPHttpClient::OTLPHttpClient(uv_loop_t* loop): HttpClient(loop) {
}

int OTLPHttpClient::post_datadog_metrics(const std::string& url,
                                         const std::string& key,
                                         const std::string& metrics) {
  static std::string auth = "DD-API-KEY: ";
  struct curl_slist* header_list = nullptr;
  header_list = curl_slist_append(header_list, std::string(auth + key).c_str());
  header_list = curl_slist_append(header_list, "Content-Type: text/json");
  return post_metrics(url, metrics, header_list);
}

int OTLPHttpClient::post_dynatrace_metrics(const std::string& url,
                                           const std::string& auth_header,
                                           const std::string& metrics) {
  static std::string auth = "Authorization: ";
  struct curl_slist* header_list = nullptr;
  header_list = curl_slist_append(header_list,
                                  std::string(auth + auth_header).c_str());
  header_list = curl_slist_append(header_list, "Content-Type: text/plain");
  return post_metrics(url, metrics, header_list);
}

int OTLPHttpClient::post_newrelic_metrics(const std::string& url,
                                          const std::string& key,
                                          const std::string& metrics) {
  static std::string auth = "api-key: ";
  struct curl_slist* header_list = nullptr;
  header_list = curl_slist_append(header_list, std::string(auth + key).c_str());
  header_list = curl_slist_append(header_list,
                                  "Content-Type: application/json");
  return post_metrics(url, metrics, header_list);
}

int OTLPHttpClient::post_metrics(const std::string& url,
                                 const std::string& metrics,
                                 struct curl_slist* header_list) {
  Debug("Posting Metrics to '%s'\n", url.c_str());
  CURL* handle = curl_easy_init();
  ASSERT_NOT_NULL(handle);

  auto stor = new HttpClientStor{ this, header_list };

  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_PRIVATE, stor));
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_URL, url.c_str()));
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_POST, 1L));
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_HTTPHEADER, header_list));
  ASSERT_EQ(0, curl_easy_setopt(handle,
                                CURLOPT_COPYPOSTFIELDS,
                                metrics.c_str()));
  ASSERT_EQ(0, curl_easy_setopt(handle,
                                CURLOPT_WRITEFUNCTION,
                                HttpClient::write_cb_));
  struct curl_blob blob;
  blob.data = const_cast<char*>(cacert_.c_str());
  blob.len = cacert_.size();
  blob.flags = CURL_BLOB_NOCOPY;
  ASSERT_EQ(0, curl_easy_setopt(handle, CURLOPT_CAINFO_BLOB, &blob));
  ASSERT_EQ(0, curl_multi_add_handle(curl_handle_, handle));
  return 0;
}

/*virtual*/void OTLPHttpClient::transfer_done(CURLMsg* message,
                                              struct HttpClientStor* stor) {
  auto header_list = reinterpret_cast<struct curl_slist*>(stor->data);
  curl_slist_free_all(header_list);
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
