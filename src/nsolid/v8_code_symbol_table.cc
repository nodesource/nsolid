#include "v8_code_symbol_table.h"

#include <iterator>
#ifdef __linux__
#include "nsolid_ebpf_profiler.h"
#endif

namespace node {
namespace nsolid {

const char* GetCodeEventTypeName(v8::CodeEventType type) {
  switch (type) {
    case v8::CodeEventType::kBuiltinType: return "BUILTIN";
    case v8::CodeEventType::kCallbackType: return "CALLBACK";
    case v8::CodeEventType::kEvalType: return "EVAL";
    case v8::CodeEventType::kFunctionType: return "FUNCTION";
    case v8::CodeEventType::kHandlerType: return "HANDLER";
    case v8::CodeEventType::kBytecodeHandlerType: return "BYTECODE_HANDLER";
    case v8::CodeEventType::kLazyCompileType: return "LAZY_COMPILE";
    case v8::CodeEventType::kRegExpType: return "REGEXP";
    case v8::CodeEventType::kScriptType: return "SCRIPT";
    case v8::CodeEventType::kStubType: return "STUB";
    case v8::CodeEventType::kRelocationType: return "RELOCATION";
    default: return "UNKNOWN";
  }
}

std::string SelectCodeEventSymbolName(const CodeEventInfo& info) {
  if (!info.fn_name.empty()) return info.fn_name;
  if (!info.comment.empty()) return info.comment;
  return GetCodeEventTypeName(info.type);
}

void V8CodeSymbolTable::Ingest(const CodeEventInfo& info) {
  ClearResolutionCache();
  max_code_len_ = std::max(max_code_len_, info.code_len);

  auto close_live_symbol = [&](auto it) {
    if (it == live_by_start_.end())
      return it;

    CodeSymbol symbol = std::move(it->second);
    symbol.valid_to_ts = info.timestamp;
    earliest_closed_valid_to_ts_ =
        std::min(earliest_closed_valid_to_ts_, symbol.valid_to_ts);
    closed_by_start_[it->first].push_back(std::move(symbol));
    return live_by_start_.erase(it);
  };

  CodeSymbol symbol{
    info.code_start,
    info.code_len,
    info.timestamp,
    UINT64_MAX,
    info.type,
    SelectCodeEventSymbolName(info),
    info.script_name,
    info.script_line,
    info.script_column
  };

  if (info.prev_code_start != 0) {
    auto it = live_by_start_.find(info.prev_code_start);
    if (it != live_by_start_.end()) {
      // Relocation events do not carry the original symbol metadata.
      symbol = it->second;
      symbol.code_start = info.code_start;
      symbol.code_len = info.code_len;
      symbol.valid_from_ts = info.timestamp;
      symbol.valid_to_ts = UINT64_MAX;
    }
    close_live_symbol(it);
  }

  auto it = live_by_start_.lower_bound(info.code_start);
  if (info.code_len == 0) {
    if (it != live_by_start_.end() && it->first == info.code_start)
      close_live_symbol(it);
    return;
  }

  // Live ranges are nonempty and disjoint; only the predecessor can extend
  // into the new range from an earlier start.
  if (it != live_by_start_.begin()) {
    auto prev = std::prev(it);
    if (info.code_start - prev->first < prev->second.code_len)
      close_live_symbol(prev);
  }
  while (it != live_by_start_.end() &&
         it->first - info.code_start < info.code_len) {
    it = close_live_symbol(it);
  }
  live_by_start_.emplace_hint(it, info.code_start, std::move(symbol));
}

#ifdef __linux__
bool V8CodeSymbolTable::Resolve(uintptr_t pc,
                                uint64_t sample_ts,
                                Frame* frame) const {
  auto populate_frame = [frame](const ResolutionCacheEntry& cached) {
    frame->symbol_name = cached.symbol_name;
    frame->symbol_offset = cached.symbol_offset;
    frame->symbol_event_type = cached.event_type;
    frame->script_name = cached.script_name;
    frame->script_line = cached.script_line;
    frame->script_column = cached.script_column;
  };

  auto cache_it = resolution_cache_.find(pc);
  if (cache_it != resolution_cache_.end() &&
      cache_it->second.contains(sample_ts)) {
    ++resolution_cache_hits_;
    populate_frame(cache_it->second);
    return true;
  }

  ++resolution_cache_misses_;

  auto cache_version = [this, pc](const CodeSymbol& version) ->
  const ResolutionCacheEntry& {
    auto [it, _] = resolution_cache_.insert_or_assign(
      pc,
      ResolutionCacheEntry{
        version.valid_from_ts,
        version.valid_to_ts,
        pc - version.code_start,
        version.event_type,
        version.symbol_name,
        version.script_name,
        version.script_line,
        version.script_column
      });
    return it->second;
  };

  auto live_it = live_by_start_.upper_bound(pc);
  while (live_it != live_by_start_.begin()) {
    --live_it;
    if (pc - live_it->first >= max_code_len_)
      break;
    const CodeSymbol& version = live_it->second;
    if (!version.contains(pc, sample_ts)) {
      continue;
    }
    populate_frame(cache_version(version));
    return true;
  }

  auto history_it = closed_by_start_.upper_bound(pc);
  while (history_it != closed_by_start_.begin()) {
    --history_it;
    if (pc - history_it->first >= max_code_len_)
      break;
    for (auto symbol_it = history_it->second.rbegin();
         symbol_it != history_it->second.rend();
         ++symbol_it) {
      if (!symbol_it->contains(pc, sample_ts)) {
        continue;
      }
      populate_frame(cache_version(*symbol_it));
      return true;
    }
  }

  return false;
}

#endif  // __linux__

void V8CodeSymbolTable::EvictClosed(uint64_t min_valid_to_ts) {
  // Ingest clears the cache, so cached closed versions always have history.
  // Live cache entries never expire. Skip scans until history can be removed.
  if (min_valid_to_ts <= earliest_closed_valid_to_ts_)
    return;

  for (auto it = resolution_cache_.begin();
       it != resolution_cache_.end();) {
    if (it->second.valid_to_ts < min_valid_to_ts) {
      it = resolution_cache_.erase(it);
    } else {
      ++it;
    }
  }

  earliest_closed_valid_to_ts_ = UINT64_MAX;
  for (auto it = closed_by_start_.begin();
       it != closed_by_start_.end();) {
    auto& symbols = it->second;
    symbols.erase(std::remove_if(symbols.begin(),
                                 symbols.end(),
                                 [min_valid_to_ts](const CodeSymbol& symbol) {
      return symbol.valid_to_ts < min_valid_to_ts;
    }),
    symbols.end());

    if (symbols.empty()) {
      it = closed_by_start_.erase(it);
    } else {
      for (const auto& symbol : symbols) {
        earliest_closed_valid_to_ts_ =
            std::min(earliest_closed_valid_to_ts_, symbol.valid_to_ts);
      }
      ++it;
    }
  }
}

}  // namespace nsolid
}  // namespace node
