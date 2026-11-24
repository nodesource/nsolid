// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const assert = require('assert');
const http = require('http');
const { setupNSolid } = require('./utils');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const fixtures = require('../../common/fixtures');
const binding = require(`./build/${common.buildType}/binding`);
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

setupNSolid({ lookup: false }, common.mustCall(() => {
  assert.ok(nsolid.otel.register(api));
  const tracer = api.trace.getTracer('test');
  checkTracesOnExit(binding, [1, 2].map((id) => ({
    name: `parent ${id}`,
    children: [
      { name: 'HTTP GET', children: [{ name: 'HTTP GET' }] },
      { name: `data ${id}` },
      { name: `end ${id}` },
    ],
  })));

  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const server = http.createServer(common.mustCall((req, res) => {
    res.flushHeaders();
    setTimeout(() => res.end('body'), 10);
  }, 2));
  let socket;
  server.listen(0, '127.0.0.1', common.mustCall(() => request(1)));

  function request(id) {
    const parent = tracer.startSpan(`parent ${id}`, { root: true });
    const context = api.trace.setSpan(api.ROOT_CONTEXT, parent);
    api.context.with(context, common.mustCall(() => {
      const req = http.get({
        host: '127.0.0.1', port: server.address().port, agent,
      }, common.mustCall((res) => {
        if (id === 1) socket = res.socket;
        else assert.strictEqual(res.socket, socket);
        res.on('data', common.mustCall(() => {
          assert.strictEqual(api.context.active(), context);
          tracer.startSpan(`data ${id}`).end();
        }));
        res.on('end', common.mustCall(() => {
          assert.strictEqual(api.context.active(), context);
          tracer.startSpan(`end ${id}`).end();
          parent.end();
        }));
      }));
      req.on('close', common.mustCall(() => {
        if (id === 1) request(2);
        else {
          agent.destroy();
          server.close();
        }
      }));
    }));
  }
}));
