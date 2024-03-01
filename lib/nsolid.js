'use strict';

/** @module nsolid */

const binding = internalBinding('nsolid_api');
const { internalModuleReadJSON } = internalBinding('fs');
const { getCPUs, getHostname, getTotalMem } = internalBinding('os');
const { cwd } = internalBinding('process_methods');
const { isMainThread } = internalBinding('worker');
const { isNativeError } = internalBinding('types');
const { ARGV, processTitle } = require('internal/nsolid_loader');
const { register, registerInstrumentations } = require('internal/otel/core');
const { addPackage, updatePackage, packageList, packagePaths } =
  require('internal/nsolid_module');
const { existsSync, readdirSync, realpathSync } = require('fs');
const { dirname, relative, resolve, sep, toNamespacedPath } = require('path');
const { Readable } = require('stream');
const {
  validateBoolean,
  validateNumber,
} = require('internal/validators');

const {
  ArrayIsArray,
  Date,
  DateNow,
  JSONParse,
  JSONStringify,
  ObjectAssign,
  ObjectDefineProperty,
  ObjectGetOwnPropertyNames,
  ObjectPrototype,
  NumberParseInt,
} = primordials;
const { Buffer } = require('buffer');
const debug = require('internal/util/debuglog').debuglog('nsolid');
const statsd = require('internal/agents/statsd/lib/nsolid');
const zmq = require('internal/agents/zmq/lib/nsolid');
const {
  codes: {
    ERR_NSOLID_HEAP_PROFILE_START,
    ERR_INVALID_ARG_TYPE,
  },
} = require('internal/errors');


const {
  clearFatalError,
  nsolid_consts,
  nsolid_counts,
} = binding;

const DEFAULT_HOSTNAME = getHostname();
const DEFAULT_APPNAME = 'untitled application';
const DEFAULT_INTERVAL = 3000;
const DEFAULT_BLOCKED_LOOP_THRESHOLD = 200;
const DEFAULT_PUBKEY = '^kvy<i^qI<r{=ZDrfK4K<#NtqY+zaH:ksm/YGE6I';
const OBJECT_PROTO_NAMES = ObjectGetOwnPropertyNames(ObjectPrototype);
const OTLP_TYPES = [ 'datadog', 'dynatrace', 'newrelic', 'otlp' ];
const PROCESS_START = +new Date(DateNow() - (process.uptime() * 1000));
const SUPPORTED_TRACING_MODULES = {
  dns: nsolid_consts.kSpanDns,
  http: nsolid_consts.kSpanHttpClient | nsolid_consts.kSpanHttpServer,
};

let pkg_list_gend = false;
let pause_metrics = false;
let config_version = binding.getConfigVersion();
let config_cache = null;
// Immediately load the package.json and initialize a config object so calls to
// the JS API know what to do before start() runs. The initConfig object will
// no longer be used after start() runs.
const pkgConfig = loadMainPackageJson();
let initConfig = initializeConfig({});

const id = binding.agentId();

// Sometimes backwards compatibility makes me hate the world.
ObjectAssign(start, {
  // How horrible is this?
  start,
  /**
   * The time the process started in milliseconds.
   * @alias module:nsolid.processStart
   */
  processStart: +new Date(DateNow() - (process.uptime() * 1000)),
  metrics,
  packages,
  info,
  startupTimes,
  pauseMetrics,
  resumeMetrics,

  /**
   * @type {Zmq}
   * @alias module:nsolid.zmq
   */
  zmq: { status: zmq.status },
  /**
   * @type {string}
   * @description Unique identifier of the NSolid agent.
   * @alias module:nsolid.id
   */
  id,
  saveFatalError,
  clearFatalError,
  snapshot: zmq.snapshot,

  /**
   * @type {StatsD}
   * @alias module:nsolid.statsd
   */
  statsd: {
    status: statsd.status,
    udpIp: statsd.udpIp,
    tcpIp: statsd.tcpIp,
    sendRaw: statsd.sendRaw,
    counter: statsd.counter,
    gauge: statsd.gauge,
    set: statsd.set,
    timing: statsd.timing,
    format: statsd.format,
  },
  heapProfileStream,
  heapProfile: zmq.heapProfile,
  heapProfileEnd: zmq.heapProfileEnd,
  profile: zmq.profile,
  profileEnd: zmq.profileEnd,
  on,
  getThreadName,
  setThreadName,
  otel: {
    register,
    registerInstrumentations,
  },
});

