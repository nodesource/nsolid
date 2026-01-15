{
  'targets': [{
    'target_name': 'binding',
    'sources': [ 'binding.cc' ],
    'includes': ['../common.gypi'],
    'defines': [ 'NODE_WANT_INTERNALS=1' ],
    'include_dirs': [
      '../../../src/',
      '../../../deps/nsuv/include/',
      '../../../deps/protobuf/src',
      '../../../deps/protobuf/third_party/abseil-cpp',
        '../../../deps/protobuf/third_party/utf8_range',
      '../../../agents/statsd/src/',
    ],
    'target_defaults': {
      'default_configuration': 'Release',
      'configurations': {
        'Debug': {
          'defines': [ 'DEBUG', '_DEBUG' ],
          'cflags': [ '-g', '-O0', '-fstandalone-debug' ],
        }
      },
    },
  }],
}
