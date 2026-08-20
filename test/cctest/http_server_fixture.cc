#include "http_server_fixture.h"
#include <algorithm>
#include "util.h"

HttpServer::HttpServer(uv_loop_t* loop): loop_(loop) {
  CHECK_EQ(0, server_.init(loop_));
  server_.set_data(this);
}

HttpServer::~HttpServer() {
}

void HttpServer::Close() {
  server_.close();
}

void HttpServer::Start(int* port, request_cb cb) {
  request_cb_ = cb;
  sockaddr_in bind_addr;
  CHECK_EQ(0, uv_ip4_addr("0.0.0.0", *port, &bind_addr));
  CHECK_EQ(0, server_.bind(reinterpret_cast<const sockaddr*>(&bind_addr), 0));
  CHECK_EQ(0, server_.listen(128, [](nsuv::ns_tcp* server, int status) {
    CHECK_GE(status, 0);
    nsuv::ns_tcp* client = new nsuv::ns_tcp;
    CHECK_EQ(0, client->init(server->loop));
    CHECK_EQ(0, server->accept(client));
    HttpServer* http_server = server->get_data<HttpServer>();
    client->set_data(http_server);
    http_server->HandleClient(client);
  }));

  int addr_size = sizeof(bind_addr);
  CHECK_EQ(0, server_.getsockname(reinterpret_cast<sockaddr*>(&bind_addr),
                                  &addr_size));
  *port = htons(bind_addr.sin_port);
}

void HttpServer::HandleClient(nsuv::ns_tcp* client) {
  CHECK_EQ(0, client->read_start([](nsuv::ns_tcp*, size_t, uv_buf_t* buf) {
    static char slab[1024];

    buf->base = slab;
    buf->len = sizeof(slab);
  }, [](nsuv::ns_tcp* client, ssize_t nread, const uv_buf_t* buf) {
    if (nread < 0) {
      CHECK_EQ(nread, UV_EOF);
      client->close_and_delete();
      return;
    }

    HttpServer* http_server = client->get_data<HttpServer>();
    http_server->HandleRequest(client, buf, nread);
  }));
}

void HttpServer::HandleRequest(nsuv::ns_tcp* client,
                               const uv_buf_t* buf,
                               ssize_t nread) {
  llhttp_t parser;
  llhttp_settings_t settings;

  llhttp_settings_init(&settings);

  settings.on_url = on_url;
  settings.on_header_field = on_header_field;
  settings.on_header_value = on_header_value;

  settings.on_message_complete = on_message_complete;
  settings.on_method_complete = on_method_complete;
  settings.on_header_field_complete = on_header_field_complete;
  settings.on_header_value_complete = on_header_value_complete;

  llhttp_init(&parser, HTTP_REQUEST, &settings);

  HttpRequest req;
  req.server = this;
  req.client = client;

  parser.data = &req;

  CHECK_EQ(0, llhttp_execute(&parser, buf->base, nread));
}

void HttpServer::SendResponse(nsuv::ns_tcp* client,
                              int response_code,
                              const std::string& content_type,
                              const std::string& response_body) {
  std::string response = "HTTP/1.1 " + std::to_string(response_code) + " OK\r\n"
    "Content-Length: " + std::to_string(response_body.length()) + "\r\n" +
    "Content-Type: " + content_type + "\r\n" +
    "\r\n" + response_body;

  nsuv::ns_write<nsuv::ns_tcp>* write_req = new nsuv::ns_write<nsuv::ns_tcp>();
  uv_buf_t buf = uv_buf_init(const_cast<char*>(response.c_str()),
                             response.length());
  auto write_cb = [](nsuv::ns_write<nsuv::ns_tcp>* req, int status) {
    delete req;
  };

  CHECK_EQ(0, client->write(write_req, &buf, 1, write_cb));
}

/*static*/int HttpServer::on_url(llhttp_t* parser, const char* at, size_t len) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  req->url.append(at, len);
  return 0;
}

/*static*/int HttpServer::on_header_field(llhttp_t* parser,
                                          const char* at,
                                          size_t len) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  req->aux0.append(at, len);
  return 0;
}

/*static*/int HttpServer::on_header_value(llhttp_t* parser,
                                          const char* at,
                                          size_t len) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  req->aux1.append(at, len);
  return 0;
}

/*static*/int HttpServer::on_message_complete(llhttp_t* parser) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  req->server->request_cb_(*req);
  return 0;
}

/*static*/int HttpServer::on_method_complete(llhttp_t* parser) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  req->method = parser->method;
  return 0;
}

/*static*/int HttpServer::on_header_field_complete(llhttp_t* parser) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  // store the header field in lowercase.
  std::transform(req->aux0.begin(),
                 req->aux0.end(),
                 req->aux0.begin(),
                 ::tolower);
  return 0;
}

/*static*/int HttpServer::on_header_value_complete(llhttp_t* parser) {
  HttpRequest* req = static_cast<HttpRequest*>(parser->data);
  req->headers[req->aux0] = req->aux1;
  req->aux0.clear();
  req->aux1.clear();
  return 0;
}
