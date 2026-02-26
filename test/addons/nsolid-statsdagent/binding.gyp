{
  'targets': [{
    'target_name': 'binding',
    'sources': [ 'binding.cc' ],
    'includes': ['../common.gypi'],
    'defines': [ 'NODE_WANT_INTERNALS=1' ],
    'include_dirs': [
      '../../../src/',
      '../../../deps/nsuv/include/',
      '../../../deps/opentelemetry-cpp/api/include',
      '../../../deps/opentelemetry-cpp/sdk/include',
      '../../../deps/protobuf/src',
      '../../../deps/protobuf/third_party/abseil-cpp',
      '../../../deps/v8',
      '../../../deps/v8/include',
      '../../../agents/statsd/src/',
    ],
    'cflags_cc': [ '-std=c++20' ],
    'conditions': [
      ['OS=="mac"', {
        'xcode_settings': {
          'CLANG_CXX_LANGUAGE_STANDARD': 'c++20',
        }
      }],
    ],
    'configurations': {
      'Debug': {
        'defines': [ 'DEBUG', '_DEBUG' ],
        'cflags_cc': [ '-std=c++20', '-g', '-O0' ],
      },
      'Release': {
        'cflags_cc': [ '-std=c++20' ],
      },
    },
  }],
}
