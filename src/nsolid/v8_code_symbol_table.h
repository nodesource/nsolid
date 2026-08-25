#ifndef SRC_NSOLID_V8_CODE_SYMBOL_TABLE_H_
#define SRC_NSOLID_V8_CODE_SYMBOL_TABLE_H_

#include <cstddef>
#include <cstdint>

#include <map>
#include <unordered_map>
#include "nsolid.h"
#include "v8-profiler.h"

namespace node {
namespace nsolid {

// pre-declarations.
struct Frame;

// Tracks the lifetime of V8-generated code regions and their symbol metadata.
//
// V8 can reuse an address after code is replaced, while eBPF samples may arrive
// after the corresponding code event. Active entries are kept in
// live_by_start_, and replaced entries remain in closed_by_start_ until they
// are old enough to evict. Resolve() uses both the program counter and sample
// timestamp to select the entry that was valid when the sample was taken.
class V8CodeSymbolTable {
 public:
  struct CodeSymbol {
    uintptr_t code_start = 0;
    size_t code_len = 0;
    uint64_t valid_from_ts = 0;
    uint64_t valid_to_ts = UINT64_MAX;
    v8::CodeEventType event_type = v8::CodeEventType::kUnknownType;
    std::string symbol_name;
    std::string script_name;
    int script_line = 0;
    int script_column = 0;

    bool contains(uintptr_t pc) const {
      return code_start <= pc && pc < code_start + code_len;
    }

    bool contains(uintptr_t pc, uint64_t ts) const {
      return contains(pc) && valid_from_ts <= ts && ts < valid_to_ts;
    }
  };

  struct ResolutionCacheStats {
    uint64_t hits = 0;
    uint64_t misses = 0;
  };

  void Ingest(const CodeEventInfo& info);
  bool Resolve(uintptr_t pc, uint64_t sample_ts, Frame* frame) const;
  void EvictClosed(uint64_t min_valid_to_ts);
  ResolutionCacheStats ConsumeResolutionCacheStats() const {
    ResolutionCacheStats stats{resolution_cache_hits_,
                               resolution_cache_misses_};
    resolution_cache_hits_ = 0;
    resolution_cache_misses_ = 0;
    return stats;
  }

  size_t ResolutionCacheEntryCount() const { return resolution_cache_.size(); }
  size_t LiveEntryCount() const { return live_by_start_.size(); }
  size_t ClosedCodeSymbolCount() const {
    size_t count = 0;
    for (const auto& entry : closed_by_start_) {
      count += entry.second.size();
    }
    return count;
  }

 private:
  struct ResolutionCacheEntry {
    uint64_t valid_from_ts = 0;
    uint64_t valid_to_ts = UINT64_MAX;
    uint64_t symbol_offset = 0;
    v8::CodeEventType event_type = v8::CodeEventType::kUnknownType;
    std::string symbol_name;
    std::string script_name;
    int script_line = 0;
    int script_column = 0;

    bool contains(uint64_t ts) const {
      return valid_from_ts <= ts && ts < valid_to_ts;
    }
  };

  void ClearResolutionCache() const { resolution_cache_.clear(); }

  std::map<uintptr_t, CodeSymbol> live_by_start_;
  std::map<uintptr_t, std::vector<CodeSymbol>> closed_by_start_;
  // Keep a conservative bound even after longer versions are closed or evicted.
  // ponytail: dense overlaps still scan; use an interval index if measurable.
  size_t max_code_len_ = 0;
  uint64_t earliest_closed_valid_to_ts_ = UINT64_MAX;
  mutable std::unordered_map<uintptr_t, ResolutionCacheEntry> resolution_cache_;
  mutable uint64_t resolution_cache_hits_ = 0;
  mutable uint64_t resolution_cache_misses_ = 0;
};

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_V8_CODE_SYMBOL_TABLE_H_
