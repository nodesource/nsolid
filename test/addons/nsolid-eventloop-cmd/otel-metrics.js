'use strict';

const common = require('../../common');
const { MessageChannel } = require('worker_threads');
const nsolid = require('nsolid');
const binding = require(`./build/${common.buildType}/binding`);

// The port keeps the loop alive without timers or incoming messages.
const { port1, port2 } = new MessageChannel();
port1.once('message', common.mustCall(() => {
  port1.close();
  port2.close();
}));

const gauge = nsolid.otel.api.metrics.getMeter('callback-scope')
  .createObservableGauge('observed');
gauge.addCallback(async (result) => {
  await Promise.resolve();
  result.observe(1);
  binding.observeOtelMetric();
  port2.postMessage('done');
});
binding.collectOtelMetrics();