const assignObj = assignGetters(start, {
  /**
   * @member {NSolidConfig} config
   * @description current configuration of the agent.
   * @static
   */
  config: () => ObjectAssign({}, getConfig()),
  /**
   * @member {string} app
   * @description application name.
   * @static
   */
  app: () => getConfig('app') || DEFAULT_APPNAME,
  /**
   * @member {string} appName
   * @description application name.
   * @static
   */
  appName: () => getConfig('app') || DEFAULT_APPNAME,
  /**
   * @member {string} appVersion
   * @description application version.
   * @static
   */
  appVersion: () => getConfig('appVersion'),
  /**
   * @member {string[]} tags
   * @description the list of tags associated with your instance,
   * which can be used to identify and filter instances in Console views.
   * @static
   */
  tags: () =>
    (ArrayIsArray(getConfig('tags')) ? getConfig('tags').slice() : []),
  /**
   * @member {boolean} metricsPaused
   * @description whether the agent is currently retrieving metrics or not.
   * @static
   */
  metricsPaused: () => getConfig('pauseMetrics') || false,
});

// If the return value is undefined then there was an issue. Return early.
if (assignObj === undefined) {
  module.exports.start = function start() { };
  return;
}

// Use defineProperty to make them not enumerable.
ObjectDefineProperty(start, 'toJSON', { __proto__: null, value: stringifyStart });
ObjectDefineProperty(start, '_getOnBlockedBody', {
  __proto__: null,
  value: () => JSONParse(binding._getOnBlockedBody()),
});

/**
 * @member {TraceStats} traceStats
 * @static
 */
start.traceStats = assignGetters({}, {
  httpClientCount: () => nsolid_counts[nsolid_consts.kHttpClientCount],
  httpServerCount: () => nsolid_counts[nsolid_consts.kHttpServerCount],
  dnsCount: () => nsolid_counts[nsolid_consts.kDnsCount],
  httpClientAbortCount: () =>
    nsolid_counts[nsolid_consts.kHttpClientAbortCount],
  httpServerAbortCount: () =>
    nsolid_counts[nsolid_consts.kHttpServerAbortCount],
});


module.exports = start;


function stringifyStart() {
  const ret = {};
  ObjectGetOwnPropertyNames(this).forEach((e) => {
    if (e === 'length' || e === 'name' || e === 'prototype' || e === 'start')
      return;
    ret[e] = this[e];
  });
  return ret;
}


// Allow regenerating the info object as the `config` object could've changed
// some of the relevant info.
function genInfoObject(regen = false) {
  let infoObj = null;
  if (!regen) {
    infoObj = binding.getProcessInfo();
  }
  if (infoObj !== null)
    return infoObj;

  const cpuData = getCPUs();
  const nsolidConfig = getConfig();
  infoObj = {
    id,
    app: nsolidConfig.app,
    appVersion: nsolidConfig.appVersion,
    tags: nsolidConfig.tags,
    pid: process.pid,
    processStart: PROCESS_START,
    nodeEnv: nsolidConfig.env,
    execPath: process.execPath,
    main: ARGV[1] ? resolve(ARGV[1]) : '',
    arch: process.arch,
    platform: process.platform,
    hostname: getNsolidHostname(),
    totalMem: getTotalMem(),
    versions: process.versions,
    // The os internal binding returns a large array of values. Each group
    // of 7 contains all the data for a single CPU. See the cpus() fn in
    // lib/os.js for reference.
    cpuCores: ArrayIsArray(cpuData) ? cpuData.length / 7 : null,
    cpuModel: ArrayIsArray(cpuData) ? cpuData[0] : null,
  };

  // In IISNODE environment, the processes are launched in the following way:
  // $ nsolid interceptor.js server.js ...args
  // where interceptor.js is a MITM script from iisnode and server.js is the
  // main script. Then interceptor.js removes itself from process.argv.
  // In this case we want to resolve ARGV[2]
  if (nsolidConfig.iisNode) {
    infoObj.iisNodeMain = ARGV[2] ? resolve(ARGV[2]) : '';
  }

  binding.storeProcessInfo(JSONStringify(infoObj));
  return infoObj;
}

// eslint-disable-next-line jsdoc/require-returns-check
/**
 * It returns relevant information about the running process and platform is
 * running on.
 * @param {InfoCallback} cb if a callback is passed, it is used to
 * return the info asynchronously
 * @example
 * const nsolid = require('nsolid');
 * nsolid.info((err, info) => {
 *   if(!err)
 *     console.log('Info', info);
 * });
 * @returns {(Info|undefined)} the actual info if no callback,
 * undefined otherwise.
 * @alias module:nsolid.info
 */
function info(cb) {
  const o = genInfoObject();
  if (typeof cb !== 'function')
    return o;
  process.nextTick(() => cb(null, o));
}

// eslint-disable-next-line jsdoc/require-returns-check
/**
 * It retrieves a list of enviroment and process metrics.
 * @param {MetricsCallback} cb if a callback is passed, it is used
 * to return the metrics asynchronously
 * @example
 * nsolid.metrics((err, metrics) => {
 *   if(!err)
 *     console.log('Metrics', metrics);
 * });
 * @returns {(Metrics|undefined)} the actual metrics if no
 * callback, undefined otherwise.
 * @alias module:nsolid.metrics
 */
