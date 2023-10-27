  #include "zmq/src/http_client.h"
#include "util.h"
#include "nsuv-inl.h"

#include "gtest/gtest.h"

#include "http_server_fixture.h"

using node::nsolid::zmq::ZmqHttpClient;

const char* NSolidSaasTokenHeader = "nsolid-saas-token";

TEST(ZmqHttpClientTest, Basic) {
  auto auth_cb = [](CURLcode result,
                    int status,
                    const std::string& body,
                    ZmqHttpClient* http_client,
                    HttpServer* server) {
    CHECK_EQ(result, CURLE_OK);
    CHECK_EQ(status, 200);
    CHECK_EQ(body, std::string("Authentication succeeded!"));
    server->Close();

    delete http_client;
  };

  uv_loop_t loop;
  uv_loop_init(&loop);
  int port = 0;

  HttpServer server(&loop);
  server.Start(&port, [](const HttpRequest& req) {
    CHECK_EQ(req.method, HTTP_POST);
    CHECK_EQ(req.url, std::string("/auth"));
    CHECK_EQ(req.headers.count(NSolidSaasTokenHeader), 1);
    const std::string& header = req.headers.at(NSolidSaasTokenHeader);
    CHECK_EQ(header, std::string("This Is My Token"));
    req.server->SendResponse(req.client,
                             200,
                             "plain/text",
                             "Authentication succeeded!");
  });

  ZmqHttpClient* http_client = new ZmqHttpClient(&loop);

  std::string url = "http://localhost:" + std::to_string(port) + "/auth";
  http_client->auth(url,
                    "This Is My Token",
                    auth_cb,
                    http_client,
                    &server);

  uv_run(&loop, UV_RUN_DEFAULT);

  CHECK_EQ(uv_loop_close(&loop), 0);
}

TEST(ZmqHttpClientTest, NoServer) {
  auto auth_cb = [](CURLcode result,
                    int status,
                    const std::string& body,
                    ZmqHttpClient* http_client) {
    CHECK_NE(result, CURLE_OK);
    CHECK_EQ(status, -1);
    CHECK_EQ(body, std::string(""));
  };

  uv_loop_t loop;
  uv_loop_init(&loop);
  int port = 0;

  ZmqHttpClient* http_client = new ZmqHttpClient(&loop);

  std::string url = "http://localhost:" + std::to_string(port) + "/auth";
  http_client->auth(url,
                    "This Is My Token",
                    auth_cb,
                    http_client);

  uv_run(&loop, UV_RUN_DEFAULT);

  delete http_client;

  /* One last loop spin so the http_client timer is actually closed */
  uv_run(&loop, UV_RUN_ONCE);

  CHECK_EQ(uv_loop_close(&loop), 0);
}

TEST(ZmqHttpClientTest, AuthFailed) {
  auto auth_cb = [](CURLcode result,
                    int status,
                    const std::string& body,
                    ZmqHttpClient* http_client,
                    HttpServer* server) {
    CHECK_EQ(result, CURLE_OK);
    CHECK_EQ(status, 407);
    CHECK_EQ(body, "");
    server->Close();
    delete http_client;
  };

  uv_loop_t loop;
  uv_loop_init(&loop);
  int port = 0;

  HttpServer server(&loop);
  server.Start(&port, [](const HttpRequest& req) {
    CHECK_EQ(req.method, HTTP_POST);
    CHECK_EQ(req.url, std::string("/auth"));
    CHECK_EQ(req.headers.count(NSolidSaasTokenHeader), 1);
    const std::string& header = req.headers.at(NSolidSaasTokenHeader);
    CHECK_EQ(header, std::string("This Is My Token"));
    req.server->SendResponse(req.client, 407);
  });

  ZmqHttpClient* http_client = new ZmqHttpClient(&loop);

  std::string url = "http://localhost:" + std::to_string(port) + "/auth";
  http_client->auth(url,
                    "This Is My Token",
                    auth_cb,
                    http_client,
                    &server);

  uv_run(&loop, UV_RUN_DEFAULT);

  CHECK_EQ(uv_loop_close(&loop), 0);
}
