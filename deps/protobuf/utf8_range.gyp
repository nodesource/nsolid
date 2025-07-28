{
  'targets': [
    {
      'target_name': 'utf8_range',
      'type': 'static_library',
      'dependencies': [
        './abseil.gyp:abseil_proto',
      ],
      'direct_dependent_settings': {
        'include_dirs': [
          'third_party/utf8_range',
        ],
      },
      'include_dirs': [
        'third_party/utf8_range',
      ],
      'sources': [
        'third_party/utf8_range/lookup.c',
        'third_party/utf8_range/naive.c',
        'third_party/utf8_range/utf8_range.c',
        'third_party/utf8_range/utf8_to_utf16/naive.c',
      ],
    },
  ]
}
