#ifndef AGENTS_GRPC_SRC_EBPF_PROFILE_BUCKET_H_
#define AGENTS_GRPC_SRC_EBPF_PROFILE_BUCKET_H_

#include <charconv>
#include <cstdint>
#include <limits>
#include <string_view>
#include <system_error>

namespace node {
namespace nsolid {
namespace grpc {

constexpr uint64_t kDefaultEBPFProfileBucketSizeMs = 10000;
constexpr uint64_t kNanosecondsPerMillisecond = 1000000;
constexpr uint64_t kDefaultEBPFProfileBucketSizeNs =
  kDefaultEBPFProfileBucketSizeMs * kNanosecondsPerMillisecond;

inline uint64_t ParseEBPFProfileBucketSizeNs(std::string_view value) {
  uint64_t milliseconds;
  const auto result = std::from_chars(
      value.data(), value.data() + value.size(), milliseconds);
  if (result.ec != std::errc{} || result.ptr != value.data() + value.size() ||
      milliseconds == 0 ||
      milliseconds > std::numeric_limits<uint64_t>::max() /
                         kNanosecondsPerMillisecond) {
    return kDefaultEBPFProfileBucketSizeNs;
  }

  return milliseconds * kNanosecondsPerMillisecond;
}

inline uint64_t EBPFProfileBucketStartNs(uint64_t timestamp_ns,
                                         uint64_t bucket_size_ns) {
  return timestamp_ns - (timestamp_ns % bucket_size_ns);
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_EBPF_PROFILE_BUCKET_H_
