#ifndef ASSERTS_H_
#define ASSERTS_H_

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Have our own assert, so we are sure it does not get optimized away in
 * a release build.
 */
#define ASSERT(expr)                                      \
  do {                                                    \
    if (!(expr)) {                                        \
      fprintf(stderr,                                     \
              "Assertion failed in %s on line %d: %s\n",  \
              __FILE__,                                   \
              __LINE__,                                   \
              #expr);                                     \
      abort();                                            \
    }                                                     \
  } while (0)

#define ASSERT_BASE(expr, a, operator, b, type, conv)        \
  do {                                                       \
    if (!(expr)) {                                           \
      fprintf(stderr,                                        \
            "Assertion failed in %s on line %d: `%s %s %s` " \
            "(%" conv " %s %" conv ")\n",                    \
            __FILE__,                                        \
            __LINE__,                                        \
            #a,                                              \
            #operator,                                       \
            #b,                                              \
            (type)a,                                         \
            #operator,                                       \
            (type)b);                                        \
      abort();                                               \
    }                                                        \
  } while (0)

#define ASSERT_BASE_LEN(expr, a, operator, b, conv, len)     \
  do {                                                       \
    if (!(expr)) {                                           \
      fprintf(stderr,                                        \
            "Assertion failed in %s on line %d: `%s %s %s` " \
            "(%.*"#conv" %s %.*"#conv")\n",                  \
            __FILE__,                                        \
            __LINE__,                                        \
            #a,                                              \
            #operator,                                       \
            #b,                                              \
            static_cast<int>(len),                           \
            a,                                               \
            #operator,                                       \
            static_cast<int>(len),                           \
            b);                                              \
      abort();                                                                 \
    }                                                                          \
  } while (0)

#define ASSERT_BASE_HEX(expr, a, operator, b, size)                            \
  do {                                                                         \
    if (!(expr)) {                                                             \
      int i;                                                                   \
      unsigned char* a_ = (unsigned char*)a;                                   \
      unsigned char* b_ = (unsigned char*)b;                                   \
      fprintf(stderr,                                                          \
              "Assertion failed in %s on line %d: `%s %s %s` (",               \
              __FILE__,                                                        \
              __LINE__,                                                        \
              #a,                                                              \
              #                                                                \
              operator,                                                        \
              #b);                                                             \
      for (i = 0; i < size; ++i) {                                             \
        if (i > 0)                                                             \
          fprintf(stderr, ":");                                                \
        fprintf(stderr, "%02X", a_[i]);                                        \
      }                                                                        \
      fprintf(stderr, " %s ", #operator);                                      \
      for (i = 0; i < size; ++i) {                                             \
        if (i > 0)                                                             \
          fprintf(stderr, ":");                                                \
        fprintf(stderr, "%02X", b_[i]);                                        \
      }                                                                        \
      fprintf(stderr, ")\n");                                                  \
      abort();                                                                 \
    }                                                                          \
  } while (0)

#define ASSERT_INT_BASE(a, operator, b, type, conv)                            \
  ASSERT_BASE(a operator b, a, operator, b, type, conv)

#define ASSERT_EQ(a, b) ASSERT_INT_BASE(a, ==, b, int64_t, PRId64)
#define ASSERT_GE(a, b) ASSERT_INT_BASE(a, >=, b, int64_t, PRId64)
#define ASSERT_GT(a, b) ASSERT_INT_BASE(a, >, b, int64_t, PRId64)
#define ASSERT_LE(a, b) ASSERT_INT_BASE(a, <=, b, int64_t, PRId64)
#define ASSERT_LT(a, b) ASSERT_INT_BASE(a, <, b, int64_t, PRId64)
#define ASSERT_NE(a, b) ASSERT_INT_BASE(a, !=, b, int64_t, PRId64)

#define ASSERT_UINT64_EQ(a, b) ASSERT_INT_BASE(a, ==, b, uint64_t, PRIu64)
#define ASSERT_UINT64_GE(a, b) ASSERT_INT_BASE(a, >=, b, uint64_t, PRIu64)
#define ASSERT_UINT64_GT(a, b) ASSERT_INT_BASE(a, >, b, uint64_t, PRIu64)
#define ASSERT_UINT64_LE(a, b) ASSERT_INT_BASE(a, <=, b, uint64_t, PRIu64)
#define ASSERT_UINT64_LT(a, b) ASSERT_INT_BASE(a, <, b, uint64_t, PRIu64)
#define ASSERT_UINT64_NE(a, b) ASSERT_INT_BASE(a, !=, b, uint64_t, PRIu64)

#define ASSERT_STR_EQ(a, b) ASSERT_BASE(strcmp(a, b) == 0, a, ==, b, char*, "s")

#define ASSERT_STR_NE(a, b) ASSERT_BASE(strcmp(a, b) != 0, a, !=, b, char*, "s")

#define ASSERT_MEM_EQ(a, b, size)                                              \
  ASSERT_BASE_LEN(memcmp(a, b, size) == 0, a, ==, b, s, size)

#define ASSERT_MEM_NE(a, b, size)                                              \
  ASSERT_BASE_LEN(memcmp(a, b, size) != 0, a, !=, b, s, size)

#define ASSERT_MEM_HEX_EQ(a, b, size)                                          \
  ASSERT_BASE_HEX(memcmp(a, b, size) == 0, a, ==, b, size)

#define ASSERT_MEM_HEX_NE(a, b, size)                                          \
  ASSERT_BASE_HEX(memcmp(a, b, size) != 0, a, !=, b, size)

#define ASSERT_NULL(a) ASSERT_BASE(a == nullptr, a, ==, nullptr, void*, "p")

#define ASSERT_NOT_NULL(a) ASSERT_BASE(a != nullptr, a, !=, nullptr, void*, "p")

#define ASSERT_PTR_EQ(a, b)                                                    \
  ASSERT_BASE((void*)a == (void*)b, a, ==, b, void*, "p")

#define ASSERT_PTR_NE(a, b)                                                    \
  ASSERT_BASE((void*)a != (void*)b, a, !=, b, void*, "p")

#endif  // ASSERTS_H_
