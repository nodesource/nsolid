'use strict'

/*
 * AVOID EDITING
 *
 * Context: This is to run a command with child_process.exec(), returning { stdout, stderr } obviously:
 * - If opts.env is passed in, only needs to be extra env vars.
 * - Trims white-space from the end of stdout/stderr.
 * - On errors from child_process, throws new exception with copied properties.
 *
 * This file's source is ripped as directly from Node core as possible,
 * with only copatibility adjustments and specialized bugfixes!
 *
 * LIST OF CHANGES:
 * - Errors. Obviously. Node core's error mechanism is hidden & inacessible.
 * - Imports, bindings. Also hidden & inacessible.
 * - Truncated push()-es to _std{out,err} when maxBuffer has been hit.
 */

/* eslint-disable semi, indent, space-before-function-paren, curly, node/no-deprecated-api */

const util = require('util')
const { spawn } = require('child_process')
const { errmap } = process.binding('uv')
const { signals } = process.binding('constants').os

function normalizeExecArgs(command, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  // Make a shallow copy so we don't clobber the user's options object.
  options = Object.assign({}, options);
  options.shell = typeof options.shell === 'string' ? options.shell : true;

  return {
    file: command,
    options: options,
    callback: callback
  };
}

exports.exec = function exec(/* command , options, callback */) {
  const opts = normalizeExecArgs.apply(null, arguments);
  return exports.execFile(opts.file,
                          opts.options,
                          opts.callback);
};

