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
  validateArray,
  validateInteger,
  validateObject,
  validateString,
} = validators;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Skip test if dependencies not installed
if (!existsSync(join(__dirname, 'node_modules'))) {
  console.log('SKIP: node_modules not found. Run "make test-integrations-prereqs" first.');
  process.exit(0);
}

const { default: winston } = await import('winston');

function checkLogRecords(logRecords) {
  const expectedLevels = [ 'debug', 'error', 'info', 'warn' ];
  const expectedLevelsUpper = [ 'DEBUG', 'ERROR', 'INFO', 'WARN' ];

  // As logRecords doesn't have a strict order, order it based on severityText
  logRecords.sort((a, b) => a.severityText.localeCompare(b.severityText));
  
  // Winston silly/verbose/debug all map to OTel DEBUG, so we just expect 4 distinct levels from our test
  assert.strictEqual(logRecords.length, 4, 'Expected exactly 4 log records');
  
  for (let i = 0; i < logRecords.length; i++) {
    const logRecord = logRecords[i];
    const expectedMessage = `winston ${expectedLevels[i]} message`;
    // Winston json format stringifies the message
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

  const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.json(),
    transports: [
      new winston.transports.Console()
    ]
  });

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

      if (logRecords.length === 4) {
        checkLogRecords(logRecords);
        resolve();
      }
    });
  });

  // Wait a moment for grpc to fully connect
  await new Promise(r => setTimeout(r, 500));

  logger.debug('winston debug message');
  logger.info('winston info message');
  logger.warn('winston warn message');
  logger.error('winston error message');

  await logsPromise;

  await new Promise((resolve) => {
    grpcServer.close();
    resolve();
  });
}

await runTest();
console.log('Winston v3 logs test passed!');
