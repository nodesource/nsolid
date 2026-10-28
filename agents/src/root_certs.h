#ifndef AGENTS_SRC_ROOT_CERTS_H_
#define AGENTS_SRC_ROOT_CERTS_H_

#include <cstddef>

namespace node {
namespace nsolid {

// Accessor for the root certificates array
const char* const* GetRootCerts();
// Accessor for the number of root certificates
size_t GetRootCertsCount();

}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_SRC_ROOT_CERTS_H_
