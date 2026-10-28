{
  'targets': [
    {
      'target_name': 'zmq',
      'type': 'static_library',
      'includes': [ 'zmq.gypi' ],
      'include_dirs': [
        'include'
      ],
      'sources': [ '<@(zmqsources)' ],
      'defines': [
        '_REENTRANT',
        '_THREAD_SAFE',
        'ZMQ_CUSTOM_PLATFORM_HPP',
        'ZMQ_GYP_BUILD',
        'ZMQ_CACHELINE_SIZE=64',
        'HAVE_STRNLEN',
        'ZMQ_USE_CV_IMPL_NONE',
        'ZMQ_STATIC'
      ],
      'direct_dependent_settings': {
        'defines': [
          'ZMQ_STATIC'
        ],
        'include_dirs': [
           'include'
        ]
      },
      'dependencies': [
        '../sodium/sodium.gyp:sodium'
      ],
      'conditions': [
        [ 'OS=="win"', {
          'sources': [
            'external/wepoll/wepoll.c'
          ],
          'defines': [
            'ZMQ_HAVE_WINDOWS',
            'FD_SETSIZE=16384',
            '_CRT_SECURE_NO_WARNINGS',
            '_WINSOCK_DEPRECATED_NO_WARNINGS'
          ],
          'libraries': [
            'ws2_32',
            'advapi32',
            'iphlpapi'
          ],
          'msvs_settings': {
            'VCCLCompilerTool': {
              'ExceptionHandling': '1',
              'AdditionalOptions': ['/EHsc']
            }
          }
        }],
        [ 'OS=="mac"', {
          'defines': [
            'ZMQ_HAVE_OSX'
          ],
          'xcode_settings': {
            'GCC_ENABLE_CPP_RTTI': 'YES',
            'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES',  # -fvisibility=hidden,
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES'    # -fexceptions
          }
        }],
        [ 'OS=="linux"', {
          'defines': [
            'ZMQ_HAVE_LINUX'
          ],
          'cflags_cc': [
            '-fvisibility=hidden',
            '-fexceptions'
          ],
          'cflags_cc!': [
            '-fno-exceptions',
            '-fno-rtti'
          ],
          'libraries': [
            '-lpthread'
          ]
        }]
      ]
    }
  ]
}
