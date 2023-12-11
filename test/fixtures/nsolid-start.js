'use strict';

const { parseArgs } = require('node:util');
const { isMainThread, Worker } = require('node:worker_threads');

const options = {
  workers: {
    type: 'string',
    short: 'w',
  },
};
const args = parseArgs({ options });

const interval = setInterval(() => {
}, 100);

if (isMainThread) {
  const workers = [];
  process.on('message', (msg) => {
    if (msg.type === 'shutdown') {
      clearInterval(interval);
      if (!msg.error) {
        process.exit(msg.code || 0);
      } else {
        throw new Error('error');
      }
    } else if (msg.type === 'workers') {
      process.send({ type: 'workers', ids: workers.map((w) => w.threadId) });
    } else if (msg.type === 'startupTimes') {
      process.recordStartupTime(msg.name);
      process.send(msg);
    }
  });

  if (args.values.workers) {
    const NUM_WORKERS = parseInt(args.values.workers, 10);
    if (!isNaN(NUM_WORKERS)) {
      for (let i = 0; i < NUM_WORKERS; i++) {
        workers.push(new Worker(__filename));
      }
    }
  }
}


