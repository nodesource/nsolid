'use strict';

const http = require('node:http');
const { parseArgs } = require('node:util');
const { isMainThread, parentPort, Worker, threadId } = require('node:worker_threads');
const nsolid = require('nsolid');
const { fixturesDir } = require('../fixtures');

const options = {
  trace: {
    type: 'string',
    short: 't',
  },
  workers: {
    type: 'string',
    short: 'w',
  },
};
const args = parseArgs({ options });

const interval = setInterval(() => {
}, 100);

function execHttpTransaction() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World\n');
  });

  server.listen(0, () => {
    const port = server.address().port;
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: '/',
    }, (res) => {
      res.on('data', () => {
      });
      res.on('end', () => {
        server.close();
      });
    });
    req.end();
  });
}

function execDnsTransaction() {
  const dns = require('node:dns');
  dns.lookup('example.org', () => {
    dns.lookupService('127.0.0.1', 22, () => {
      dns.resolve('example.org', () => {
      });
    });
  });
}

function execCustomTrace() {
  console.log('execCustomTrace');
  const api = require(require.resolve('@opentelemetry/api',
                                      { paths: [fixturesDir] }));
  console.log(nsolid.otel.register(api));
  const tracer = api.trace.getTracer('test');
  const span = tracer.startSpan('initial_name', { attributes: { a: 1, b: 2 },
                                                  kind: api.SpanKind.CLIENT });
  span.setAttributes({ c: 3, d: 4 })
      .setAttribute('e', 5)
      .addEvent('my_event 1', Date.now())
      .addEvent('my_event 2', { attr1: 'val1', attr2: 'val2' }, Date.now());
  span.recordException(new Error('my_exception'));
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'my_message' });
  span.end();
  setTimeout(() => {}, 1000);
}

function blockFor(duration) {
  const start = Date.now();
  while (Date.now() - start < duration);
}

function handleTrace(msg) {
  if (msg.type === 'trace') {
    switch (msg.kind) {
      case 'http':
        execHttpTransaction();
        break;
      case 'dns':
        execDnsTransaction();
        break;
      case 'custom':
        execCustomTrace();
        break;
    }
  }
}

if (isMainThread) {
  const workers = new Map();
  process.on('message', (msg) => {
    if (msg.type === 'block') {
      if (threadId === msg.threadId) {
        blockFor(msg.duration);
      } else {
        workers.get(msg.threadId).postMessage(msg);
      }
    } else if (msg.type === 'config') {
      process.send({ type: 'config', config: nsolid.config });
    } else if (msg.type === 'shutdown') {
      clearInterval(interval);
      if (!msg.error) {
        process.exit(msg.code || 0);
      } else {
        throw new Error('error');
      }
    } else if (msg.type === 'startupTimes') {
      process.recordStartupTime(msg.name);
      process.send(msg);
    } else if (msg.type === 'threadName') {
      if (threadId === msg.threadId) {
        nsolid.setThreadName(msg.name);
        process.send(msg);
      } else {
        const worker = workers.get(msg.threadId);
        worker.once('message', (msg) => {
          process.send(msg);
        });
        worker.postMessage(msg);
      }
    } else if (msg.type === 'trace') {
      if (threadId === msg.threadId) {
        handleTrace(msg);
      } else {
        workers.get(msg.threadId).postMessage(msg);
      }
    } else if (msg.type === 'workers') {
      process.send({ type: 'workers', ids: Array.from(workers.keys()) });
    }
  });

  if (args.values.workers) {
    const NUM_WORKERS = parseInt(args.values.workers, 10);
    if (!Number.isNaN(NUM_WORKERS)) {
      for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = new Worker(__filename);
        workers.set(worker.threadId, worker);
      }
    }
  }

  if (args.values.trace) {
    const trace = args.values.trace;
    if (trace === 'http') {
      // TODO(santigimeno): ideally we should be able to collect traces
      // immediately without the need of calling nsolid.start()
      nsolid.start();
      execHttpTransaction();
    } else if (trace === 'dns') {
      execDnsTransaction();
    } else if (trace === 'custom') {
      execCustomTrace();
    }
  }
} else {
  parentPort.on('message', (msg) => {
    console.log('message', msg);
    switch (msg.type) {
      case 'block':
        blockFor(msg.duration);
        break;
      case 'threadName':
        nsolid.setThreadName(msg.name);
        parentPort.postMessage(msg);
        break;
      case 'trace':
        handleTrace(msg);
        break;
    }
  });
}