function metrics(cb) {
  const envm = JSONParse(binding.getEnvMetrics());
  const procm = JSONParse(binding.getProcessMetrics());
  const m = ObjectAssign({}, envm, procm);
  if (typeof cb !== 'function')
    return m;
  process.nextTick(() => cb(null, m));
}


/**
 * It retrieves the list of packages used by the process.
 * @param {PackagesCallback} cb if a callback is passed, it is
 * used to return the packages asynchronously
 * @example
 * const nsolid = require('nsolid');
 * nsolid.packages((err, packages) => {
 *   if(!err)
 *     console.log('Packages', packages);
 * });
 * @returns {Package[]|undefined} the actual packages if no
 * callback, undefined otherwise.
 * @alias module:nsolid.packages
 */
function packages(cb) {
  if (!getConfig('disablePackageScan'))
    genPackageList();
  // Make a copy. Would be helpful if this was a deep copy, but eh.
  const a = packageList.slice();
  if (typeof cb !== 'function')
    return a;
  process.nextTick(() => cb(null, a));
}


/**
 * Starts a heap profile in a specific JS thread and returns a readable stream
 * of the profile data.
 * @param {number} threadId - The ID of the thread for which to start the heap profile.
 * @param {number} duration - The duration in milliseconds for which to run the heap profile.
 * @param {boolean} trackAllocations - Whether to track allocations during the heap profile.
 * @example
 * const nsolid = require('nsolid');
 * const threadId = 1;
 * const duration = 5000; // 5 seconds
 * const trackAllocations = true;
 * const heapProfileStream = nsolid.heapProfileStream(threadId, duration, trackAllocations);
 * heapProfileStream.on('data', (data) => {
 *   console.log('Heap Profile Data:', data);
 * });
 * heapProfileStream.on('error', (err) => {
 *   console.error('Error:', err);
 * });
 * @returns {Readable} A readable stream of the heap profile data. It emits an
 * {ERR_NSOLID_HEAP_PROFILE_START} If there is an error starting the heap profile.
 * @alias module:nsolid.heapProfileStream
 */
function heapProfileStream(threadId, duration, trackAllocations) {
  validateNumber(threadId, 'threadId');
  validateNumber(duration, 'duration');
  validateBoolean(trackAllocations, 'trackAllocations');
  const redacted = getConfig('redactSnapshots') || false;
  const readable = new Readable({
    read() {
    },
    destroy(err, cb) {
      binding.heapProfileEnd(threadId);
      if (typeof cb === 'function')
        cb(err);
    },
  });

  const ret = binding.heapProfile(threadId, duration, trackAllocations, redacted, (status, data) => {
    if (status !== 0) {
      const err = new ERR_NSOLID_HEAP_PROFILE_START();
      err.code = status;
      readable.destroy(err);
    } else if (data === null) {
      readable.push(null);
    } else {
      readable.push(data);
    }
  });

  if (ret !== 0) {
    const err = new ERR_NSOLID_HEAP_PROFILE_START();
    err.code = ret;
    readable.destroy(err);
  }

  return readable;
}


/**
 * It retrieves the startup times of the process.
 * @param {StartupTimesCallback} cb if a callback is passed, it is
 * used to return the startup times asynchronously
 * @example
 * nsolid.startupTimes((err, startupTimes) => {
 *   if(!err)
 *     console.log(startupTimes);
 * });
 * @returns {StartupTimes|undefined} the actual startup times if
 * no callback, undefined otherwise.
 * @alias module:nsolid.startupTimes
 */
function startupTimes(cb) {
  const data = JSONParse(binding.getStartupTimes());
  if (typeof cb !== 'function')
    return data;
  process.nextTick(() => cb(null, data));
}


/**
 * It pauses the process metrics collection. It works only if called from the
 * main thread.
 * @alias module:nsolid.pauseMetrics
 */
function pauseMetrics() {
  if (!isMainThread)
    return;
  if (pause_metrics)
    return;

  pause_metrics = true;

  // Update the config only if it's already been generated.
  if (binding.getConfigVersion() !== 0)
    binding.pauseMetrics();
}


/**
 * It resumes the process metrics collection. It works only if called from the
 * main thread.
 * @alias module:nsolid.resumeMetrics
 */
function resumeMetrics() {
  if (!isMainThread)
    return;
  if (!pause_metrics)
    return;

  pause_metrics = false;

  // Update the config only if it's already been generated.
  if (binding.getConfigVersion() !== 0)
    binding.resumeMetrics();
}


// eslint-disable-next-line jsdoc/require-returns-check
/**
 * Starts the agent with a specific configuration. If the agent was already
 * started it updates its configuration.
 * @param {NSolidConfig} config
 * @returns {module:nsolid} the NSolid object.
 * @throws exception if the configuration is bogus.
 * @alias module:nsolid.start
 */
