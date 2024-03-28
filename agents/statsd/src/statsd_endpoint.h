#ifndef AGENTS_STATSD_SRC_STATSD_ENDPOINT_H_
#define AGENTS_STATSD_SRC_STATSD_ENDPOINT_H_

#include <memory>
#include <string>
#include <algorithm>
#include <tuple>
#include <vector>
#include "uv.h"
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
namespace statsd {

// predeclarations
class StatsDAgent;

inline bool is_digits(const std::string &str) {
  return std::all_of(str.begin(), str.end(), ::isdigit);
}

inline int str_to_int(const std::string &str) {
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

// It defines a valid ip statsd endpoint with the following format:
// [<protocol>://][<hostname>:][<port>]
class StatsDEndpoint {
 public:
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(StatsDEndpoint)

  static StatsDEndpoint* create(const std::string& addr);

  const std::string& protocol() const { return protocol_; }

  const std::string& hostname() const { return hostname_; }

  void hostname(const std::string& hostname) { hostname_ = hostname; }

  unsigned int port() const { return port_; }

  const std::vector<struct sockaddr_storage>& addresses() const {
    return addresses_;
  }

  const std::string to_string() const {
    return protocol_ + "://" + hostname_ + ":" + std::to_string(port_);
  }

 private:
  StatsDEndpoint(const std::string&,
                 const std::string&,
                 unsigned int port,
                 const std::vector<struct sockaddr_storage>& addresses);

 private:
  std::string protocol_;
  std::string hostname_;
  unsigned int port_;
  std::vector<struct sockaddr_storage> addresses_;
};
}  // namespace statsd
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_STATSD_SRC_STATSD_ENDPOINT_H_
