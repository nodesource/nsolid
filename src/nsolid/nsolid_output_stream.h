#ifndef SRC_NSOLID_NSOLID_OUTPUT_STREAM_H_
#define SRC_NSOLID_NSOLID_OUTPUT_STREAM_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <v8.h>
#include <v8-profiler.h>

namespace node {
namespace nsolid {

#define HEAP_SNAPSHOT_ERRORS(X)                                                \
  X(HEAP_SNAPSHOT_SUCESS, 0, "Heap Snapshot generated sucessfully\n")          \
  X(HEAP_SNAPSHOT_FAILURE, 1, "Error generating the Heap Snapshot\n")          \
  X(HEAP_SNAPSHOT_DISABLED, 3,                                                 \
    "Snapshot generation is disabled in this thread\n")                        \
  X(HEAP_SNAPSHOT_IN_PROGRESS, 4, "Heap Snapshot in progress\n")

namespace heap_profiler {

enum ErrorType {
#define X(type, code, str) type = code,
  HEAP_SNAPSHOT_ERRORS(X)
#undef X
      NSOLID_ZMQ_ERROR_MAX
};

}  // namespace heap_profiler

template <class Data, typename V8Object>
class DataOutputStream : public v8::OutputStream {
 public:
  typedef std::function<void(std::string, uint64_t*)> h_cb;

  DataOutputStream(h_cb cb,
                   const V8Object* object,
                   Data* data)
    : cb_(cb),
      v8_Object_(object),
      data_(data),
      sync_(false) {}

  DataOutputStream(std::string* profileStor,
                   const V8Object* object,
                   Data* data)
    : profile_str_(profileStor),
      v8_Object_(object),
      data_(data),
      sync_(true) {}

  virtual ~DataOutputStream() {}

  int GetChunkSize() {
    // output chunk size
    return 65536;
  }

  void EndOfStream() {
    // Nothing to do if sync serialize
    if (!sync_) {
      // notify the end of the stream with an empty string
      cb_(std::string(), data_);
    }
  }

  v8::OutputStream::WriteResult WriteAsciiChunk(char* data, int size) {
    if (sync_) {
      // symply append to the profile string ref
      profile_str_->append(data, size);
    } else {
      cb_(std::string(data, size), data_);
    }

    return kContinue;
  }

 private:
  h_cb cb_;
  std::string* profile_str_;
  const V8Object* v8_Object_;
  Data* data_;
  bool sync_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_OUTPUT_STREAM_H_
