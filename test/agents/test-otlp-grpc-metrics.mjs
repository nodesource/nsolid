// Flags: --expose-internals
import { mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'url';
import { isMainThread, threadId, Worker } from 'node:worker_threads';
import nsolid from 'nsolid';
import validators from 'internal/validators';

import {
  OTLPGRPCServer,
} from '../common/nsolid-otlp-agent/index.js';

const {
  validateArray,
  validateNumber,
} = validators;

const __filename = fileURLToPath(import.meta.url);

if (process.argv[2] === 'child') {
  // Just to keep the worker alive.
  setInterval(() => {
  }, 1000);

  if (isMainThread) {
    nsolid.start({
      tracingEnabled: false
    });

    nsolid.setThreadName('main-thread');

    const worker = new Worker(__filename, { argv: ['child'] });
    process.send({ type: 'workerThreadId', id: worker.threadId });
    process.send({
      type: 'nsolid',
      id: nsolid.id,
      appName: nsolid.appName,
      metrics: nsolid.metrics(),
    });
    process.on('message', (message) => {
      assert.strictEqual(message, 'exit');
      process.exit(0);
    });
  } else {
    nsolid.setThreadName('worker-thread');
  }
} else {
  const expectedProcMetrics = [
    [ 'uptime', 's', 'asInt', 'sum' ],
    [ 'system_uptime', 's', 'asInt', 'sum' ],
    [ 'free_mem', 'byte', 'asInt', 'gauge' ],
    [ 'block_input_op_count', undefined, 'asInt', 'sum' ],
    [ 'block_output_op_count', undefined, 'asInt', 'sum' ],
    [ 'ctx_switch_involuntary_count', undefined, 'asInt', 'sum' ],
    [ 'ctx_switch_voluntary_count', undefined, 'asInt', 'sum' ],
    [ 'ipc_received_count', undefined, 'asInt', 'sum' ],
    [ 'ipc_sent_count', undefined, 'asInt', 'sum' ],
    [ 'page_fault_hard_count', undefined, 'asInt', 'sum' ],
    [ 'page_fault_soft_count', undefined, 'asInt', 'sum' ],
    [ 'signal_count', undefined, 'asInt', 'sum' ],
    [ 'swap_count', undefined, 'asInt', 'sum' ],
    [ 'rss', 'byte', 'asInt', 'gauge' ],
    [ 'load_1m', undefined, 'asDouble', 'gauge' ],
    [ 'load_5m', undefined, 'asDouble', 'gauge' ],
    [ 'load_15m', undefined, 'asDouble', 'gauge' ],
    [ 'cpu_user_percent', undefined, 'asDouble', 'gauge' ],
    [ 'cpu_system_percent', undefined, 'asDouble', 'gauge' ],
    [ 'cpu_percent', undefined, 'asDouble', 'gauge' ],
  ];

  const expectedThreadMetrics = [
    ['active_handles', undefined, 'asInt', 'gauge'],
    ['active_requests', undefined, 'asInt', 'gauge'],
    ['total_heap_size', 'byte', 'asInt', 'gauge'],
    ['total_heap_size_executable', 'byte', 'asInt', 'gauge'],
    ['total_physical_size', 'byte', 'asInt', 'gauge'],
    ['total_available_size', 'byte', 'asInt', 'gauge'],
    ['used_heap_size', 'byte', 'asInt', 'gauge'],
    ['heap_size_limit', 'byte', 'asInt', 'gauge'],
    ['malloced_memory', 'byte', 'asInt', 'gauge'],
    ['external_memory', 'byte', 'asInt', 'gauge'],
    ['peak_malloced_memory', 'byte', 'asInt', 'gauge'],
    ['number_of_native_contexts', undefined, 'asInt', 'gauge'],
    ['number_of_detached_contexts', undefined, 'asInt', 'gauge'],
    ['gc_count', undefined, 'asInt', 'sum'],
    ['gc_forced_count', undefined, 'asInt', 'sum'],
    ['gc_full_count', undefined, 'asInt', 'sum'],
    ['gc_major_count', undefined, 'asInt', 'sum'],
    ['dns_count', undefined, 'asInt', 'sum'],
    ['http_client_abort_count', undefined, 'asInt', 'sum'],
    ['http_client_count', undefined, 'asInt', 'sum'],
    ['http_server_abort_count', undefined, 'asInt', 'sum'],
    ['http_server_count', undefined, 'asInt', 'sum'],
    ['loop_idle_time', 'ms', 'asInt', 'gauge'],
    ['loop_iterations', undefined, 'asInt', 'sum'],
    ['loop_iter_with_events', undefined, 'asInt', 'sum'],
    ['events_processed', undefined, 'asInt', 'sum'],
    ['events_waiting', undefined, 'asInt', 'gauge'],
    ['provider_delay', 'ms', 'asInt', 'gauge'],
    ['processing_delay', 'ms', 'asInt', 'gauge'],
    ['loop_total_count', undefined, 'asInt', 'sum'],
    ['pipe_server_created_count', undefined, 'asInt', 'sum'],
    ['pipe_server_destroyed_count', undefined, 'asInt', 'sum'],
    ['pipe_socket_created_count', undefined, 'asInt', 'sum'],
    ['pipe_socket_destroyed_count', undefined, 'asInt', 'sum'],
    ['tcp_server_created_count', undefined, 'asInt', 'sum'],
    ['tcp_server_destroyed_count', undefined, 'asInt', 'sum'],
    ['tcp_client_created_count', undefined, 'asInt', 'sum'],
    ['tcp_client_destroyed_count', undefined, 'asInt', 'sum'],
    ['udp_socket_created_count', undefined, 'asInt', 'sum'],
    ['udp_socket_destroyed_count', undefined, 'asInt', 'sum'],
    ['promise_created_count', undefined, 'asInt', 'sum'],
    ['promise_resolved_count', undefined, 'asInt', 'sum'],
    ['fs_handles_opened', undefined, 'asInt', 'sum'],
    ['fs_handles_closed', undefined, 'asInt', 'sum'],
    ['loop_utilization', undefined, 'asDouble', 'gauge'],
    ['res_5s', undefined, 'asDouble', 'gauge'],
    ['res_1m', undefined, 'asDouble', 'gauge'],
    ['res_5m', undefined, 'asDouble', 'gauge'],
    ['res_15m', undefined, 'asDouble', 'gauge'],
    ['loop_avg_tasks', undefined, 'asDouble', 'gauge'],
    ['loop_estimated_lag', 'ms', 'asDouble', 'gauge'],
    ['loop_idle_percent', undefined, 'asDouble', 'gauge'],
    ['gc_dur_us', 'us', 'asDouble', 'summary'],
    ['dns', 'ms', 'asDouble', 'summary'],
    ['http_client', 'ms', 'asDouble', 'summary'],
    ['http_server', 'ms', 'asDouble', 'summary'],
  ];

  // The format of the metrics is as follows:
  // resourceMetrics: [
  //   {
  //     resource: {
  //       attributes: [
  //         {
  //           key: 'telemetry.sdk.version',
  //           value: { stringValue: '1.14.2' }
  //         },
  //         {
  //           key: 'telemetry.sdk.language',
  //           value: { stringValue: 'cpp' }
  //         },
  //         {
  //           key: 'telemetry.sdk.name',
  //           value: { stringValue: 'opentelemetry' }
  //         },
  //         {
  //           key: 'service.instance.id',
  //           value: { stringValue: '9a5264ea230a7e001a11c865c943ba008bd633da' }
  //         },
  //         {
  //           key: 'service.name',
  //           value: { stringValue: 'untitled application' }
  //         }
  //       ]
  //     },
  //     scopeMetrics: [
  //       {
  //         scope: { name: 'nsolid', version: 'v20.11.1+nsv5.0.6-pre' },
  //         metrics: [
  //           {
  //             name: 'uptime',
  //             unit: 's',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '1'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'system_uptime',
  //             unit: 's',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '273691'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'free_mem',
  //             unit: 'byte',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '19899891712'
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'block_input_op_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'block_output_op_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '8'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'ctx_switch_involuntary_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'ctx_switch_voluntary_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '140'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'ipc_received_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'ipc_sent_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'page_fault_hard_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'page_fault_soft_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '7067'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'signal_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'swap_count',
  //             sum: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '0'
  //                 }
  //               ],
  //               aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
  //               isMonotonic: true
  //             }
  //           },
  //           {
  //             name: 'rss',
  //             unit: 'byte',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asInt: '69115904'
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'load_1m',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asDouble: 0.32
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'load_5m',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asDouble: 0.57
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'load_15m',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asDouble: 0.58
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'cpu_user_percent',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asDouble: 5.0957949606688135
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'cpu_system_percent',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asDouble: 0.36796747000516117
  //                 }
  //               ]
  //             }
  //           },
  //           {
  //             name: 'cpu_percent',
  //             gauge: {
  //               dataPoints: [
  //                 {
  //                   startTimeUnixNano: '1711743360185112000',
  //                   timeUnixNano: '1711743361584000000',
  //                   asDouble: 5.463762430673975
  //                 }
  //               ]
  //             }
  //           }
  //         ]
  //       }
  //     ]
  //   }
  // ]

  const State = {
    None: 0,
    ProcMetrics: 1,
    ThreadMetrics: 2,
    Done: 3,
  };

  let nsolidId;
  let nsolidAppName;
  let nsolidMetrics;

  function checkResource(resource) {
    validateArray(resource.attributes, 'attributes');

    const expectedAttributes = {
      'telemetry.sdk.version': '1.16.0',
      'telemetry.sdk.language': 'cpp',
      'telemetry.sdk.name': 'opentelemetry',
      'service.instance.id': nsolidId,
      'service.name': nsolidAppName,
      'process.title': nsolidMetrics.title,
      'process.owner': nsolidMetrics.user,
    };

    assert.strictEqual(resource.attributes.length, Object.keys(expectedAttributes).length);

    resource.attributes.forEach((attribute) => {
      assert.strictEqual(attribute.value.stringValue, expectedAttributes[attribute.key]);
      delete expectedAttributes[attribute.key];
    });

    assert.strictEqual(Object.keys(expectedAttributes).length, 0);
  }

  function checkScopeMetrics(scopeMetrics) {
    validateArray(scopeMetrics, 'scopeMetrics');
    assert.strictEqual(scopeMetrics.length, 1);
    assert.strictEqual(scopeMetrics[0].scope.name, 'nsolid');
    assert.strictEqual(scopeMetrics[0].scope.version,
                       `${process.version}+nsv${process.versions.nsolid}`);
  }

  function checkMetricsData(context) {
    const { metrics, expected } = context;
    const indicesToRemove = [];
    for (let i = 0; i < metrics.length; ++i) {
      const metric = metrics[i];
      const expectedIndex = expected.findIndex((m) => m[0] === metric.name);
      assert.notStrictEqual(expectedIndex, -1, `Unexpected metric: ${metric.name}`);
      const [name, unit, type, aggregation] = expected[expectedIndex];
      if (unit) {
        assert.strictEqual(metric.unit, unit);
      }

      assert.strictEqual(metric[aggregation].dataPoints.length, 1);
      const dataPoint = metric[aggregation].dataPoints[0];
      // eslint-disable-next-line eqeqeq
      if (context.threadId != undefined) {
        const attrIndex = dataPoint.attributes.findIndex((a) => a.key === 'thread.id' && a.value.intValue === `${context.threadId}`);
        if (attrIndex > -1) {
          indicesToRemove.push(i);
          const nameIndex = dataPoint.attributes.findIndex((a) => a.key === 'thread.name');
          assert(nameIndex > -1);
          if (context.threadId === 0) { // main-thread
            assert.strictEqual(dataPoint.attributes[nameIndex].value.stringValue, 'main-thread');
          } else {  // worker-thread
            assert.strictEqual(dataPoint.attributes[nameIndex].value.stringValue, 'worker-thread');
          }
        }
      } else {
        indicesToRemove.push(i);
      }

      const startTime = BigInt(dataPoint.startTimeUnixNano);
      assert.ok(startTime);
      const time = BigInt(dataPoint.timeUnixNano);
      assert.ok(time);
      assert.ok(time > startTime);
      if (aggregation !== 'summary') {
        if (type === 'asInt') {
          validateNumber(parseInt(dataPoint[type], 10), `${name}.${type}`);
        } else {  // asDouble
          validateNumber(dataPoint[type], `${name}.${type}`);
        }
      } else {
        validateArray(dataPoint.quantileValues, `${name}.quantileValues`);
        assert.strictEqual(dataPoint.quantileValues.length, 2);
        assert.strictEqual(dataPoint.quantileValues[0].quantile, 0.99);
        assert.strictEqual(dataPoint.quantileValues[1].quantile, 0.5);
        if (dataPoint.quantileValues[0].value) {
          validateNumber(dataPoint.quantileValues[0].value, `${name}.quantileValues[0].value`);
        }
        if (dataPoint.quantileValues[1].value) {
          validateNumber(dataPoint.quantileValues[1].value, `${name}.quantileValues[1].value`);
        }
      }

      expected.splice(expectedIndex, 1);
      if (expected.length === 0) {
        break;
      }
    }

    for (let i = indicesToRemove.length - 1; i >= 0; --i) {
      metrics.splice(indicesToRemove[i], 1);
    }
  }

  function checkMetrics(metrics, context) {
    const resourceMetrics = metrics.resourceMetrics;
    validateArray(resourceMetrics, 'resourceMetrics');
    assert.strictEqual(resourceMetrics.length, 1);
    checkResource(resourceMetrics[0].resource);
    checkScopeMetrics(resourceMetrics[0].scopeMetrics);

    if (resourceMetrics[0].scopeMetrics[0].metrics) {
      context.metrics = [...resourceMetrics[0].scopeMetrics[0].metrics];
      if (context.state === State.None) {
        const initialState = determineInitialState(context.metrics);
        if (!initialState) {
          return;
        }
        context.state = initialState.state;
        context.expected = [...initialState.expectedMetrics];
        context.threadId = initialState.threadId;
      }

      while (context.metrics.length > 0 && context.state !== State.Done) {
        checkMetricsData(context);
        if (context.expected.length === 0) {
          updateStateAndExpected(context);
        }
      }
    }
  }

  function determineInitialState(metrics) {
    // Check if the first metric contains the thread.id attribute to determine the initial state
    const metric = metrics[0];
    if (!metric) {
      return null;
    }
    const attributes = metric[metric.data].dataPoints[0].attributes;
    const attrIndex = attributes?.findIndex((a) => a.key === 'thread.id');
    if (attrIndex > -1) {
      const threadId = parseInt(attributes[attrIndex].value.intValue, 10);
      // Remove threadId from context.threadList array
      const threadList = context.threadList;
      const index = threadList.indexOf(threadId);
      if (index > -1) {
        threadList.splice(index, 1);
      }

      return { state: State.ThreadMetrics, expectedMetrics: [...expectedThreadMetrics], threadId };
    }

    return { state: State.ProcMetrics, expectedMetrics: [...expectedProcMetrics] };
  }

  function updateStateAndExpected(context) {
    if (context.state === State.ProcMetrics) {
      context.state = State.Done;
    } else if (context.state === State.ThreadMetrics) {
      if (context.threadList.length === 0) {
        context.state = State.ProcMetrics;
        context.expected = [...expectedProcMetrics];
      } else {
        context.threadId = context.threadList.shift();
        context.expected = [...expectedThreadMetrics];
      }
    }
  }

  const context = {
    state: State.None,
    prevState: State.None,
    metrics: [],
    expected: [],
    threadId: null,
    threadList: [ threadId ]
  };

  async function runTest(getEnv) {
    return new Promise((resolve, reject) => {
      const otlpServer = new OTLPGRPCServer();
      otlpServer.start(mustSucceed(async (port) => {
        otlpServer.on('metrics', mustCallAtLeast((metrics) => {
          checkMetrics(metrics, context);
          if (context.state === State.Done) {
            child.send('exit');
          }
        }, 1));

        console.log('OTLP server started', port);
        const env = getEnv(port);
        const opts = { env };
        const child = fork(__filename, ['child'], opts);
        child.on('message', (message) => {
          if (message.type === 'nsolid') {
            nsolidId = message.id;
            nsolidAppName = message.appName;
            nsolidMetrics = message.metrics;
          } else if (message.type === 'workerThreadId') {
            context.threadList.push(message.id);
          }
        });

        child.on('exit', (code, signal) => {
          console.log(`child process exited with code ${code} and signal ${signal}`);
          otlpServer.close();
          resolve();
        });
      }));
    });
  }

  const getEnvs = [
    (port) => {
      return {
        NSOLID_INTERVAL: 1000,
        NSOLID_OTLP: 'otlp',
        NSOLID_OTLP_CONFIG: JSON.stringify({
          url: `http://localhost:${port}`,
          protocol: 'grpc',
        }),
      };
    },
    (port) => {
      return {
        NSOLID_INTERVAL: 1000,
        NSOLID_OTLP: 'otlp',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}/v1/metrics`,
      };
    },
    (port) => {
      return {
        NSOLID_INTERVAL: 1000,
        NSOLID_OTLP: 'otlp',
        OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: 'grpc',
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `http://localhost:${port}/v1/metrics`,
      };
    },
  ];

  for (const getEnv of getEnvs) {
    await runTest(getEnv);
    console.log('run test!');
  }
}
