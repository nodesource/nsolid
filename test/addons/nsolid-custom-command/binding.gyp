{
  'targets': [
    {
      'target_name': 'binding',
      'sources': [ 'binding.cc' ],
      'includes': ['../common.gypi'],
      'defines': [ 'NODE_WANT_INTERNALS=1' ]
    }
  ]
}
