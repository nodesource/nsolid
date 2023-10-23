'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const spawn = require('child_process').spawn;

const PORT = 12345;
const saasToken =
  'c,cm87>%>h9-0sa-Nqc+@^CRMFB,.Smh&FYocK%Z0708a5c9-7147-4791-88f8-091ac2f48af8.prod.proxy.saas.nodesource.io:9001';
const saasCommand = '0708a5c9-7147-4791-88f8-091ac2f48af8.prod.proxy.saas.nodesource.io:9001';

function execProc1() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_COMMAND: PORT,
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', (code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  });
}

function execProc2() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', (code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, saasCommand);
    assert.strictEqual(config.saas, saasToken);
  });
}

function execProc3() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child2' ],
                     {
                       env: {
                         NSOLID_COMMAND: PORT
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', (code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, saasCommand);
    assert.strictEqual(config.saas, saasToken);
  });
}

function execProc4() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child3' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', (code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  });
}

function execProc5() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child4' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', (code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.first.command, `localhost:${PORT}`);
    assert.strictEqual(config.first.saas, undefined);
    assert.strictEqual(config.second.command, saasCommand);
    assert.strictEqual(config.second.saas, saasToken);
  });
}

switch (process.argv[2]) {
  case 'child1':
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child2':
    nsolid.start({
      saas: saasToken
    });
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child3':
    nsolid.start({
      command: PORT
    });
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child4':
    {
      const out = {};
      nsolid.start({
        command: PORT
      });
      out.first = nsolid.config;
      nsolid.start({
        saas: saasToken
      });
      out.second = nsolid.config;
      process.stdout.write(JSON.stringify(out));
    }
    break;
  default:
    execProc1();
    execProc2();
    execProc3();
    execProc4();
    execProc5();
}
