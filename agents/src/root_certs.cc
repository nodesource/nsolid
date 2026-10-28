#include "root_certs.h"

namespace node {
namespace nsolid {

static const char* const root_certs[] = {
#include "node_root_certs.h"
};

const char* const* GetRootCerts() {
  return root_certs;
}

size_t GetRootCertsCount() {
  return sizeof(root_certs) / sizeof(root_certs[0]);
}

}  // namespace nsolid
}  // namespace node
