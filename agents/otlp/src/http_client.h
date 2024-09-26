#ifndef AGENTS_OTLP_SRC_HTTP_CLIENT_H_
#define AGENTS_OTLP_SRC_HTTP_CLIENT_H_

#include "../../src/http_client.h"

namespace node {
namespace nsolid {
namespace otlp {

class OTLPHttpClient: public HttpClient {
 public:
  explicit OTLPHttpClient(uv_loop_t* loop);
  ~OTLPHttpClient() {}

  int post_datadog_metrics(const std::string& url,
                           const std::string& key,
                           const std::string& metrics);
  int post_dynatrace_metrics(const std::string& url,
                             const std::string& auth_header,
                             const std::string& metrics);
  int post_newrelic_metrics(const std::string& url,
                            const std::string& key,
                            const std::string& metrics);

  virtual void transfer_done(CURLMsg* message, struct HttpClientStor* stor);

 private:
  int post_metrics(const std::string& url,
                   const std::string& metrics,
                   struct curl_slist* header_list);
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_HTTP_CLIENT_H_
