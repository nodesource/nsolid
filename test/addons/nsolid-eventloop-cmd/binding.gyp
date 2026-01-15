{
  'targets': [
    {
      'target_name': 'binding',
      'sources': [ 'binding.cc' ],
      'includes': ['../common.gypi'],
      'defines': [ 'NODE_WANT_INTERNALS=1' ],
      'include_dirs': [
        '../../../deps/nsuv/include',
        '../../../deps/protobuf/src',
        '../../../deps/protobuf/third_party/abseil-cpp',
        '../../../deps/protobuf/third_party/utf8_range',
        '../../../src/',
      ],
    }
  ]
}
