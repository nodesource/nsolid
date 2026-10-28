{
  'targets': [
    {
      'target_name': 'sodium',
      'type': 'static_library',
      'sources': [
        'src/libsodium/crypto_aead/aegis128l/aead_aegis128l.c',
        'src/libsodium/crypto_aead/aegis128l/aegis128l_aesni.c',
        'src/libsodium/crypto_aead/aegis128l/aegis128l_soft.c',
        'src/libsodium/crypto_aead/aegis256/aead_aegis256.c',
        'src/libsodium/crypto_aead/aegis256/aegis256_aesni.c',
        'src/libsodium/crypto_aead/aegis256/aegis256_soft.c',
        'src/libsodium/crypto_box/crypto_box.c',
        'src/libsodium/crypto_box/crypto_box_easy.c',
        'src/libsodium/crypto_box/curve25519xsalsa20poly1305/box_curve25519xsalsa20poly1305.c',
        'src/libsodium/crypto_core/softaes/softaes.c',
        'src/libsodium/crypto_core/ed25519/ref10/ed25519_ref10.c',
        'src/libsodium/crypto_core/hsalsa20/ref2/core_hsalsa20_ref2.c',
        'src/libsodium/crypto_core/salsa/ref/core_salsa_ref.c',
        'src/libsodium/crypto_generichash/blake2b/ref/blake2b-compress-avx2.c',
        'src/libsodium/crypto_generichash/blake2b/ref/blake2b-compress-ref.c',
        'src/libsodium/crypto_generichash/blake2b/ref/blake2b-compress-sse41.c',
        'src/libsodium/crypto_generichash/blake2b/ref/blake2b-compress-ssse3.c',
        'src/libsodium/crypto_generichash/blake2b/ref/blake2b-ref.c',
        'src/libsodium/crypto_generichash/blake2b/ref/generichash_blake2b.c',
        'src/libsodium/crypto_hash/sha512/cp/hash_sha512_cp.c',
        'src/libsodium/crypto_onetimeauth/poly1305/onetimeauth_poly1305.c',
        'src/libsodium/crypto_onetimeauth/poly1305/donna/poly1305_donna.c',
        'src/libsodium/crypto_onetimeauth/poly1305/sse2/poly1305_sse2.c',
        'src/libsodium/crypto_pwhash/argon2/argon2-core.c',
        'src/libsodium/crypto_pwhash/argon2/argon2-fill-block-avx2.c',
        'src/libsodium/crypto_pwhash/argon2/argon2-fill-block-avx512f.c',
        'src/libsodium/crypto_pwhash/argon2/argon2-fill-block-ref.c',
        'src/libsodium/crypto_pwhash/argon2/argon2-fill-block-ssse3.c',
        'src/libsodium/crypto_pwhash/argon2/blake2b-long.c',
        'src/libsodium/crypto_scalarmult/crypto_scalarmult.c',
        'src/libsodium/crypto_scalarmult/curve25519/ref10/x25519_ref10.c',
        'src/libsodium/crypto_scalarmult/curve25519/sandy2x/curve25519_sandy2x.c',
        'src/libsodium/crypto_scalarmult/curve25519/sandy2x/fe.h',
        'src/libsodium/crypto_scalarmult/curve25519/sandy2x/fe51_invert.c',
        'src/libsodium/crypto_scalarmult/curve25519/sandy2x/fe_frombytes_sandy2x.c',
        'src/libsodium/crypto_scalarmult/curve25519/scalarmult_curve25519.c',
        'src/libsodium/crypto_secretbox/crypto_secretbox.c',
        'src/libsodium/crypto_secretbox/crypto_secretbox_easy.c',
        'src/libsodium/crypto_secretbox/xsalsa20poly1305/secretbox_xsalsa20poly1305.c',
        'src/libsodium/crypto_stream/chacha20/dolbeau/chacha20_dolbeau-avx2.c',
        'src/libsodium/crypto_stream/chacha20/dolbeau/chacha20_dolbeau-ssse3.c',
        'src/libsodium/crypto_stream/chacha20/stream_chacha20.c',
        'src/libsodium/crypto_stream/chacha20/ref/chacha20_ref.c',
        'src/libsodium/crypto_stream/salsa20/stream_salsa20.c',
        'src/libsodium/crypto_stream/salsa20/ref/salsa20_ref.c',
        'src/libsodium/crypto_stream/salsa20/xmm6/salsa20_xmm6.c',
        'src/libsodium/crypto_stream/salsa20/xmm6int/salsa20_xmm6int-avx2.c',
        'src/libsodium/crypto_stream/salsa20/xmm6int/salsa20_xmm6int-sse2.c',
        'src/libsodium/crypto_stream/xsalsa20/stream_xsalsa20.c',
        'src/libsodium/crypto_verify/verify.c',
        'src/libsodium/randombytes/randombytes.c',
        'src/libsodium/randombytes/sysrandom/randombytes_sysrandom.c',
        'src/libsodium/sodium/core.c',
        'src/libsodium/sodium/runtime.c',
        'src/libsodium/sodium/utils.c'
      ],
      'include_dirs': [
        'src/libsodium/include/sodium'
      ],
      'defines': [
        'SODIUM_STATIC=1',
        'HAVE_RAISE=1',
      ],
      'dependencies': [
      ],
      'direct_dependent_settings': {
        'defines': [
          'SODIUM_STATIC=1'
        ],
        'include_dirs': [
          'src/libsodium/include'
        ]
      },
      'cflags_cc': [
        '-Wall',
        '-Wextra',
        '-Wno-unused-parameter',
        '-fPIC',
        '-fno-strict-aliasing',
        "-fno-strict-overflow",
        '-fexceptions',
        '-fvisibility=hidden',
        "-fwrapv",
        "-flax-vector-conversions",
        '-pedantic',
        '--std=c++17'
      ],
      'msvs_settings': {
      },
      'xcode_settings': {
        'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES',  # -fvisibility=hidden,
        'GCC_ENABLE_CPP_EXCEPTIONS': 'YES'    # -fexceptions
      },
      'conditions': [
        [ 'node_byteorder=="l"', {
          'defines': [ 'NATIVE_LITTLE_ENDIAN=1' ]
        }, {
          'defines': [ 'NATIVE_BIG_ENDIAN=1' ]
        }],
        [ 'OS=="linux"', {
          'defines': [
            'ASM_HIDE_SYMBOL=.hidden',
            'TLS=_Thread_local',
            '_GNU_SOURCE=1',
            'CONFIGURED=1',
            'DEV_MODE=1',
            'HAVE_ATOMIC_OPS=1',
            'HAVE_C11_MEMORY_FENCES=1',
            'HAVE_CET_H=1',
            'HAVE_GCC_MEMORY_FENCES=1',
            'HAVE_INLINE_ASM=1',
            'HAVE_INTTYPES_H=1',
            'HAVE_STDINT_H=1',
            'HAVE_CATCHABLE_ABRT=1',
            'HAVE_CATCHABLE_SEGV=1',
            'HAVE_CLOCK_GETTIME=1',
            'HAVE_GETPID=1',
            'HAVE_INLINE_ASM=1',
            'HAVE_MADVISE=1',
            'HAVE_MLOCK=1',
            'HAVE_MMAP=1',
            'HAVE_MPROTECT=1',
            'HAVE_NANOSLEEP=1',
            'HAVE_POSIX_MEMALIGN=1',
            'HAVE_PTHREAD_PRIO_INHERIT=1',
            'HAVE_PTHREAD=1',
            'HAVE_SYSCONF=1',
            'HAVE_SYS_AUXV_H=1',
            'HAVE_SYS_MMAN_H=1',
            'HAVE_SYS_RANDOM_H=1',
            'HAVE_SYS_PARAM_H=1',
            'HAVE_WEAK_SYMBOLS=1',
          ],
          'sources': [
            'src/libsodium/crypto_scalarmult/curve25519/sandy2x/sandy2x.S',
            'src/libsodium/crypto_stream/salsa20/xmm6/salsa20_xmm6-asm.S',
          ],
        }, 'OS=="mac"', {
          'defines': [
            'ASM_HIDE_SYMBOL=.private_extern',
            'TLS=_Thread_local',
            '_GNU_SOURCE=1',
            'CONFIGURED=1',
            'DEV_MODE=1',
            'HAVE_ATOMIC_OPS=1',
            'HAVE_C11_MEMORY_FENCES=1',
            'HAVE_CET_H=1',
            'HAVE_GCC_MEMORY_FENCES=1',
            'HAVE_INLINE_ASM=1',
            'HAVE_INTTYPES_H=1',
            'HAVE_STDINT_H=1',
            'HAVE_ARC4RANDOM=1',
            'HAVE_ARC4RANDOM_BUF=1',
            'HAVE_CATCHABLE_ABRT=1',
            'HAVE_CATCHABLE_SEGV=1',
            'HAVE_CLOCK_GETTIME=1',
            'HAVE_GETENTROPY=1',
            'HAVE_GETPID=1',
            'HAVE_MADVISE=1',
            'HAVE_MEMSET_S=1',
            'HAVE_MLOCK=1',
            'HAVE_MMAP=1',
            'HAVE_MPROTECT=1',
            'HAVE_NANOSLEEP=1',
            'HAVE_POSIX_MEMALIGN=1',
            'HAVE_PTHREAD=1',
            'HAVE_PTHREAD_PRIO_INHERIT=1',
            'HAVE_SYSCONF=1',
            'HAVE_SYS_MMAN_H=1',
            'HAVE_SYS_RANDOM_H=1',
            'HAVE_SYS_PARAM_H=1',
            'HAVE_WEAK_SYMBOLS=1',
          ],
          'sources': [
            'src/libsodium/crypto_scalarmult/curve25519/sandy2x/sandy2x.S',
            'src/libsodium/crypto_stream/salsa20/xmm6/salsa20_xmm6-asm.S',
          ],
        },],
        [
          'target_arch=="x64"', {
            'conditions': [
              [ 'OS!="win"', {
                'cflags': [
                  '-msse3',
                  '-mssse3',
                  '-msse4.1',
                  '-mavx',
                  '-mavx2',
                ],
                'defines': [
                  'HAVE_AMD64_ASM=1',
                  'HAVE_AVX_ASM=1',
                  'HAVE_CPUID=1',
                  'HAVE_MMINTRIN_H=1',
                  'HAVE_EMMINTRIN_H=1',
                  'HAVE_WMMINTRIN_H=1',
                  'HAVE_RDRAND=1',
                  'HAVE_PMMINTRIN_H=1',
                  'HAVE_TMMINTRIN_H',
                  'HAVE_SMMINTRIN_H=1',
                  'HAVE_AVXINTRIN_H=1',
                  'HAVE_AVX2INTRIN_H=1',
                  'HAVE_TI_MODE=1'
                ],
                'xcode_settings': {
                  'OTHER_CFLAGS': [
                    '-msse3',
                    '-mssse3',
                    '-msse4.1',
                    '-mavx',
                    '-mavx2',
                  ]
                },
              }],
            ]
          }
        ]
      ]
    }
  ]
}
