#include <utility>

#include "statsd_endpoint.h"
#include "utils.h"
#include "nsuv-inl.h"

#define STATSD_DEFAULT_HOSTNAME "0.0.0.0"
#define STATSD_DEFAULT_PORT     8125

namespace node {
namespace nsolid {
namespace statsd {

using sockaddr_storage_v = std::vector<struct sockaddr_storage>;

StatsDEndpoint* StatsDEndpoint::create(const std::string& addr) {
  size_t pos_prot;
  size_t pos_port;
  size_t start_host;
  std::string hostname;
  std::string protocol;
  int port;

  if (addr.empty()) {
    return nullptr;
  }

  // if no protocol info, it defaults to udp://
  pos_prot = addr.find("://");
  if (pos_prot == std::string::npos) {
    start_host = 0;
    protocol = "udp";
  } else {
    start_host = pos_prot + 3;
    protocol = addr.substr(0, pos_prot);
  }

  pos_port = addr.find(':', start_host);
  if (pos_port == std::string::npos) {
    // if no proto info and all digits consider it as port
    if (start_host == 0 && (port = str_to_int(addr)) > 0) {
      hostname = STATSD_DEFAULT_HOSTNAME;
    } else {
      hostname = addr.substr(start_host);
      port = STATSD_DEFAULT_PORT;
    }
  } else {
    std::string port_str = addr.substr(pos_port + 1);
    if ((port = str_to_int(port_str)) > 0) {
      hostname = addr.substr(start_host, pos_port - start_host);
    } else {
      hostname = addr.substr(start_host);
      port = STATSD_DEFAULT_PORT;
    }
  }

  // Only "tcp" and "udp" are supported.
  if (protocol != "udp" && protocol != "tcp") {
    return nullptr;
  }

  sockaddr_storage_v addresses;
  struct sockaddr_storage ss;
  if (0 == uv_ip4_addr(hostname.c_str(),
                       port,
                       reinterpret_cast<struct sockaddr_in*>(&ss))) {
    addresses.push_back(ss);
  } else if (0 == uv_ip6_addr(hostname.c_str(),
                              port,
                              reinterpret_cast<struct sockaddr_in6*>(&ss))) {
    addresses.push_back(ss);
  } else {
    uv_loop_t loop;
    nsuv::ns_addrinfo a_info;
    struct addrinfo hints;
    memset(&hints, 0, sizeof(hints));
    hints.ai_socktype = SOCK_STREAM;

    // uv_getaddrinfo() should really allow to be called without a uv_loop_t,
    // but since it doesn't use this method of calling. The call will be
    // fine since it doesn't require uv_run() when called sync. Calling
    // uv_loop_init() does have a bit of overhead, but not going to worry
    // about that since this is hardly ever called. If necessary then we can
    // use an alternative method of doing this.
    uv_loop_init(&loop);
    int ret = a_info.get(&loop,
                         nullptr,
                         hostname.c_str(),
                         std::to_string(port).c_str(),
                         &hints);
    uv_loop_close(&loop);
    if (ret != 0) {
      // The hostname wasn't a valid IP, a valid hostname or couldn't be
      // resolved.
      return nullptr;
    }

    for (const auto* tmp = a_info.info(); tmp != nullptr; tmp = tmp->ai_next) {
      sockaddr_storage ss;
      memcpy(&ss, tmp->ai_addr, tmp->ai_addrlen);
      addresses.push_back(ss);
    }
  }

  return new (std::nothrow) StatsDEndpoint(protocol, hostname, port, addresses);
}

StatsDEndpoint::StatsDEndpoint(const std::string& protocol,
                               const std::string& hostname,
                               unsigned int port,
                               const sockaddr_storage_v& addresses)
  : protocol_(protocol),
    hostname_(hostname),
    port_(port),
    addresses_(addresses),
    type_(protocol == "udp" ? Type::Udp : Type::Tcp) {
}

}  // namespace statsd
}  // namespace nsolid
}  // namespace node