const customPromiseExecFunction = (orig) => {
  return (...args) => {
    return new Promise((resolve, reject) => {
      orig(...args, (err, stdout, stderr) => {
        if (err !== null) {
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  };
};

Object.defineProperty(exports.exec, util.promisify.custom, {
  enumerable: false,
  value: customPromiseExecFunction(exports.exec)
});

exports.execFile = function execFile(file /* , args, options, callback */) {
  var args = [];
  var callback;
  var options = {
    encoding: 'utf8',
    timeout: 0,
    maxBuffer: 200 * 1024,
    killSignal: 'SIGTERM',
    cwd: null,
    env: null,
    shell: false
  };

  // Parse the optional positional parameters.
  var pos = 1;
  if (pos < arguments.length && Array.isArray(arguments[pos])) {
    args = arguments[pos++];
  } else if (pos < arguments.length && arguments[pos] == null) {
    pos++;
  }

  if (pos < arguments.length && typeof arguments[pos] === 'object') {
    util._extend(options, arguments[pos++]);
  } else if (pos < arguments.length && arguments[pos] == null) {
    pos++;
  }

  if (pos < arguments.length && typeof arguments[pos] === 'function') {
    callback = arguments[pos++];
  }

  if (!callback && pos < arguments.length && arguments[pos] != null) {
    throw new TypeError(`ERR_INVALID_ARG_VALUE args ${arguments[pos]}`);
  }

  // Validate the timeout, if present.
  validateTimeout(options.timeout);

  // Validate maxBuffer, if present.
  validateMaxBuffer(options.maxBuffer);

  options.killSignal = sanitizeKillSignal(options.killSignal);

  var child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    gid: options.gid,
    uid: options.uid,
    shell: options.shell,
    windowsHide: !!options.windowsHide,
    windowsVerbatimArguments: !!options.windowsVerbatimArguments
  });

  var encoding;
  var _stdout = [];
  var _stderr = [];
  if (options.encoding !== 'buffer' && Buffer.isEncoding(options.encoding)) {
    encoding = options.encoding;
  } else {
    encoding = null;
  }
  var stdoutLen = 0;
  var stderrLen = 0;
  var killed = false;
  var exited = false;
  var timeoutId;

  var ex = null;

  var cmd = file;

  function exithandler(code, signal) {
    if (exited) return;
    exited = true;

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (!callback) return;

    // merge chunks
    var stdout;
    var stderr;
    if (encoding ||
      (
        child.stdout &&
        child.stdout._readableState &&
        child.stdout._readableState.encoding
      )) {
      stdout = _stdout.join('');
    } else {
      stdout = Buffer.concat(_stdout);
    }
    if (encoding ||
      (
        child.stderr &&
        child.stderr._readableState &&
        child.stderr._readableState.encoding
      )) {
      stderr = _stderr.join('');
    } else {
      stderr = Buffer.concat(_stderr);
    }

    if (!ex && code === 0 && signal === null) {
      callback(null, stdout, stderr);
      return;
    }

    if (args.length !== 0)
      cmd += ` ${args.join(' ')}`;

    if (!ex) {
      // eslint-disable-next-line no-restricted-syntax
      ex = new Error('Command failed: ' + cmd + '\n' + stderr);
      ex.killed = child.killed || killed;
      ex.code = code < 0 ? getSystemErrorName(code) : code;
      ex.signal = signal;
    }

    ex.cmd = cmd;
    callback(ex, stdout, stderr);
  }

  function errorhandler(e) {
    ex = e;

    if (child.stdout)
      child.stdout.destroy();

    if (child.stderr)
      child.stderr.destroy();

    exithandler();
  }

  function kill() {
    if (child.stdout)
      child.stdout.destroy();

    if (child.stderr)
      child.stderr.destroy();

    killed = true;
    try {
      child.kill(options.killSignal);
    } catch (e) {
      ex = e;
      exithandler();
    }
  }

  if (options.timeout > 0) {
    timeoutId = setTimeout(function delayedKill() {
      kill();
      timeoutId = null;
    }, options.timeout);
  }

  if (child.stdout) {
    if (encoding)
      child.stdout.setEncoding(encoding);

    child.stdout.on('data', function onChildStdout(chunk) {
      var encoding = child.stdout._readableState.encoding;
      stdoutLen += encoding ? Buffer.byteLength(chunk, encoding) : chunk.length;

      if (stdoutLen > options.maxBuffer) {
        // BEGIN OUR CODE
        // Truncated push() to _stdout when maxBuffer has been hit.
        const length = encoding ? Buffer.byteLength(chunk, encoding) : chunk.length;
        _stdout.push(chunk.slice(0, options.maxBuffer - (stdoutLen - length)));
        // END OUR CODE
        ex = new RangeError('ERR_CHILD_PROCESS_STDIO_MAXBUFFER stdout');
        kill();
      } else {
        _stdout.push(chunk);
      }
    });
  }

  if (child.stderr) {
    if (encoding)
      child.stderr.setEncoding(encoding);

    child.stderr.on('data', function onChildStderr(chunk) {
      var encoding = child.stderr._readableState.encoding;
      stderrLen += encoding ? Buffer.byteLength(chunk, encoding) : chunk.length;

      if (stderrLen > options.maxBuffer) {
        // BEGIN OUR CODE
        // Truncated push() to _stderr when maxBuffer has been hit.
        const length = encoding ? Buffer.byteLength(chunk, encoding) : chunk.length;
        _stderr.push(chunk.slice(0, options.maxBuffer - (stderrLen - length)));
        // END OUR CODE
        ex = new RangeError('ERR_CHILD_PROCESS_STDIO_MAXBUFFER stderr');
        kill();
      } else {
        _stderr.push(chunk);
      }
    });
  }

  child.addListener('close', exithandler);
  child.addListener('error', errorhandler);

  return child;
};

Object.defineProperty(exports.execFile, util.promisify.custom, {
  enumerable: false,
  value: customPromiseExecFunction(exports.execFile)
});

function validateTimeout(timeout) {
  if (timeout != null && !(Number.isInteger(timeout) && timeout >= 0)) {
    throw new RangeError(`ERR_OUT_OF_RANGE timeout 'an unsigned integer' ${timeout}`);
  }
}

function validateMaxBuffer(maxBuffer) {
  if (maxBuffer != null && !(typeof maxBuffer === 'number' && maxBuffer >= 0)) {
    throw new RangeError(`ERR_OUT_OF_RANGE options.maxBuffer 'a positive number' ${maxBuffer}`);
  }
}

function sanitizeKillSignal(killSignal) {
  if (typeof killSignal === 'string' || typeof killSignal === 'number') {
    return convertToValidSignal(killSignal);
  } else if (killSignal != null) {
    throw new TypeError(`ERR_INVALID_ARG_TYPE options.killSignal ${['string', 'number']} ${killSignal}`);
  }
}

function getSystemErrorName(err) {
  const entry = errmap.get(err);
  return entry ? entry[0] : `Unknown system error ${err}`;
}

let signalsToNamesMapping;
function getSignalsToNamesMapping() {
  if (signalsToNamesMapping !== undefined)
    return signalsToNamesMapping;

  signalsToNamesMapping = Object.create(null);
  for (var key in signals) {
    signalsToNamesMapping[signals[key]] = key;
  }

  return signalsToNamesMapping;
}

function convertToValidSignal(signal) {
  if (typeof signal === 'number' && getSignalsToNamesMapping()[signal])
    return signal;

  if (typeof signal === 'string') {
    const signalName = signals[signal.toUpperCase()];
    if (signalName) return signalName;
  }

  throw new TypeError(`ERR_UNKNOWN_SIGNAL ${signal}`);
}
