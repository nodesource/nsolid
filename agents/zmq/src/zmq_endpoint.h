#ifndef AGENTS_ZMQ_SRC_ZMQ_ENDPOINT_H_
#define AGENTS_ZMQ_SRC_ZMQ_ENDPOINT_H_

#include <string>
#ifdef USE_LOCAL_NSOLID_DELETE_UNUSED_CONSTRUCTORS
#define NSOLID_DELETE_UNUSED_CONSTRUCTORS(name)                                \
  name(const name&) = delete;                                                  \
  name(name&&) = delete;                                                       \
  name& operator=(const name&) = delete;                                       \
  name& operator=(name&&) = delete;
#else
#include <nsolid/nsolid_util.h>
#endif

namespace node {
namespace nsolid {

bool is_digits(const std::string &str) {
  return std::all_of(str.begin(), str.end(), ::isdigit);
}

int str_to_int(const std::string &str) {
  if (!is_digits(str)) {
    return -1;
  }

  int ret;
  errno = 0;
  ret = strtol(str.c_str(), nullptr, 10);
  if (errno != 0) {
    ret = -errno;
  }

  return ret;
}

// It defines a valid ip zmq endpoint with the following format:
// <protocol>://<hostname>:<rt>
class ZmqEndpoint {
 public:
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(ZmqEndpoint)

  static ZmqEndpoint* create(const std::string& addr,
                             unsigned int default_port) {
    size_t pos_prot;
    size_t pos_port;
    size_t start_host;
    std::string hostname;
    std::string protocol;
    int port;

    if (addr.empty()) {
      return nullptr;
    }

    // if no protocol info, it defaults to tcp://
    pos_prot = addr.find("://");
    if (pos_prot == std::string::npos) {
      start_host = 0;
      protocol = "tcp";
    } else {
      start_host = pos_prot + 3;
      protocol = addr.substr(0, pos_prot);
    }

    pos_port = addr.find(':', start_host);
    if (pos_port == std::string::npos) {
      // if no proto info and all digits consider it as port (host: localhost)
      if (start_host == 0 && (port = str_to_int(addr)) > 0) {
        hostname = "localhost";
      } else {
        hostname = addr.substr(start_host);
        port = default_port;
      }
    } else {
      std::string port_str = addr.substr(pos_port + 1);
      if ((port = str_to_int(port_str)) > 0) {
        hostname = addr.substr(start_host, pos_port - start_host);
      } else {
        hostname = addr.substr(start_host);
        port = default_port;
      }
    }

    return new ZmqEndpoint(protocol, hostname, port);
  }

  const std::string& protocol() const { return protocol_; }

  const std::string& hostname() const { return hostname_; }

  void hostname(const std::string& hostname) { hostname_ = hostname; }

  unsigned int port() const { return port_; }

  const std::string to_string() const {
    return protocol_ + "://" + hostname_ + ":" + std::to_string(port_);
  }

 private:
  ZmqEndpoint(const std::string& protocol,
              const std::string& hostname,
              unsigned int port)
      : protocol_(protocol),
        hostname_(hostname),
        port_(port) {
  }

 private:
  std::string protocol_;
  std::string hostname_;
  unsigned int port_;
};
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_ZMQ_SRC_ZMQ_ENDPOINT_H_
