// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const assert = require('assert');
const http = require('http');
const { once } = require('events');

const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const concurrency = 16;
const fetchRounds = 150;
const toggleRounds = 400;

async function main() {
  binding.skipExpectedTracesCheck();
  binding.setupTracing(binding.kSpanHttpClient);

  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'text/plain' });
    setImmediate(() => res.end('ok'));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;

  const failures = [];

  async function runFetches() {
    for (let i = 0; i < fetchRounds; i++) {
      const batch = Array.from({ length: concurrency }, async () => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            body: 'payload',
          });
          await res.text();
        } catch (err) {
          failures.push(err);
        }
      });
      await Promise.all(batch);
    }
  }

  async function toggleTracing() {
    for (let i = 0; i < toggleRounds; i++) {
      binding.stopTracing();
      await new Promise(setImmediate);
      binding.setupTracing(binding.kSpanHttpClient);
      await new Promise(setImmediate);
    }
  }

  try {
    await Promise.all([
      runFetches(),
      toggleTracing(),
    ]);
  } finally {
    binding.stopTracing();
    server.close();
    await once(server, 'close');
  }

  assert.deepStrictEqual(failures, []);
}

main().then(common.mustCall()).catch((err) => {
  throw err;
});
