{
  'variables': {
    'libbpf_sources': [
      'src/bpf.c',
      'src/btf.c',
      'src/libbpf.c',
      'src/libbpf_errno.c',
      'src/netlink.c',
      'src/nlattr.c',
      'src/str_error.c',
      'src/btf_dump.c',
      'src/hashmap.c',
      'src/linker.c',
      'src/relo_core.c',
      'src/ringbuf.c',
      'src/strset.c',
      'src/gen_loader.c',
      'src/bpf_prog_linfo.c',
      'src/libbpf_probes.c',
      'src/usdt.c',
      'src/zip.c',
      'src/btf_iter.c',
      'src/btf_relocate.c',
      'src/elf.c',
      'src/features.c',
    ],
  },
  'targets': [
    {
      'target_name': 'libbpf',
      'type': 'static_library',
      'include_dirs': [
        'src',
        'include',
        'include/uapi',
      ],
      'direct_dependent_settings': {
        'include_dirs': [
          'src',
          'include',
          'include/uapi',
        ],
      },
      'defines': [
        '_LARGEFILE64_SOURCE',
        '_FILE_OFFSET_BITS=64',
      ],
      'conditions': [
        ['OS=="linux"', {
          'sources': [
            '<@(libbpf_sources)',
          ],
          'cflags': [
            '-fPIC',
            '-Wno-sign-compare',
            '-Wno-unused-parameter',
          ],
          'link_settings': {
            'libraries': [
              '-lelf',
              '-lz',
            ],
          },
        }],
      ],
    },
  ],
  'copies': [
    {
      'destination': './include/bpf',
      'files': [
        './src/bpf.h',
        './src/libbpf.h',
      ],
    },
  ],
}