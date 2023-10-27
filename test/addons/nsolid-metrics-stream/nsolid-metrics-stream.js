// Flags: --dns-result-order=ipv4first
'use strict';

const { buildType, mustSucceed, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const { getMetricsStreamStart,
        getMetricsStreamStop,
        KDns,
        KHttpClient,
        KHttpServer } = require(bindingPath);
const { Worker, isMainThread, parentPort, BroadcastChannel } = require('worker_threads');
const nsolid = require('nsolid');
const dns = require('dns');
const http = require('http');
const WORKERS = 1;
let stop_calls = 0;
let stopDone = false;


const bc = new BroadcastChannel('stop');


function messageHandler(msg) {
  assert.strictEqual(msg, 'stop');
  if (++stop_calls === WORKERS + 1) {
    getMetricsStreamStop();
    bc.postMessage('done');
    stopDone = true;
  }
}

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

function createHttpServer(port, cb) {
  const hostname = '127.0.0.1';
  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello, World!\n');
  });

  server.on('error', cb);
  server.listen(port, hostname, cb);

  return server;
}

function sendHttpRequest(port, cb) {
  http.get({ port }, (res) => {
    cb();
  }).on('error', cb);
}

function test() {
  let dns_count_sent = 0;
  let dns_count_recv = 0;
  let http_req_sent = 0;
  let http_req_send_cb = 0;
  const http_tx_metrics_recv = [];
  const flags = KDns | KHttpClient | KHttpServer;

  function metricsListener(metrics) {
    if (dns_count_recv < 20) {
      dns_count_recv += metrics.length;
      metrics.forEach(({ type }) => {
        assert.strictEqual(type, KDns);
      });

      if (dns_count_recv === 20)
        assert.strictEqual(dns_count_sent, dns_count_recv);

      return;
    }

    // Every http req generates 3 metric points: dns, http-client, http-server
    // it should never go then over 60 as we've stopped capturing metrics after
    // the first 20 requests.
    assert(http_tx_metrics_recv.length <= 60);
    if (http_tx_metrics_recv.length <= 60) {
      http_tx_metrics_recv.push(...metrics);
      assert(http_tx_metrics_recv.length <= 60);
      if (http_tx_metrics_recv.length === 60) {
        const counters = {
          dns: 0,
          http_client: 0,
          http_server: 0,
        };
        http_tx_metrics_recv.forEach(({ type }, index) => {
          if (type === KDns)
            counters.dns++;
          else if (type === KHttpClient)
            counters.http_client++;
          else if (type === KHttpServer)
            counters.http_server++;
          else
            assert(0);
        });

        assert.strictEqual(counters.dns, 20);
        assert.strictEqual(counters.http_client, 20);
        assert.strictEqual(counters.http_server, 20);
      }
    }
  }

  getMetricsStreamStart(flags, metricsListener);

  const server = createHttpServer(0, (err) => {
    assert.ifError(err);
    let stopCalled = false;

    bc.onmessage = (event) => {
      if (event.data === 'done') {
        stopDone = true;
      }
    };

    const interval = setInterval(() => {
      if (dns_count_recv === 20) {
        // Done with dns reqs, check http metrics
        assert.ifError(err);
        if (http_tx_metrics_recv.length < 60) {
          if (http_tx_metrics_recv.length === 3 * http_req_sent) {
            http_req_sent++;
            sendHttpRequest(server.address().port, mustSucceed(() => {}));
          }

          return;
        }

        // Stop gathering metrics for 20 more requests.
        if (!stopCalled) {
          if (parentPort) {
            parentPort.postMessage('stop');
          } else {
            messageHandler('stop');
          }

          stopCalled = true;
        }

        if (stopDone && http_req_sent < 40) {
          http_req_sent++;
          sendHttpRequest(server.address().port, mustSucceed(() => {
            http_req_send_cb++;
            if (http_req_send_cb === 20) {
              clearInterval(interval);
              server.close();
              bc.close();
            }
          }));
        }

        return;
      }

      if (dns_count_sent < 20) {
        dns_count_sent++;
        dns.resolve4('archive.org', mustSucceed(() => {
        }));
      }
    }, 80);
  });
}

if (isMainThread) {
  nsolid.start();
  for (let i = 0; i < WORKERS; i++) {
    const worker = new Worker(__filename, { argv: [process.pid] });
    worker.on('message', messageHandler);
    worker.on('exit', (code) => {
      assert.strictEqual(code, 0);
    });
  }
}

test();