function start(config/* , agentCb */) {
  if (!isMainThread)
    return;

  updateConfig(config);
  const nsolidConfig = getConfig();
  genInfoObject(true);
  if (nsolidConfig.command) {
    debug('starting zmq');
    debug({
      zmq_command_remote: nsolidConfig.command,
      zmq_data_remote: nsolidConfig.data,
      zmq_bulk_remote: nsolidConfig.bulk,
      storage_pubkey: nsolidConfig.pubkey,
      disableIpv6: nsolidConfig.disableIpv6,
    });
    zmq.start();
  }
  if (!nsolidConfig.disablePackageScan)
    genPackageList();

  debug('starting agent name: %s id: %s tags: %s',
        nsolidConfig.app,
        nsolidConfig.id,
        nsolidConfig.tags);

  return start;
}


/* These can be set by environment as well as the config object.
 * It is possible for this environment to be present, even if it
 * was not at process start, such is the case with pm2 in cluster
 * mode
 *
 * Config order:
 *  1. configuration object (js API)
 *  2. environment variables
 *  3. package.json
 *  4. (key specific, e.g. app) */
function updateConfig(config = {}) {
  const nsolidConfig = {};

  // If getConfigVersion() === 0 then binding.updateConfig() hasn't run yet. So
  // initialize the object and pass it to the native side.
  if (binding.getConfigVersion() === 0) {
    initializeConfig(nsolidConfig);
  }

  for (const key in config) {
    // Don't assign names that are part of the default constructor.
    if (OBJECT_PROTO_NAMES.includes(key))
      continue;

    // Assigning tags needs a function call.
    if (key === 'tags') {
      nsolidConfig.tags = getTags(config.tags);
    // These two had a special condition in v3.x so treating it the same.
    } else if (key === 'pubkey' || key === 'disableIpv6') {
      if (config[key] != null)
        nsolidConfig[key] = config[key];
    // TODO(santi): Implement validation for every property
    } else if ([ 'command', 'data', 'bulk', 'statsd' ].includes(key)) {
      let value = config[key];
      if (value) {
        // Make sure some hostname is always provided if only port was passed.
        if (typeof value === 'number')
          value = 'localhost:' + value;

        if (typeof value !== 'string')
          throw new ERR_INVALID_ARG_TYPE(`config.${key}`, 'string', value);

        nsolidConfig[key] = value;
        if (key === 'command') {
          nsolidConfig.saas = undefined;
        }
      } else if (key === 'statsd') {
        // The statsd variable can now be set to null to stop the statsd agent.
        nsolidConfig[key] = value;
      }
    } else if (key === 'saas' && !config.command) {
      nsolidConfig.saas = config.saas;
      nsolidConfig.command = parseSaasEnvVar(nsolidConfig.saas, 0);
    } else if (key === 'otlp') {
      const otlp = parseOTLPType(config.otlp);
      if (otlp !== nsolidConfig.otlp) {
        nsolidConfig.otlp = otlp;
        nsolidConfig.otlpConfig = null;
      }
    } else if (key === 'otlpConfig' && nsolidConfig.otlp) {
      nsolidConfig.otlpConfig = parseOTLPConfig(config.otlpConfig,
                                                nsolidConfig.otlp);
    } else {
      nsolidConfig[key] = config[key];
    }
  }

  if (nsolidConfig.otlpConfig === null) {
    nsolidConfig.otlp = null;
  }

  binding.updateConfig(JSONStringify(nsolidConfig));

  // Now that the config has been set on the native side, can remove the
  // initConfig object so it doesn't waste memory.
  initConfig = null;

  if (typeof nsolidConfig.interval === 'number') {
    binding.setMetricsInterval(nsolidConfig.interval);
  }

  if (typeof nsolidConfig.pubkey === 'string' &&
      nsolidConfig.pubkey.length !== 40) {
    debug('[updateConfig] invalid pubkey; must be 40 bytes');
  }
}


