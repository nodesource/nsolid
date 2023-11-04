#ifndef AGENTS_STATSD_SRC_STATSD_ENDPOINT_H_
#define AGENTS_STATSD_SRC_STATSD_ENDPOINT_H_

#include <algorithm>
#include <memory>
#include <string>
#include <vector>

#include "nsolid/nsolid_util.h"
#include "uv.h"

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

  static StatsDEndpoint* create(uv_loop_t* loop, const std::string& addr);

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
