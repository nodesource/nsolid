#ifndef SRC_NODE_DOTENV_H_
#define SRC_NODE_DOTENV_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "util-inl.h"
#include "v8.h"

#include <map>

namespace node {

class Dotenv {
 public:
  enum ParseResult { Valid, FileError, InvalidContent };

  Dotenv() = default;
  Dotenv(const Dotenv& d) = default;
  Dotenv(Dotenv&& d) noexcept = default;
  Dotenv& operator=(Dotenv&& d) noexcept = default;
  Dotenv& operator=(const Dotenv& d) = default;
  ~Dotenv() = default;

  void ParseContent(const std::string_view content);
  ParseResult ParsePath(const std::string_view path);
  void AssignNodeOptionsIfAvailable(std::string* node_options);
  void SetEnvironment(Environment* env);
  v8::Local<v8::Object> ToObject(Environment* env);

  static std::vector<std::string> GetPathFromArgs(
      const std::vector<std::string>& args);

 private:
  std::map<std::string, std::string> store_;
  std::string_view trim_quotes(std::string_view str);
};

}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NODE_DOTENV_H_