function initializeConfig(nsolidConfig) {
  nsolidConfig.pauseMetrics = pause_metrics;

  // ZMQ "COMMAND" socket
  nsolidConfig.command =
    process.env.NSOLID_COMMAND_REMOTE ||
    process.env.NSOLID_COMMAND ||
    pkgConfig.nsolid.command;

  // ZMQ "DATA" socket
  nsolidConfig.data =
    process.env.NSOLID_DATA_REMOTE ||
    process.env.NSOLID_DATA ||
    pkgConfig.nsolid.data;

  // ZMQ "BULK" socket
  nsolidConfig.bulk =
    process.env.NSOLID_BULK_REMOTE ||
    process.env.NSOLID_BULK ||
    pkgConfig.nsolid.bulk;

  // Storage ZMQ curve encryption public key
  nsolidConfig.pubkey =
    process.env.NSOLID_STORAGE_PUBKEY ||
    process.env.NSOLID_PUBKEY ||
    pkgConfig.nsolid.pubkey ||
    DEFAULT_PUBKEY;

  // Only set saas if command wasn't already set
  if (!nsolidConfig.command) {
    nsolidConfig.saas =
      process.env.NSOLID_SAAS ||
      pkgConfig.nsolid.saas;
    if (nsolidConfig.saas) {
      nsolidConfig.command = parseSaasEnvVar(nsolidConfig.saas, 0);
    }
  }

  // Some kernels will not work if ipv6 is even attempted so allow an out
  nsolidConfig.disableIpv6 =
    envToBool(process.env.NSOLID_DISABLE_IPV6) ||
    pkgConfig.nsolid.disableIpv6;

  // StatsD daemon address
  nsolidConfig.statsd =
    process.env.NSOLID_STATSD ||
    pkgConfig.nsolid.statsd;

  // StatsD bucket prefix format string
  nsolidConfig.statsdBucket =
    process.env.NSOLID_STATSD_BUCKET ||
    pkgConfig.nsolid.statsdBucket ||
    // eslint-disable-next-line no-template-curly-in-string
    'nsolid.${env}.${app}.${hostname}.${shortId}';

  // StatsD tags extension format string
  nsolidConfig.statsdTags =
    process.env.NSOLID_STATSD_TAGS ||
    pkgConfig.nsolid.statsdTags;

  // Hostname override
  nsolidConfig.hostname =
    process.env.NSOLID_HOSTNAME ||
    pkgConfig.nsolid.hostname ||
    DEFAULT_HOSTNAME;

  // Environment
  nsolidConfig.env =
    process.env.NODE_ENV ||
    pkgConfig.nsolid.env ||
    'prod';

  // Metrics send interval
  nsolidConfig.interval =
    +process.env.NSOLID_INTERVAL ||
    pkgConfig.nsolid.interval ||
    DEFAULT_INTERVAL;

  nsolidConfig.tags = getTags(process.env.NSOLID_TAGS || pkgConfig.nsolid.tags);

  nsolidConfig.app =
    process.env.NSOLID_APPNAME ||
    process.env.NSOLID_APP ||
    pkgConfig.nsolid.app ||
    pkgConfig.name ||
    (processTitle !== process.title && process.title) ||
    DEFAULT_APPNAME;

  nsolidConfig.blockedLoopThreshold =
    +process.env.NSOLID_BLOCKED_LOOP_THRESHOLD ||
    +pkgConfig.nsolid.blockedLoopThreshold ||
    DEFAULT_BLOCKED_LOOP_THRESHOLD;

  // Application version
  nsolidConfig.appVersion = pkgConfig.version;

  // Allow snapshots to be disabled. This cannot be overridden to false, so if
  // any of these are true it remains on.
  nsolidConfig.disableSnapshots =
    envToBool(process.env.NSOLID_DISABLE_SNAPSHOTS) ||
    pkgConfig.nsolid.disableSnapshots;

  // Allow snapshots to be redacted. This cannot be overridden to false, so if
  // any of these are true it remains on.
  nsolidConfig.redactSnapshots =
    envToBool(process.env.NSOLID_REDACT_SNAPSHOTS) ||
    pkgConfig.nsolid.redactSnapshots;

  // Tracing enabled
  nsolidConfig.tracingEnabled =
    envToBool(process.env.NSOLID_TRACING_ENABLED) ||
    !!pkgConfig.nsolid.tracingEnabled;

  // Disable auto-instrumented modules
  nsolidConfig.tracingModulesBlacklist =
    parseTracingModulesList(process.env.NSOLID_TRACING_MODULES_BLACKLIST ||
                            pkgConfig.nsolid.tracingModulesBlacklist);

  // Promise Tracking
  nsolidConfig.promiseTracking =
    envToBool(process.env.NSOLID_PROMISE_TRACKING) ||
    !!pkgConfig.nsolid.promiseTracking;

  // IISNODE
  nsolidConfig.iisNode =
    envToBool(process.env.NSOLID_IISNODE) ||
    !!pkgConfig.nsolid.iisNode;

  // OTLP Agent configuration
  nsolidConfig.otlp =
    parseOTLPType(process.env.NSOLID_OTLP || pkgConfig.nsolid.otlp);

  // Prevent scanning for modules on start() or call to packages()
  nsolidConfig.disablePackageScan =
    envToBool(process.env.NSOLID_DISABLE_PACKAGE_SCAN) ||
    !!pkgConfig.nsolid.disablePackageScan;

  // Track packages in the require('module').globalPaths.
  nsolidConfig.trackGlobalPackages =
    envToBool(process.env.NSOLID_TRACK_GLOBAL_PACKAGES) ||
    !!pkgConfig.nsolid.trackGlobalPackages;

  if (nsolidConfig.otlp) {
    nsolidConfig.otlpConfig =
      parseOTLPConfig(process.env.NSOLID_OTLP_CONFIG ||
                      pkgConfig.nsolid.otlpConfig,
                      nsolidConfig.otlp);
    if (!nsolidConfig.otlpConfig) {
      nsolidConfig.otlp = null;
    }
  }

  // Make sure some hostname is always provided.
  if (nsolidConfig.command && +nsolidConfig.command)
    nsolidConfig.command = 'localhost:' + nsolidConfig.command;
  if (nsolidConfig.data && +nsolidConfig.data)
    nsolidConfig.data = 'localhost:' + nsolidConfig.data;
  if (nsolidConfig.bulk && +nsolidConfig.bulk)
    nsolidConfig.bulk = 'localhost:' + nsolidConfig.bulk;
  if (nsolidConfig.statsd && +nsolidConfig.statsd)
    nsolidConfig.statsd = 'localhost:' + nsolidConfig.statsd;

  return nsolidConfig;
}


