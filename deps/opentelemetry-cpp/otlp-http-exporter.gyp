{
  'targets': [
    {
      'target_name': 'opentelemetry-sdk',
      'type': 'static_library',
      'sources': [
        'sdk/src/common/base64.cc',
        'sdk/src/common/env_variables.cc',
        'sdk/src/common/global_log_handler.cc',
        'sdk/src/common/random.cc',
        'sdk/src/logs/exporter.cc',
        'sdk/src/logs/readable_log_record.cc',
        'sdk/src/metrics/async_instruments.cc',
        'sdk/src/metrics/instrument_metadata_validator.cc',
        'sdk/src/metrics/meter.cc',
        'sdk/src/metrics/meter_config.cc',
        'sdk/src/metrics/meter_context.cc',
        'sdk/src/metrics/meter_provider.cc',
        'sdk/src/metrics/metric_reader.cc',
        'sdk/src/metrics/sync_instruments.cc',
        'sdk/src/metrics/aggregation/base2_exponential_histogram_aggregation.cc',
        'sdk/src/metrics/aggregation/base2_exponential_histogram_indexer.cc',
        'sdk/src/metrics/aggregation/histogram_aggregation.cc',
        'sdk/src/metrics/aggregation/lastvalue_aggregation.cc',
        'sdk/src/metrics/aggregation/sum_aggregation.cc',
        'sdk/src/metrics/data/circular_buffer.cc',
        'sdk/src/metrics/state/filtered_ordered_attribute_map.cc',
        'sdk/src/metrics/state/metric_collector.cc',
        'sdk/src/metrics/state/observable_registry.cc',
        'sdk/src/metrics/state/sync_metric_storage.cc',
        'sdk/src/metrics/state/temporal_metric_storage.cc',
        'sdk/src/resource/resource.cc',
        'sdk/src/resource/resource_detector.cc',
        'sdk/src/trace/batch_span_processor.cc',
        'sdk/src/trace/exporter.cc',
        'sdk/src/trace/random_id_generator.cc',
        'sdk/src/trace/span.cc',
        'sdk/src/trace/tracer.cc',
        'sdk/src/trace/tracer_config.cc',
        'sdk/src/trace/tracer_context.cc',
        'sdk/src/trace/tracer_provider.cc',
      ],
      'include_dirs': [
        'api/include',
        'sdk',
        'sdk/include',
      ],
      'defines': [
        'OPENTELEMETRY_STL_VERSION=2020',
      ],
      'dependencies': [
      ],
      'direct_dependent_settings': {
        'defines': [
          'OPENTELEMETRY_STL_VERSION=2020',
        ],
        'include_dirs': [
          'api/include',
          'sdk/include',
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
        '--std=c++20',
        '-Wno-error',
        # '-Wno-c++98-compat-extra-semi'
      ],
      'msvs_settings': {
      },
      'xcode_settings': {
        'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES',  # -fvisibility=hidden,
        'GCC_ENABLE_CPP_EXCEPTIONS': 'YES'    # -fexceptions
      },
      'conditions': [
        [ 'OS=="win"', {
          'sources': [
            'sdk/src/common/platform/fork_windows.cc'
          ]
        }, {
          'sources': [
            'sdk/src/common/platform/fork_unix.cc'
          ]
        }],
      ],
    },
    {
      'target_name': 'otlp-http-exporter',
      'type': 'static_library',
      'sources': [
        'exporters/otlp/src/otlp_environment.cc',
        'exporters/otlp/src/otlp_grpc_client.cc',
        'exporters/otlp/src/otlp_grpc_client_factory.cc',
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
        'exporters/otlp/include',
        'ext/include',
        'third_party/opentelemetry-proto/gen/cpp',
        '../../src'
      ],
      'defines': [
        'BUILDING_LIBCURL',
        'ENABLE_ASYNC_EXPORT',
        'ENABLE_OTLP_GRPC_CREDENTIAL_PREVIEW',
        'OPENTELEMETRY_STL_VERSION=2020',
      ],
      'dependencies': [
        'opentelemetry-sdk',
        '../protobuf/protobuf.gyp:protobuf',
        '../curl/curl.gyp:curl',
        '../grpc/grpc.gyp:grpc++',
	      '../protobuf/abseil.gyp:abseil_proto',
        '../zlib/zlib.gyp:zlib',
      ],
      'direct_dependent_settings': {
        'defines': [
          'ENABLE_ASYNC_EXPORT',
          'ENABLE_OTLP_GRPC_CREDENTIAL_PREVIEW',
          'OPENTELEMETRY_STL_VERSION=2020',
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
        '--std=c++20',
        '-Wno-error',
        # '-Wno-c++98-compat-extra-semi'
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
