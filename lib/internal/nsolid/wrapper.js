'use strict';

const {
  ArrayIsArray,
  JSONParse,
  JSONStringify,
  ObjectCreate,
  ObjectDefineProperty,
  ObjectGetOwnPropertyDescriptor,
  ObjectGetOwnPropertyDescriptors,
  ObjectGetOwnPropertySymbols,
  ObjectGetPrototypeOf,
  ReflectOwnKeys,
  StringPrototypeReplaceAll,
} = primordials;

const { readFileSync } = require('fs');
const { Writable } = require('stream');
const debug = require('internal/util/debuglog').debuglog('nsolid');
const debugLog = require('internal/util/debuglog').debuglog('nsolid-log');
const binding = internalBinding('nsolid_api');
const watched = [];

module.exports = {
  moduleLoaded,
  wrapModule,
  writeLog,
  pinoLvlToOTel,
};


function writeLog(msg, sev) {
  debugLog('log msg: "%s" sev: %s', msg, sev);
  binding.writeLog(typeof msg === 'string' ? msg : JSONStringify(msg), sev);
}

// Called for every loaded module. Detect if a module that we're tracking has
// been loaded and pass that on to the tracking callback.
function moduleLoaded(filename, mod) {
  const normalizedFilename = StringPrototypeReplaceAll(filename, '\\', '/');
  for (const f of watched) {
    if (!normalizedFilename.endsWith('node_modules/' + f.name + '/' + f.path))
      continue;
    const pjson_name = normalizedFilename.slice(0, -f.path.length) + '/package.json';
    const file = readFileSync(pjson_name).toString();
    let j;
    try {
      j = JSONParse(file);
    } catch {
      continue;
    }
    if (testVersion(j.version, f.version)) {
      debug('[moduleLoaded] wrapping module %s:%s', filename, j.version);
      f.callback(mod);
    }
  }
}

// name - name of the module (e.g. 'winston').
// path - path of the file that contains the export needed.
// version - version(s) that are supported. Simple checks are supported.
// callback - pass the Module instance is passed to if the name and path match.
function wrapModule(name, path, version, callback) {
  watched.push({
    name,
    path,
    version,
    callback,
  });
}


/* Wrapped modules */

function winstonLvlToOTel(lvl) {
  switch (lvl.toLowerCase()) {
    case 'silly':
      return { level: 1, name: 'TRACE' };
    case 'debug':
    case 'verbose':
      return { level: 5, name: 'DEBUG' };
    case 'http':
    case 'info':
      return { level: 9, name: 'INFO' };
    case 'warn':
      return { level: 13, name: 'WARN' };
    case 'error':
      return { level: 17, name: 'ERROR' };
    case 'fatal':
      return { level: 21, name: 'FATAL' };
    default:
      // TODO(trevnorris): Handle unknowns better.
      return { level: 9, name: 'INFO' };
  }
}


const WINSTON_MESSAGE = Symbol.for('message');

class NSolidWinstonTransport extends Writable {
  constructor() {
    super({ objectMode: true });
  }
  
  log(info, callback) {
    // Winston formatters often write the finalized string to Symbol.for('message')
    const msg = info[WINSTON_MESSAGE] || info.message;
    writeLog(msg, winstonLvlToOTel(info.level).level);
    if (callback) callback();
  }
  
  _write(info, encoding, callback) {
    this.log(info, callback);
  }
}

wrapModule('winston', 'lib/winston/create-logger.js', '>=3.x', (mod) => {
  const oldCreateLogger = mod.exports;
  mod.exports = function createLogger() {
    const logger = oldCreateLogger.apply(this, arguments);
    try {
      logger.add(new NSolidWinstonTransport());
    } catch (e) {
      debugLog('Failed to attach NSolidWinstonTransport: %s', e.message);
    }
    return logger;
  };
  copyProperties(oldCreateLogger, mod.exports);
});