function loadMainPackageJson() {
  const def = { nsolid: {} };
  let package_path = process.env.NSOLID_PACKAGE_JSON;
  let last_path;

  // If NSOLID_PACKAGE_JSON was specified then only look for the package.json
  // in that location. If it's not there then don't look further.
  if (typeof package_path === 'string') {
    return package_path === '' ? def : (readPackageJson(package_path) || def);
  }

  try {
    package_path = realpathSync(ARGV[1] ? dirname(ARGV[1]) : cwd());
  } catch {
    debug('[loadMainPackageJson] package_path error for path "%s"',
          package_path);
    // Hitting here probably means that cwd() isn't available. So just return
    // the default object.
    return def;
  }

  do {
    const rp = resolve(package_path, 'package.json');
    const json = readPackageJson(rp);
    if (json) {
      debug('[loadMainPackageJson] found package.json at path "%s"', rp);
      if (!json.nsolid)
        json.nsolid = {};
      return json;
    }
    last_path = package_path;
    package_path = resolve(package_path, '..');
  } while (last_path !== package_path);

  return def;
}

function getTags(str) {
  if (ArrayIsArray(str)) {
    str = str.join(',');
  }

  return (typeof str !== 'string') ? [] :
    checkTags(str.split(',').map((e) => e.trim()).sort().filter((e) => e));
}

function checkTags(tags) {
  if (tags.length > 20) {
    process._rawDebug(
      `A maximum of 20 tags are allowed but ${tags.length} were provided. ` +
      'Only using the first 20 tags');
    tags.slice(0, 20);
  }

  const violations = fixTags(tags);
  if (violations.length > 0) {
    process._rawDebug(
      'Tags must be between 2 to 140 bytes. The following are violations:\n  ' +
      violations.join('\n  '));
  }

  return tags;
}

function fixTags(tags) {
  const violations = [];
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    const buf = Buffer.from(t);
    if (buf.length < 2) {
      violations.push(t);
    } else if (buf.length > 140) {
      violations.push(t);
      // TODO(trevnorris): If the tag uses multibyte characters then this may
      // result in an invalid character.
      tags[i] = buf.slice(0, 140).toString();
    }
  }
  return violations;
}


function envToBool(str) {
  return str && str !== '0' && str !== 'false';
}


function genPackageList() {
  let main_path;
  let last_path;

  // If the initial package dependency list has been generated then no need
  // to run it again.
  if (pkg_list_gend)
    return;

  try {
    main_path = ARGV[1] ? dirname(ARGV[1]) : cwd();
  } catch {
    // Hitting here means that cwd() isn't available. So just return early.
    return;
  }

  // Set flag that the package list has been generated.
  pkg_list_gend = true;

  // Grab a list of the global node_module paths.
  let modulePaths = getConfig('trackGlobalPackages') ?
    require('module').globalPaths.slice() :
    [];

  // Add all possible node_module paths that can be required from main_path.
  do {
    last_path = main_path;
    modulePaths.push(resolve(main_path, 'node_modules'));
    main_path = resolve(main_path, '..');
  } while (last_path !== main_path);

  // Remove duplicates.
  modulePaths = modulePaths.filter((v, i, s) => s.indexOf(v) === i);

  // The complete list of locations where modules that can be required by
  // the running script has been created. Proceed to scan all those dirs,
  // and subdirs for modules that can be required directly or from a
  // dependency.
  // Using a for loop this way because there are tests that delete the Array
  // iterator and cause this to crash.
  for (let i = 0; i < modulePaths.length; i++) {
    scanForModules(modulePaths[i]);
  }
}


function scanForModules(mod_dir, in_scoped) {
  let contents;

  try {
    contents = readdirSync(mod_dir, { withFileTypes: true })
        // Only need directories.
        .filter((e) => e.isDirectory())
        // Don't need hidden directories.
        .filter((e) => e.name[0] !== '.');
  } catch {
    // nothing to do
    return;
  }

  // Return if there's nothing to check
  if (contents.length === 0)
    return;

  // Check for package.json in each folder. Use this type of for loop in case
  // the Array iterator has been deleted.
  for (let i = 0; i < contents.length; i++) {
    const e = contents[i];
    // If this is a scoped package then scan into the directory.
    if (!in_scoped && e.name[0] === '@') {
      scanForModules(resolve(mod_dir, e.name), true);
      continue;
    }
    const p_path = resolve(mod_dir, e.name, 'package.json');
    const json = readPackageJson(p_path);
    if (!json)
      continue;
    debug('[scanForModules] package.json found at "%s"', p_path);
    recurseCollect(addPackage(resolve(mod_dir, e.name), json));
  }
}


