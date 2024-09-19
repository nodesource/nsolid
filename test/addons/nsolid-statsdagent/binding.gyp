{
  'targets': [{
    'target_name': 'binding',
    'sources': [ 'binding.cc' ],
    'includes': ['../common.gypi'],
    'defines': [ 'NODE_WANT_INTERNALS=1' ],
    'include_dirs': [
      '../../../src/',
      '../../../deps/nsuv/include/',
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
        'cflags_cc': [ '-std=c++20', '-g', '-O0', '-fstandalone-debug' ],
      },
      'Release': {
        'cflags_cc': [ '-std=c++20' ],
      },
    },
  }],
}
