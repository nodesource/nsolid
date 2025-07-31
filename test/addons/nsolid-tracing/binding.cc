#include <nsolid.h>
#include <nlohmann/json.h>
#include "../../../deps/nsuv/include/nsuv-inl.h"

#include <algorithm>
#include <cassert>
#include <chrono>  // NOLINT [build/c++11]
#include <queue>

using nlohmann::json;
using node::nsolid::Tracer;

#define V(Name, Val, Str)                                                      \
  const uint32_t Name = Val;
  NSOLID_SPAN_TYPES(V)
#undef V

#define V(Name)                                                                \
  const uint32_t Name = Tracer::Name;
  NSOLID_SPAN_END_REASONS(V)
#undef V

const uint32_t kInternal = Tracer::kInternal;
const uint32_t kServer = Tracer::kServer;
const uint32_t kClient = Tracer::kClient;
const uint32_t kProducer = Tracer::kProducer;
const uint32_t kConsumer = Tracer::kConsumer;

double before_;
double after_;

uint64_t ns_since_epoch() {
  using std::chrono::duration_cast;
  using std::chrono::nanoseconds;
  using std::chrono::system_clock;
  system_clock::duration dur = system_clock::now().time_since_epoch();
  return duration_cast<nanoseconds>(dur).count();
}

class Trace {
 public:
  explicit Trace(std::string id): id_(id) {
  }

  void add_span(const json& span) {
    double start = span["start"];
    double end = span["end"];
    assert(start < end);
    assert(before_ < start);
    assert(after_ >= end);
    const std::string span_id = span["spanId"];
    spans_[span_id] = span;
    const std::string parent_id = span["parentId"];
    if (parent_id == "0000000000000000") {
      root_ = span_id;
    } else {
      auto it = edges_.find(parent_id);
      if (it == edges_.end()) {
        // If root_ is not set it might be because the span parent belongs to a
        // different process. Keep the span_id it in root_ in case it's not
        // already set to cover for this specific case.
        if (root_.empty()) {
          root_ = span_id;
        }

        edges_[parent_id] = { span_id };
      } else {
        edges_[parent_id].push_back(span_id);
      }
    }
  }

  json to_json() const {
    json j;
    if (root_.empty()) {
      return j;
    }

    j = spans_[root_];
    add_node(j);

    return j;
  }

 private:
  // NOLINTNEXTLINE(runtime/references)
  void add_node(json& span) const {
    auto it = edges_.find(span["spanId"]);
    if (it == edges_.end()) {
      return;
    }

    std::string ids = span["spanId"];
    const json& edge = *it;
    for (it = edge.begin(); it != edge.end(); ++it) {
      std::string id = *it;
      auto iter = spans_.find(id);
      if (iter != spans_.end()) {
        json child = *iter;
        add_node(child);
        iter = span.find("children");
        if (iter == span.end()) {
          span["children"] = json::array({ child });
        } else {
          span["children"].push_back(child);
        }
      }
    }
  }

  std::string id_;
  std::string root_;
  json spans_ = json::object();
  json edges_ = json::object();
};

Tracer* tracer_ = nullptr;
std::queue<std::string> spans_;
json expected_traces_ = {};


// NOLINTNEXTLINE(runtime/references)
static void sort_children_by_start(nlohmann::json& obj) {
  if (obj.contains("children") && obj["children"].is_array()) {
    std::sort(obj["children"].begin(), obj["children"].end(),
              [](const nlohmann::json& a, const nlohmann::json& b) {
      return a["start"] < b["start"];
    });
    for (auto& child : obj["children"]) {
      sort_children_by_start(child);
    }
  }
}