// Hypothetically this could cause a function recurse crash, but I don't think
// there's an operating system that would allow enough child directories to
// make that happen.
function recurseCollect(info) {
  const pkgInfo = getPackageJson(info);
  if (!pkgInfo)
    return;
  for (const e of pkgInfo) {
    recurseCollect(e);
  }
}


function getPackageJson(info) {
  // Creating a separate list of read packages that recurseCollect will use to
  // read further dependencies.
  const list = [];
  const deps = info.dependencies;
  for (let i = 0; i < deps.length; i++) {
    /* eslint-disable node-core/no-array-destructuring */
    const [json, path] = findModule(info.path, deps[i]);
    /* eslint-enable node-core/no-array-destructuring */
    if (!json || !path)
      continue;
    // Update the dependency to a path relative to info.path, which can be used
    // to recreate the dependency tree.
    deps[i] = relative(info.path, path);
    list.push(addPackage(path, json));
  }
  updatePackage(info);
  return list.length ? list : null;
}


// Transverse up the directory chain either until the module is found or until
// the root directory is reached.
// path is the starting directory to search in (minus node_modules)
// name is the name of the module we're looking for.
function findModule(path, name) {
  let current = null;
  let json = null;
  let last_path;

  do {
    path = getModulePath(path, name);
    if (!path)
      break;

    // If the package has already been parsed then there's no sense in parsing
    // it again.
    if (packagePaths[current] !== undefined)
      return [null, null];

    current = resolve(path, 'node_modules', name);
    json = readPackageJson(resolve(current, 'package.json'));
    if (json)
      return [json, current];
    last_path = path;
    path = resolve(path, '..');
  } while (last_path !== path);

  return [null, null];
}


// "path" is the current path to search. "name" is the name of the module being
// searched for. Will transverse up the directory structure until the module is
// found. If not found will return null.
function getModulePath(path, name) {
  let last_path;

  do {
    if (existsSync(resolve(path, 'node_modules')) &&
        existsSync(resolve(path, 'node_modules', name))) {
      // The realpath should propagate through all other path calls for the
      // given module.
      return realpathSync(path);
    }
    last_path = path;
    path = resolve(path, '..');
    const parts = path.split(sep);
    if (parts.length > 2 && parts[parts.length - 1] === 'node_modules') {
      last_path = path;
      path = resolve(path, '..');
    }
  } while (last_path !== path);

  return null;
}


function checkTracingModule(module) {
  return SUPPORTED_TRACING_MODULES[module] || 0;
}


function parseTracingModulesList(str) {
  if (typeof str === 'string') {
    str = str.split(',');
  } else if (!ArrayIsArray(str)) {
    return 0;
  }

  return str.reduce((acc, module) => {
    return acc + checkTracingModule(module.trim());
  }, 0);
}

/**
 * It removes the error stored by `saveFatalError`.
 * @example
 * process.on('uncaughtException', err => {
 *   nsolid.clearFatalError();
 *   nsolid.saveFatalError(err);
 *   shutdownApp(() => process.exit(1));
 * });
 * @function clearFatalError
 * @static
 */

/**
 * It stores a custom error to be used by the process before exiting. It only
 * works if the process' exit code is not zero and does not exit with an error
 * or exception.
 * @param {Error} err
 * @example
 * process.on('uncaughtException', err => {
 *   nsolid.saveFatalError(err);
 *   shutdownApp(() => process.exit(1));
 * });
 * @alias module:nsolid.saveFatalError
 */
function saveFatalError(err) {
  if (!(isNativeError(err)))
    return;
  return binding.saveFatalError(err);
}


/**
 * @function on
 * @description registers a custom command handler. Check out {@link
 * https://docs.nodesource.com/nsolid/4.0/docs#custom-commands|Custom Commands
 * } for a detailed description.
 * @param {string} commandName The string name of the command to implement
 * @param {CustomCommandHandler} handler The custom command function
 * implementing the command
 * @example
 * nsolid.on('my_command', (request) => {
 *   console.log('Value: ' + request.value);
 *   request.return({ ok: true });
 * });
 * @alias module:nsolid.on
 */
function on(commandName, handler) {
  return require('internal/nsolid_custom_commands').registerCommandCallback(
    commandName, handler);
}


/**
 * @function getThreadName
 * @description retrieves the name of the JS thread name, previously set with
 * setThreadName(), from which this method is called.
 * @example
 * nsolid.getThreadName();
 * @alias module:nsolid.getThreadName
 */
