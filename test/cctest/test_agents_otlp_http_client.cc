#include "gtest/gtest.h"
#include "http_server_fixture.h"
#include "otlp/src/http_client.h"

using node::nsolid::HttpClientStor;
using node::nsolid::otlp::OTLPHttpClient;

class MetricsHttpClient : public OTLPHttpClient {
 public:
  explicit MetricsHttpClient(uv_loop_t* loop) : OTLPHttpClient(loop) {}
  void transfer_done(CURLMsg* message, HttpClientStor* stor) override {
    completed = true;
    result = message->data.result;
    OTLPHttpClient::transfer_done(message, stor);
    uv_stop(loop_);
  }
  bool completed = false;
  CURLcode result = CURLE_OK;
};

static int response_status;

TEST(OTLPHttpClientTest, ReportsResponseFailures) {
  uv_loop_t loop;
  ASSERT_EQ(uv_loop_init(&loop), 0);
  int port = 0;
  HttpServer server(&loop);
  server.Start(&port, [](const HttpRequest& req) {
    req.server->SendResponse(req.client, response_status);
  });
  {
    MetricsHttpClient client(&loop);
    for (int status : {200, 401, 503, 200, 401}) {
      response_status = status;
      client.completed = false;
      testing::internal::CaptureStderr();
      EXPECT_EQ(client.post_newrelic_metrics(
                    "http://127.0.0.1:" + std::to_string(port), "key", "{}"),
                0);
      uv_run(&loop, UV_RUN_DEFAULT);
      EXPECT_TRUE(client.completed);
      const std::string log = testing::internal::GetCapturedStderr();
      if (status == 401) {
        EXPECT_NE(log.find("HTTP=401"), std::string::npos);
      } else {
        EXPECT_EQ(log.find("export failed"), std::string::npos);
      }
    }
  }
  server.Close();
  uv_run(&loop, UV_RUN_DEFAULT);
  EXPECT_EQ(uv_loop_close(&loop), 0);
}

TEST(OTLPHttpClientTest, WarnsOnceOnTransportFailure) {
  uv_loop_t loop;
  ASSERT_EQ(uv_loop_init(&loop), 0);
  {
    OTLPHttpClient client(&loop);
    CURLMsg message{};
    message.data.result = CURLE_COULDNT_CONNECT;
    for (int i = 0; i < 2; i++) {
      testing::internal::CaptureStderr();
      client.transfer_done(&message, new HttpClientStor{&client, nullptr});
      const std::string log = testing::internal::GetCapturedStderr();
      if (i == 0) {
        EXPECT_NE(log.find("export failed"), std::string::npos);
      } else {
        EXPECT_EQ(log.find("export failed"), std::string::npos);
      }
    }
  }
  uv_run(&loop, UV_RUN_DEFAULT);
  EXPECT_EQ(uv_loop_close(&loop), 0);
}

static nsuv::ns_tcp* stalled_client;

TEST(OTLPHttpClientTest, TimesOutStalledResponse) {
  uv_loop_t loop;
  ASSERT_EQ(uv_loop_init(&loop), 0);
  int port = 0;
  stalled_client = nullptr;
  HttpServer server(&loop);
  server.Start(&port, [](const HttpRequest& req) {
    stalled_client = req.client;
    EXPECT_EQ(stalled_client->read_stop(), 0);
  });
  uv_timer_t deadline;
  ASSERT_EQ(uv_timer_init(&loop, &deadline), 0);
  ASSERT_EQ(
      uv_timer_start(
          &deadline, [](uv_timer_t* timer) { uv_stop(timer->loop); }, 45000, 0),
      0);
  testing::internal::CaptureStderr();
  {
    MetricsHttpClient client(&loop);
    EXPECT_EQ(client.post_newrelic_metrics(
                  "http://127.0.0.1:" + std::to_string(port), "key", "{}"),
              0);
    uv_run(&loop, UV_RUN_DEFAULT);
    EXPECT_NE(stalled_client, nullptr);
    EXPECT_TRUE(client.completed);
    EXPECT_EQ(client.result, CURLE_OPERATION_TIMEDOUT);
    if (stalled_client != nullptr) {
      stalled_client->close_and_delete();
    }
  }
  const std::string log = testing::internal::GetCapturedStderr();
  EXPECT_NE(log.find("export failed"), std::string::npos);
  EXPECT_NE(log.find("curl=" + std::to_string(CURLE_OPERATION_TIMEDOUT)),
            std::string::npos);
  EXPECT_NE(log.find("HTTP=0"), std::string::npos);
  uv_close(reinterpret_cast<uv_handle_t*>(&deadline), nullptr);
  server.Close();
  uv_run(&loop, UV_RUN_DEFAULT);
  EXPECT_EQ(uv_loop_close(&loop), 0);
}
