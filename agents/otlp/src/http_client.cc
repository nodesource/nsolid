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

template <typename... Args>
void OTLPHttpClient::warn_once_(const char* format, Args... args) {
  if (notified_export_error_) {
    Debug(format, args...);
    return;
  }
  notified_export_error_ = true;
  fprintf(stderr, format, args...);
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
  if (handle == nullptr) {
    curl_slist_free_all(header_list);
    warn_once_("N|Solid warning: vendor metrics export failed (%s)\n",
               "unable to initialize request");
    return UV_ENOMEM;
  }

  auto stor = new HttpClientStor{this, header_list};
  struct curl_blob blob;
  blob.data = const_cast<char*>(cacert_.c_str());
  blob.len = cacert_.size();
  blob.flags = CURL_BLOB_NOCOPY;
  CURLcode result;
  if ((result = curl_easy_setopt(handle, CURLOPT_PRIVATE, stor)) != CURLE_OK ||
      (result = curl_easy_setopt(handle, CURLOPT_URL, url.c_str())) !=
          CURLE_OK ||
      (result = curl_easy_setopt(handle, CURLOPT_POST, 1L)) != CURLE_OK ||
      (result = curl_easy_setopt(handle, CURLOPT_HTTPHEADER, header_list)) !=
          CURLE_OK ||
      (result = curl_easy_setopt(
           handle, CURLOPT_COPYPOSTFIELDS, metrics.c_str())) != CURLE_OK ||
      (result = curl_easy_setopt(
           handle, CURLOPT_WRITEFUNCTION, HttpClient::write_cb_)) != CURLE_OK ||
      (result = curl_easy_setopt(handle, CURLOPT_CAINFO_BLOB, &blob)) !=
          CURLE_OK ||
      (result = curl_easy_setopt(handle, CURLOPT_CONNECTTIMEOUT_MS, 10000L)) !=
          CURLE_OK ||
      (result = curl_easy_setopt(handle, CURLOPT_TIMEOUT_MS, 30000L)) !=
          CURLE_OK) {
    warn_once_("N|Solid warning: vendor metrics export failed "
               "(unable to configure request: %s)\n",
               curl_easy_strerror(result));
    curl_easy_cleanup(handle);
    curl_slist_free_all(header_list);
    delete stor;
    return UV_EIO;
  }
  CURLMcode multi_result = curl_multi_add_handle(curl_handle_, handle);
  if (multi_result != CURLM_OK) {
    warn_once_("N|Solid warning: vendor metrics export failed "
               "(unable to queue request: %s)\n",
               curl_multi_strerror(multi_result));
    curl_easy_cleanup(handle);
    curl_slist_free_all(header_list);
    delete stor;
    return UV_EIO;
  }
  return 0;
}

/*virtual*/void OTLPHttpClient::transfer_done(CURLMsg* message,
                                              struct HttpClientStor* stor) {
  long response_code = 0;  // NOLINT(runtime/int)
  CURLcode result = message->data.result;
  if (result == CURLE_OK) {
    result = curl_easy_getinfo(
        message->easy_handle, CURLINFO_RESPONSE_CODE, &response_code);
  }
  if (result != CURLE_OK || response_code < 200 || response_code >= 300) {
    warn_once_("N|Solid warning: vendor metrics export failed "
               "(curl=%d, HTTP=%ld)\n",
               static_cast<int>(result),
               response_code);
  } else {
    notified_export_error_ = false;
  }
  Debug("Vendor metrics response: curl=%d, HTTP=%ld\n",
        static_cast<int>(result),
        response_code);
  auto header_list = reinterpret_cast<struct curl_slist*>(stor->data);
  curl_slist_free_all(header_list);
  delete stor;
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
