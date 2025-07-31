'use strict';
const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const { writeLog } = require(bindingPath);
const { Worker, isMainThread } = require('worker_threads');
const { logger } = require('nsolid');

if (!isMainThread) {
  writeLog('boom!');
  logger.debug('hi');
  logger.info('hi');
  logger.warn('hi');
  logger.error('hi');
  logger.fatal('hi');
  setTimeout(() => {}, Math.random() * 1000);
  return;
}

writeLog('bam!');
logger.debug('hi');
logger.info('hi');
logger.warn('hi');
logger.error('hi');
logger.fatal('hi');

for (let i = 0; i < 10; i++) {
  const worker = new Worker(__filename);
  worker.on('exit', (code) => {
    assert.strictEqual(code, 0);
  });
}
