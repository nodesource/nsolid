#ifndef AGENTS_STATSD_SRC_UTILS_H_
#define AGENTS_STATSD_SRC_UTILS_H_
#include <uv.h>
#include <numeric>
#include <string>
#include <vector>

#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {
namespace statsd {

inline std::string vec_join(const std::vector<std::string>& v,
                            const std::string& delimiter = "") {
  if (v.empty()) {
    return std::string();
  }

  return std::accumulate(
    v.begin() + 1,
    v.end(),
    v[0],
    [delimiter](const std::string& a, const std::string& b) {
      return a + delimiter + b;
    });
}

inline std::string addr_to_string(const struct sockaddr* addr) {
  // 64 because any ip address:port fits in considering that max ipv6 length is
  // 45.
  char addr_str[64];
  uint16_t port;
  if (addr->sa_family == AF_INET) {
    auto* sin = reinterpret_cast<const struct sockaddr_in*>(addr);
    ASSERT_EQ(0, uv_ip4_name(sin, addr_str, sizeof(addr_str)));
    port = htons(sin->sin_port);
  } else {
    ASSERT_EQ(addr->sa_family, AF_INET6);
    auto* sin = reinterpret_cast<const struct sockaddr_in6*>(addr);
    ASSERT_EQ(0, uv_ip6_name(sin, addr_str, sizeof(addr_str)));
    port = htons(sin->sin6_port);
  }

  std::string str(addr_str);
  return str + ":" + std::to_string(port);
}

}  // namespace statsd
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_STATSD_SRC_UTILS_H_
