{
  'targets': [
    {
      'target_name': 'otlp-http-exporter',
      'type': 'static_library',
      'sources': [
        'exporters/otlp/src/otlp_environment.cc',
        'exporters/otlp/src/otlp_http_client.cc',
        'exporters/otlp/src/otlp_http_exporter.cc',
        'exporters/otlp/src/otlp_http_exporter_options.cc',
        'exporters/otlp/src/otlp_log_recordable.cc',
        'exporters/otlp/src/otlp_populate_attribute_utils.cc',
        'exporters/otlp/src/otlp_recordable_utils.cc',
        'exporters/otlp/src/otlp_recordable.cc',
        'ext/src/http/client/curl/http_client_curl.cc',
        'ext/src/http/client/curl/http_client_factory_curl.cc',
        'ext/src/http/client/curl/http_operation_curl.cc',
        'sdk/src/common/base64.cc',
        'sdk/src/common/env_variables.cc',
        'sdk/src/common/global_log_handler.cc',
        'sdk/src/logs/readable_log_record.cc',
        'sdk/src/resource/resource.cc',
        'sdk/src/resource/resource_detector.cc',
        'sdk/src/trace/exporter.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/common/v1/common.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/logs/v1/logs.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/resource/v1/resource.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/trace/v1/trace.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/trace/v1/trace_service.pb.cc'
      ],
      'include_dirs': [
        'api/include',
        'exporters/otlp/include',
        'ext/include',
        'sdk/include',
        'third_party/opentelemetry-proto/gen/cpp',
        '../../src'
      ],
      'defines': [
        'BUILDING_LIBCURL'
      ],
      'dependencies': [
        '../protobuf/protobuf.gyp:protobuf',
        '../curl/curl.gyp:curl'
      ],
      'direct_dependent_settings': {
        'include_dirs': [
          'api/include',
          'exporters/otlp/include',
          'ext/include',
          'sdk/include',
          'third_party/opentelemetry-proto/gen/cpp',
          '../protobuf/src'
        ]
      },
      'cflags_cc': [
        '-Wall',
        '-Wextra',
        '-Wno-unused-parameter',
        '-fPIC',
        '-fno-strict-aliasing',
        '-fexceptions',
        '-fvisibility=hidden',
        '-pedantic',
        '--std=c++17'
      ],
      'msvs_settings': {
      },
      'xcode_settings': {
        'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES',  # -fvisibility=hidden,
        'GCC_ENABLE_CPP_EXCEPTIONS': 'YES'    # -fexceptions
      },
    }
  ]
}