function pinoLvlToOTel(lvl) {
  if (lvl >= 0 && lvl <= 10)
    return { level: 1, name: 'TRACE' };
  if (lvl >= 11 && lvl <= 20)
    return { level: 5, name: 'DEBUG' };
  if (lvl >= 21 && lvl <= 30)
    return { level: 9, name: 'INFO' };
  if (lvl >= 31 && lvl <= 40)
    return { level: 13, name: 'WARN' };
  if (lvl >= 41 && lvl <= 50)
    return { level: 17, name: 'ERROR' };
  if (lvl >= 51 && lvl <= 60)
    return { level: 21, name: 'FATAL' };
  // TODO(trevnorris): Handle unknowns better.
  return { level: 9, name: 'INFO' };
}




/* For shimming */

// Convert range to numberic offset that can be compared.
function convertVersion(version) {
  let parts = version.split('-')[0].split('+')[0].split('.');

  // Check that this doesn't contain wildcards.
  if (parts.every((p) => Number.isInteger(+p))) {
    return ((+parts[0]) * 2**32) + ((+parts[1]) * 2**16) + (+parts[2]);
  }

  // Now construst the upper and lower limits of the version from the wildcards.
  let lower = 0;
  let upper = 0;
  if (parts[0] === 'x' || parts[0] === '*') {
    upper += 0xffff00000000;
  } else if (Number.isInteger(+parts[0])) {
    lower += (+parts[0]) * 2**32;
    upper += (+parts[0]) * 2**32;
  } else {
    return null;
  }
  if (parts[1] === 'x' || parts[1] === '*' || parts.length === 1) {
    upper += 0xffff0000;
  } else if (Number.isInteger(+parts[1])) {
    lower += (+parts[1]) * 2**16;
    upper += (+parts[1]) * 2**16;
  } else {
    return null;
  }
  if (parts[2] === 'x' || parts[2] === '*' || parts.length === 2) {
    upper += 0xffff;
  } else if (Number.isInteger(+parts[2])) {
    lower += (+parts[2]);
    upper += (+parts[2]);
  } else {
    return null;
  }

  return [lower, upper];
}

// A simple semver tester. Don't care about the complicated cases.
function testVersion(version, range) {
  const operatorMatch = range.match(/(>=|<=|>|<|=)?(.*)/);
  const operator = operatorMatch[1] || '=';
  const cleanRange = operatorMatch[2].trim();
  const parsedVersion = convertVersion(version);
  let parsedRange = convertVersion(cleanRange);

  if (parsedVersion === null || parsedRange === null) {
    return null;
  }
  if (!ArrayIsArray(parsedRange)) {
    parsedRange = [parsedRange, parsedRange];
  }

  if (operator === '>=') {
    return parsedVersion >= parsedRange[0];
  }
  if (operator === '<=') {
    return parsedVersion <= parsedRange[1];
  }
  if (operator === '<') {
    return parsedVersion < parsedRange[0] && parsedVersion < parsedRange[1];
  }
  if (operator === '>') {
    return parsedVersion > parsedRange[0] && parsedVersion > parsedRange[1];
  }
  if (operator === '=') {
    return parsedVersion >= parsedRange[0] && parsedVersion <= parsedRange[1];
  }
}


function copyProperties(original, wrapped) {
  Object.setPrototypeOf(wrapped, original);
  const props = ObjectGetOwnPropertyDescriptors(original);
  const keys = ReflectOwnKeys(props);
  for (const key of keys) {
    try { ObjectDefineProperty(wrapped, key, props[key]); } catch { }
  }
}


function wrapMethod(target, name, wrapper) {
  const original = target[name];
  const wrapped = wrapper(original);
  const descriptor = ObjectGetOwnPropertyDescriptor(target, name);
  const attributes = {
    configurable: true,
    ...descriptor,
  };
  copyProperties(original, wrapped);
  if (descriptor) {
    if (descriptor.get || descriptor.set) {
      attributes.get = () => wrapped;
    } else {
      attributes.value = wrapped;
    }
    if (descriptor.configurable === false) {
      return ObjectCreate(target, {
        [name]: attributes,
      })
    }
  } else { // no descriptor means original was on the prototype
    attributes.value = wrapped;
    attributes.writable = true;
  }
  ObjectDefineProperty(target, name, attributes);
  return target;
}
