{
  'targets': [{
    'target_name': 'binding',
    'sources': [ 'binding.cc' ],
    'includes': ['../common.gypi'],
    'defines': [ 'NODE_WANT_INTERNALS=1' ],
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