function getThreadName() {
  return binding.getThreadName();
}


/**
 * @function setThreadName
 * @description sets a name to the JS thread from which this method is called.
 * @param {string} name The name the thread is going to be set to.
 * @example
 * nsolid.setThreadName('my custom name');
 * @alias module:nsolid.setThreadName
 */
function setThreadName(name) {
  if (typeof name !== 'string')
    throw new ERR_INVALID_ARG_TYPE('name', 'string', name);

  return binding.setThreadName(name);
}


function readPackageJson(path) {
  let json;

  if (!path)
    return null;

  // If packagePaths[path] === null then the path was already read, but nothing
  // was there. So need to explicitly check if the path is undefined.
  if (packagePaths[path] !== undefined) {
    return packagePaths[path];
  }

  debug('[readPackageJson] reading path "%s"', path);
  try {
    // internalModuleReadJSON returns an array [pkg_str, p < pe ? true : false]
    const data = internalModuleReadJSON(toNamespacedPath(path))[0];
    // If there's no data then set that the path has been read but nothing was
    // there and return early.
    if (data === undefined)
      return packagePaths[path] = null;
    json = JSONParse(data);
  } catch {
    debug('[readPackageJson] JSONParse failure for path "%s"', path);
    return null;
  }
  // Technically this should be unreachable.
  if (!json)
    return null;
  if (!json.nsolid)
    json.nsolid = {};
  return json;
}


function assignGetters(target, obj) {
  try {
    for (const key in obj) {
      ObjectDefineProperty(target, key, {
        __proto__: null,
        get: obj[key],
        enumerable: true,
      });
    }
  } catch {
    return undefined;
  }
  return target;
}


function getNsolidHostname() {
  return getConfig('hostname') || DEFAULT_HOSTNAME;
}


function getConfig(key = null) {
  const current_version = binding.getConfigVersion();

  // In this case start() hasn't run yet, so only use the config info that's
  // available from JS.
  if (current_version === 0) {
    if (key === null) {
      const c = {};
      // Make a copy while filtering out all undefined/null properties.
      for (const k in initConfig) {
        // eslint-disable-next-line eqeqeq
        if (initConfig[k] != undefined)
          c[k] = initConfig[k];
      }
      return c;
    }
    return (initConfig && initConfig[key]) ? initConfig[key] : null;
  }

  if (current_version !== config_version) {
    config_cache = binding.getConfig();
    config_version = current_version;
  }
  if (key === null)
    return config_cache || {};
  return (config_cache && config_cache[key]) ? config_cache[key] : null;
}


function parseSaasEnvVar(token, offset = null) {
  try {
    const pubKey = token.slice(0, 40);
    const saasUrl = token.slice(40, token.length);
    /* eslint-disable node-core/no-array-destructuring */
    const [baseUrl, basePort] = saasUrl.split(':');
    /* eslint-enable node-core/no-array-destructuring */

    if (baseUrl == null || basePort == null || pubKey.length !== 40)
      return null;

    if (offset == null)
      return pubKey.replace(/,/g, '!');
    return `${baseUrl}:${NumberParseInt(basePort, 10) + offset}`;
  } catch {
    return null;
  }
}


function parseOTLPType(type) {
  return OTLP_TYPES.includes(type) ? type : null;
}


function parseOTLPConfig(command, type) {
  let config;
  if (typeof command === 'string') {
    try {
      config = JSONParse(command);
    } catch {
      return null;
    }

    command = config;
  } else if (typeof command !== 'object') {
    return null;
  }

  switch (type) {
    case 'datadog':
      return parseDatadogConfig(command);
    case 'dynatrace':
      return parseDynatraceConfig(command);
    case 'newrelic':
      return parseNewRelicConfig(command);
    case 'otlp':
      return parseOtlpConfig(command);
  }
}


function parseDatadogConfig(config) {
  if (typeof config.zone !== 'string') {
    return null;
  }

  if (!['eu', 'us'].includes(config.zone)) {
    return null;
  }

  if (typeof config.key !== 'string') {
    return null;
  }

  if (typeof config.url !== 'string') {
    return null;
  }

  return {
    zone: config.zone,
    key: config.key,
    url: config.url,
  };
}


function parseDynatraceConfig(config) {
  if (typeof config.site !== 'string') {
    return null;
  }

  if (typeof config.token !== 'string') {
    return null;
  }

  return {
    site: config.site,
    token: config.token,
  };
}


function parseNewRelicConfig(config) {
  if (typeof config.zone !== 'string') {
    return null;
  }

  if (!['eu', 'us'].includes(config.zone)) {
    return null;
  }

  if (typeof config.key !== 'string') {
    return null;
  }

  return {
    zone: config.zone,
    key: config.key,
  };
}


function parseOtlpConfig(config) {
  if (typeof config.url !== 'string') {
    return null;
  }

  return {
    url: config.url,
  };
}
