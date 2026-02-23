// Flags: --expose-internals
import { mustSucceed } from '../../../common/index.mjs';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GRPCServer,
} from '../../../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';
import nsolid from 'nsolid';

const {
  validateString,
} = validators;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Skip test if dependencies not installed
if (!existsSync(join(__dirname, 'node_modules'))) {
  console.log('SKIP: node_modules not found. Run "make test-integrations-prereqs" first.');
  process.exit(0);
}

const { default: pino } = await import('pino');

function checkLogRecords(logRecords) {
  const expectedLevels = [ 'trace', 'debug', 'info', 'warn', 'error', 'fatal' ];
  const expectedLevelsUpper = [ 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL' ];

  assert.strictEqual(logRecords.length, 6, 'Expected exactly 6 log records');
  
  // Sort logRecords identically by their original emission order based on body content (or we could use time)
  // Since we know the messages we emitted, we can sort them by the expected messages
  logRecords.sort((a, b) => {
    const idxA = expectedLevels.findIndex(lvl => a.body.stringValue.includes(lvl));
    const idxB = expectedLevels.findIndex(lvl => b.body.stringValue.includes(lvl));
    return idxA - idxB;
  });
  
  for (let i = 0; i < logRecords.length; i++) {
    const logRecord = logRecords[i];
    const expectedMessage = `pino ${expectedLevels[i]} message`;
    assert(logRecord.body.stringValue.includes(expectedMessage), `Expected ${logRecord.body.stringValue} to include ${expectedMessage}`);
    validateString(logRecord.severityNumber, `SEVERITY_NUMBER_${expectedLevelsUpper[i]}`);
    validateString(logRecord.severityText, expectedLevelsUpper[i]);
  }
}

async function runTest() {
  const grpcServer = new GRPCServer();

  const grpcPort = await new Promise((resolve) => {
    grpcServer.start(mustSucceed((port) => {
      resolve(port);
    }));
  });

  // Configure NSolid to connect to our gRPC server
  process.env.NSOLID_GRPC_INSECURE = '1';
  process.env.NODE_DEBUG_NATIVE = 'nsolid_grpc_agent';

  // Initialize NSolid
  nsolid.start({ grpc: `localhost:${grpcPort}`, interval: 1000 });

  const logger = pino({ level: 'trace' });

  const logRecords = [];
  const logsPromise = new Promise((resolve) => {
    grpcServer.on('logs', (data) => {
      const resourceLogs = data.resourceLogs;
      if (!resourceLogs || resourceLogs.length === 0) return;
      
      for (const scopeLog of resourceLogs[0].scopeLogs) {
        if (scopeLog.logRecords) {
          logRecords.push(...scopeLog.logRecords);
        }
      }

      if (logRecords.length === 6) {
        checkLogRecords(logRecords);
        resolve();
      }
    });
  });

  // Wait a moment for grpc to fully connect
  await new Promise(r => setTimeout(r, 500));

  logger.trace('pino trace message');
  logger.debug('pino debug message');
  logger.info('pino info message');
  logger.warn('pino warn message');
  logger.error('pino error message');
  logger.fatal('pino fatal message');

  await logsPromise;

  await new Promise((resolve) => {
    grpcServer.close();
    resolve();
  });
}

await runTest();
console.log('Pino v10 logs test passed!');
