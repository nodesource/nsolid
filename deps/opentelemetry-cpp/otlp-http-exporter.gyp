{
  'targets': [
    {
      'target_name': 'otlp-http-exporter',
      'type': 'static_library',
      'sources': [
        'exporters/otlp/src/otlp_environment.cc',
        'exporters/otlp/src/otlp_grpc_client.cc',
        'exporters/otlp/src/otlp_grpc_exporter_options.cc',
        'exporters/otlp/src/otlp_grpc_exporter.cc',
        'exporters/otlp/src/otlp_grpc_log_record_exporter.cc',
        'exporters/otlp/src/otlp_grpc_log_record_exporter_options.cc',
        'exporters/otlp/src/otlp_grpc_metric_exporter_options.cc',
        'exporters/otlp/src/otlp_grpc_metric_exporter.cc',
        'exporters/otlp/src/otlp_grpc_utils.cc',
        'exporters/otlp/src/otlp_http.cc',
        'exporters/otlp/src/otlp_http_client.cc',
        'exporters/otlp/src/otlp_http_exporter.cc',
        'exporters/otlp/src/otlp_http_exporter_options.cc',
        'exporters/otlp/src/otlp_http_log_record_exporter.cc',
        'exporters/otlp/src/otlp_http_log_record_exporter_options.cc',
        'exporters/otlp/src/otlp_http_metric_exporter.cc',
        'exporters/otlp/src/otlp_http_metric_exporter_options.cc',
        'exporters/otlp/src/otlp_log_recordable.cc',
        'exporters/otlp/src/otlp_metric_utils.cc',
        'exporters/otlp/src/otlp_populate_attribute_utils.cc',
        'exporters/otlp/src/otlp_recordable_utils.cc',
        'exporters/otlp/src/otlp_recordable.cc',
        'ext/src/http/client/curl/http_client_curl.cc',
        'ext/src/http/client/curl/http_client_factory_curl.cc',
        'ext/src/http/client/curl/http_operation_curl.cc',
        'sdk/src/common/base64.cc',
        'sdk/src/common/env_variables.cc',
        'sdk/src/common/global_log_handler.cc',
        'sdk/src/logs/exporter.cc',
        'sdk/src/logs/readable_log_record.cc',
        'sdk/src/resource/resource.cc',
        'sdk/src/resource/resource_detector.cc',
        'sdk/src/trace/exporter.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/common/v1/common.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/logs/v1/logs.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/metrics/v1/metrics.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/resource/v1/resource.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/trace/v1/trace.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/logs/v1/logs_service.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/logs/v1/logs_service.grpc.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/metrics/v1/metrics_service.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/metrics/v1/metrics_service.grpc.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/trace/v1/trace_service.pb.cc',
        'third_party/opentelemetry-proto/gen/cpp/opentelemetry/proto/collector/trace/v1/trace_service.grpc.pb.cc'
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
        'BUILDING_LIBCURL',
        'HAVE_ABSEIL',
      ],
      'dependencies': [
        '../protobuf/protobuf.gyp:protobuf',
        '../curl/curl.gyp:curl',
        '../grpc/grpc.gyp:grpc++',
        '../grpc/grpc.gyp:abseil',
      ],
      'direct_dependent_settings': {
        'defines': [
          'HAVE_ABSEIL',
        ],
        'include_dirs': [
          'api/include',
          'exporters/otlp/include',
          'ext/include',
          'sdk/include',
          'third_party/opentelemetry-proto/gen/cpp',
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
        '--std=c++17',
        '-Wno-error',
        '-Wno-c++98-compat-extra-semi'
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