static void at_exit_cb() {
  delete tracer_;
  after_ = ns_since_epoch() / 1e6;
  std::map<std::string, Trace> trace_map;
  while (!spans_.empty()) {
    json s = json::parse(spans_.front(), nullptr, false);
    assert(!s.is_discarded());
    spans_.pop();
    std::string trace_id = s["traceId"];
    auto it = trace_map.find(trace_id);
    if (it == trace_map.end()) {
      auto pair = trace_map.emplace(trace_id, Trace{ trace_id });
      assert(pair.second);
      it = pair.first;
    }

    Trace& trace = it->second;
    trace.add_span(s);
  }

  json traces_array = {};
  for (auto& entry : trace_map) {
    traces_array.push_back(entry.second.to_json());
  }

  // Sort spans by start time
  for (auto& trace : traces_array) {
    sort_children_by_start(trace);
  }

  fprintf(stderr, "traces_array: %s\n", traces_array.dump(4).c_str());
  // fprintf(stderr, "expected_traces: %s\n", expected_traces_.dump(4).c_str());

  assert(traces_array.size() == expected_traces_.size());
  for (auto i = traces_array.begin(); i != traces_array.end(); ++i) {
    for (auto j = expected_traces_.begin();
         j != expected_traces_.end();
         ++j) {
      json patch = json::diff(*i, *j);
      // fprintf(stderr, "patch: %s\n", patch.dump(4).c_str());
      // patch should only contain "remove" elements
      if (std::all_of(patch.begin(), patch.end(), [](const json& el){
        return el["op"] == "remove";
      })) {
        expected_traces_.erase(j);
        break;
      }
    }
  }

  assert(expected_traces_.empty());
}


static std::string print_trace(const Tracer::SpanStor& stor) {
  nlohmann::json attributes = json::parse(stor.attrs, nullptr, false);
  for (const std::string& attr : stor.extra_attrs) {
    attributes.merge_patch(json::parse(attr, nullptr, false));
  }

  nlohmann::json events = json::array();
  for (const std::string& ev : stor.events) {
    events.push_back(json::parse(ev, nullptr, false));
  }
  nlohmann::json j {
    { "kind", stor.kind },
    { "type", stor.type },
    { "thread_id", stor.thread_id },
    { "start", stor.start },
    { "end", stor.end },
    { "end_reason", stor.end_reason },
    { "name", stor.name },
    { "attributes", attributes },
    { "spanId", stor.span_id },
    { "traceId", stor.trace_id },
    { "parentId", stor.parent_id },
    { "events", events },
    { "status", {
      { "code", stor.status_code }
    }}
  };

  if (!stor.status_msg.empty()) {
    j["status"]["message"] = stor.status_msg;
  }

  return j.dump(4);
}


static void got_trace(Tracer* tracer, const Tracer::SpanStor& stor) {
  fprintf(stderr, "got_trace: %s\n", print_trace(stor).c_str());
  spans_.push(print_trace(stor));
}

static void ExpectedTrace(const v8::FunctionCallbackInfo<v8::Value>& args) {
  assert(2 == args.Length());
  assert(args[0]->IsNumber());
  assert(args[1]->IsString());

  before_ = args[0].As<v8::Number>()->Value();
  v8::Local<v8::String> trace_s = args[1].As<v8::String>();
  v8::String::Utf8Value trace(args.GetIsolate(), trace_s);
  json t = json::parse(*trace, nullptr, false);
  assert(!t.is_discarded());
  expected_traces_.push_back(t);
}

static void SetupTracing(const v8::FunctionCallbackInfo<v8::Value>& args) {
  assert(0 == args.Length());
  v8::Isolate* isolate = args.GetIsolate();
  v8::Local<v8::Context> context = isolate->GetCurrentContext();
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    tracer_ = Tracer::CreateInstance(kSpanDns |
                                     kSpanHttpClient |
                                     kSpanHttpServer |
                                     kSpanCustom, got_trace);
    atexit(at_exit_cb);
  }
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "expectedTrace", ExpectedTrace);
  NODE_SET_METHOD(exports, "setupTracing", SetupTracing);
#define V(Name, Val, Str)                                                      \
  NODE_DEFINE_CONSTANT(exports, Name);
  NSOLID_SPAN_TYPES(V)
#undef V
#define V(Name)                                                                \
  NODE_DEFINE_CONSTANT(exports, Name);
  NSOLID_SPAN_END_REASONS(V)
#undef V
  NODE_DEFINE_CONSTANT(exports, kInternal);
  NODE_DEFINE_CONSTANT(exports, kServer);
  NODE_DEFINE_CONSTANT(exports, kClient);
  NODE_DEFINE_CONSTANT(exports, kProducer);
  NODE_DEFINE_CONSTANT(exports, kConsumer);
}
