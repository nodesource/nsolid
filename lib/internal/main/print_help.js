'use strict';

const {
  ArrayPrototypeConcat,
  ArrayPrototypeSort,
  Boolean,
  MathFloor,
  MathMax,
  ObjectKeys,
  RegExp,
  RegExpPrototypeSymbolReplace,
  StringPrototypeLocaleCompare,
  StringPrototypeSlice,
  StringPrototypeTrimLeft,
  StringPrototypeRepeat,
  SafeMap,
} = primordials;

const { types } = internalBinding('options');
const hasCrypto = Boolean(process.versions.openssl);

const {
  prepareMainThreadExecution,
  markBootstrapComplete,
} = require('internal/process/pre_execution');

const typeLookup = [];
for (const key of ObjectKeys(types))
  typeLookup[types[key]] = key;

// Environment variables are parsed ad-hoc throughout the code base,
// so we gather the documentation here.
const { hasIntl, hasSmallICU, hasNodeOptions } = internalBinding('config');
// eslint-disable-next-line node-core/avoid-prototype-pollution
const envVars = new SafeMap(ArrayPrototypeConcat([
  ['FORCE_COLOR', { helpText: "when set to 'true', 1, 2, 3, or an empty " +
   'string causes NO_COLOR and NODE_DISABLE_COLORS to be ignored.' }],
  ['NO_COLOR', { helpText: 'Alias for NODE_DISABLE_COLORS' }],
  ['NODE_DEBUG', { helpText: "','-separated list of core modules that " +
    'should print debug information' }],
  ['NODE_DEBUG_NATIVE', { helpText: "','-separated list of C++ core debug " +
    'categories that should print debug output' }],
  ['NODE_DISABLE_COLORS', { helpText: 'set to 1 to disable colors in ' +
    'the REPL' }],
  ['NODE_EXTRA_CA_CERTS', { helpText: 'path to additional CA certificates ' +
    'file. Only read once during process startup.' }],
  ['NODE_NO_WARNINGS', { helpText: 'set to 1 to silence process warnings' }],
  ['NODE_PATH', { helpText: `'${require('path').delimiter}'-separated list ` +
    'of directories prefixed to the module search path' }],
  ['NODE_PENDING_DEPRECATION', { helpText: 'set to 1 to emit pending ' +
    'deprecation warnings' }],
  ['NODE_PENDING_PIPE_INSTANCES', { helpText: 'set the number of pending ' +
    'pipe instance handles on Windows' }],
  ['NODE_PRESERVE_SYMLINKS', { helpText: 'set to 1 to preserve symbolic ' +
    'links when resolving and caching modules' }],
  ['NODE_REDIRECT_WARNINGS', { helpText: 'write warnings to path instead ' +
    'of stderr' }],
  ['NODE_REPL_HISTORY', { helpText: 'path to the persistent REPL ' +
    'history file' }],
  ['NODE_REPL_EXTERNAL_MODULE', { helpText: 'path to a Node.js module ' +
    'which will be loaded in place of the built-in REPL' }],
  ['NODE_SKIP_PLATFORM_CHECK', { helpText: 'set to 1 to skip ' +
    'the check for a supported platform during Node.js startup' }],
  ['NODE_TLS_REJECT_UNAUTHORIZED', { helpText: 'set to 0 to disable TLS ' +
    'certificate validation' }],
  ['NODE_V8_COVERAGE', { helpText: 'directory to output v8 coverage JSON ' +
    'to' }],
  ['TZ', { helpText: 'specify the timezone configuration' }],
  ['UV_THREADPOOL_SIZE', { helpText: 'sets the number of threads used in ' +
    'libuv\'s threadpool' }],
], hasIntl ? [
  ['NODE_ICU_DATA', { helpText: 'data path for ICU (Intl object) data' +
    hasSmallICU ? '' : ' (will extend linked-in data)' }],
] : []), (hasNodeOptions ? [
  ['NODE_OPTIONS', { helpText: 'set CLI options in the environment via a ' +
    'space-separated list' }],
] : []), hasCrypto ? [
  ['OPENSSL_CONF', { helpText: 'load OpenSSL configuration from file' }],
  ['SSL_CERT_DIR', { helpText: 'sets OpenSSL\'s directory of trusted ' +
    'certificates when used in conjunction with --use-openssl-ca' }],
  ['SSL_CERT_FILE', { helpText: 'sets OpenSSL\'s trusted certificate file ' +
    'when used in conjunction with --use-openssl-ca' }],
] : []);

const nsolidEnvVars = new SafeMap([
  ['NSOLID_PACKAGE_JSON', {
    helpText: 'Provide the path of the package.json that contains NSolid ' +
      'configuration.',
  }],
  ['NSOLID_APP', {
    helpText: 'Set a name for this application in the NSolid Console',
  }],
  ['NSOLID_HOSTNAME', {
    helpText: 'Override the hostname reported by NSolid',
  }],
  ['NSOLID_TAGS', {
    helpText: 'Set the tags for this application in the NSolid Console',
  }],
  ['NSOLID_COMMAND', {
    helpText: 'Location of the NSolid Storage command port',
  }],
  ['NSOLID_DATA', {
    helpText: 'Location of the NSolid Storage data port',
  }],
  ['NSOLID_BULK', {
    helpText: 'Location of the NSolid Storage bulk port',
  }],
  ['NSOLID_PUBKEY', {
    helpText: '40 char hexidecimal CurveZMQ public key',
  }],
  ['NSOLID_SAAS', {
    helpText: 'The SaaS token acquired while signing up for a SaaS account',
  }],
  ['NSOLID_STATSD', {
    helpText: 'Location of a StatsD daemon',
  }],
  ['NSOLID_STATSD_BUCKET', {
    helpText: 'A format string for NSolid StatsD Bucket naming',
  }],
  ['NSOLID_STATSD_TAGS', {
    helpText: 'A format string for NSolid StatsD Tags extension',
  }],
  ['NSOLID_DISABLE_IPV6', {
    helpText: 'Disable IPv6 in case it\'s not supported by the host system.',
  }],
  ['NSOLID_DISABLE_SNAPSHOTS', {
    helpText: 'Force disable snapshots. Once set it cannot be reset',
  }],
  ['NSOLID_REDACT_SNAPSHOTS', {
    helpText: 'Redact all strings from snapshots.',
  }],
  ['NSOLID_INTERVAL', {
    helpText: 'How often (milliseconds) to report metrics',
  }],
  ['NSOLID_DELAY_INIT', {
    helpText: 'Delay initializing nsolid for duration (milliseconds) after ' +
      'the process starts',
  }],
  ['NSOLID_BLOCKED_LOOP_THRESHOLD', {
    helpText: 'Time in milliseconds the event loop is stuck on a single ' +
      'iteration before considered being blocked.',
  }],
  ['NSOLID_DISABLE_PACKAGE_SCAN', {
    helpText: 'Disable automatically scanning all directories for modules ' +
      'that can be required',
  }],
  ['NSOLID_TRACK_GLOBAL_PACKAGES', {
    helpText: 'Track packages listed in the globalPaths',
  }],
  ['NSOLID_IISNODE', {
    helpText: 'Specify whether the process is being run in an IIS environment',
  }],
  ['NSOLID_OTLP', {
    helpText: 'Define the type of OTLP endpoint',
  }],
  ['NSOLID_OTLP_CONFIG', {
    helpText: 'Specify the configuration for the OTLP endpoint defined in ' +
      'NSOLID_OTLP',
  }],
  ['NSOLID_TRACING_ENABLED', {
    helpText: 'Enable tracing generation. By default http and dns spans are ' +
      'automatically generated. They can be disabled by using ' +
      'NSOLID_TRACING_MODULES_BLACKLIST. This option can be enabled ' +
      'dynamically from the Console.',
  }],
  ['NSOLID_PROMISE_TRACKING', {
    helpText: 'Track Promises and report them to the Console. This can be ' +
      'enabled dynamically from the Console',
  }],
  ['NSOLID_TRACING_MODULES_BLACKLIST', {
    helpText: 'List of core instrumented modules you want to disable when ' +
      'tracing is enabled. This can be enabled dynamically from the Console',
  }],
  ['NSOLID_CHECK_TEST_METRICS', {
    helpText: 'When running tests check metrics at the end of every test',
  }],
  ['NODE_ENV', {
    helpText: 'An environment description',
  }],
]);

const otlpEnvVars = new SafeMap([
  ['OTEL_EXPORTER_OTLP_ENDPOINT', {
    helpText: 'Target URL to which the exporter is going to send spans and ' +
      'metrics. Defaults to "http://localhost:4317" for grcp and ' +
      'http://localhost:4318 for http',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_ENDPOINT but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_ENDPOINT but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_INSECURE', {
    helpText: 'Whether to enable client transport security for the ' +
      'exporter\'s gRPC connection. This option only applies to OTLP/gRPC ' +
      'when an endpoint is provided without the http or https scheme.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_INSECURE', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_INSECURE but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_INSECURE', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_INSECURE but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_CERTIFICATE', {
    helpText: 'The trusted certificate to use when verifying a server\'s TLS ' +
      'credentials. Should only be used for a secure connection.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_CERTIFICATE but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_CERTIFICATE', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_CERTIFICATE but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_CLIENT_KEY', {
    helpText: 'Clients private key to use in mTLS communication in PEM format.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_CLIENT_KEY but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_CLIENT_KEY', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_CLIENT_KEY but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE', {
    helpText: 'Client certificate/chain trust for clients private key to use ' +
      'in mTLS communication in PEM format.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_CLIENT_CERTIFICATE', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_HEADERS', {
    helpText: 'Key-value pairs to be used as headers associated with gRPC or ' +
      'HTTP requests.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_HEADERS', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_HEADERS but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_HEADERS', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_HEADERS but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_COMPRESSION', {
    helpText: 'Compression key for supported compression types. Supported ' +
      'compression: gzip.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_COMPRESSION', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_COMPRESSION but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_COMPRESSION', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_COMPRESSION but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_TIMEOUT', {
    helpText: 'Maximum time the OTLP exporter will wait for each batch export.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_TIMEOUT', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_TIMEOUT but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_TIMEOUT', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_TIMEOUT but for metrics.',
  }],
  ['OTEL_EXPORTER_OTLP_PROTOCOL', {
    helpText: 'The transport protocol. Options MUST be one of: grpc, ' +
      'http/protobuf, http/json. Default is http/protobuf.',
  }],
  ['OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_PROTOCOL but for traces.',
  }],
  ['OTEL_EXPORTER_OTLP_METRICS_PROTOCOL', {
    helpText: 'Same as OTEL_EXPORTER_OTLP_PROTOCOL but for metrics.',
  }],
]);


function indent(text, depth) {
  return RegExpPrototypeSymbolReplace(/^/gm, text, StringPrototypeRepeat(' ', depth));
}

function fold(text, width) {
  return RegExpPrototypeSymbolReplace(
    new RegExp(`([^\n]{0,${width}})( |$)`, 'g'),
    text,
    (_, newLine, end) => newLine + (end === ' ' ? '\n' : ''),
  );
}

function getArgDescription(type) {
  switch (typeLookup[type]) {
    case 'kNoOp':
    case 'kV8Option':
    case 'kBoolean':
    case undefined:
      break;
    case 'kHostPort':
      return '[host:]port';
    case 'kInteger':
    case 'kUInteger':
    case 'kString':
    case 'kStringList':
      return '...';
    default:
      require('assert').fail(`unknown option type ${type}`);
  }
}

function format(
  { options, aliases = new SafeMap(), firstColumn, secondColumn },
) {
  let text = '';
  let maxFirstColumnUsed = 0;

  const sortedOptions = ArrayPrototypeSort(
    [...options.entries()],
    ({ 0: name1, 1: option1 }, { 0: name2, 1: option2 }) => {
      if (option1.defaultIsTrue) {
        name1 = `--no-${StringPrototypeSlice(name1, 2)}`;
      }
      if (option2.defaultIsTrue) {
        name2 = `--no-${StringPrototypeSlice(name2, 2)}`;
      }
      return StringPrototypeLocaleCompare(name1, name2);
    },
  );

  for (const {
    0: name, 1: { helpText, type, value, defaultIsTrue },
  } of sortedOptions) {
    if (!helpText) continue;

    let displayName = name;

    if (defaultIsTrue) {
      displayName = `--no-${StringPrototypeSlice(displayName, 2)}`;
    }

    const argDescription = getArgDescription(type);
    if (argDescription)
      displayName += `=${argDescription}`;

    for (const { 0: from, 1: to } of aliases) {
      // For cases like e.g. `-e, --eval`.
      if (to[0] === name && to.length === 1) {
        displayName = `${from}, ${displayName}`;
      }

      // For cases like `--inspect-brk[=[host:]port]`.
      const targetInfo = options.get(to[0]);
      const targetArgDescription =
        targetInfo ? getArgDescription(targetInfo.type) : '...';
      if (from === `${name}=`) {
        displayName += `[=${targetArgDescription}]`;
      } else if (from === `${name} <arg>`) {
        displayName += ` [${targetArgDescription}]`;
      }
    }

    let displayHelpText = helpText;
    if (value === !defaultIsTrue) {
      // Mark boolean options we currently have enabled.
      // In particular, it indicates whether --use-openssl-ca
      // or --use-bundled-ca is the (current) default.
      displayHelpText += ' (currently set)';
    }

    text += displayName;
    maxFirstColumnUsed = MathMax(maxFirstColumnUsed, displayName.length);
    if (displayName.length >= firstColumn)
      text += '\n' + StringPrototypeRepeat(' ', firstColumn);
    else
      text += StringPrototypeRepeat(' ', firstColumn - displayName.length);

    text += StringPrototypeTrimLeft(
      indent(fold(displayHelpText, secondColumn), firstColumn)) + '\n';
  }

  if (maxFirstColumnUsed < firstColumn - 4) {
    // If we have more than 4 blank gap spaces, reduce first column width.
    return format({
      options,
      aliases,
      firstColumn: maxFirstColumnUsed + 2,
      secondColumn,
    });
  }

  return text;
}

function print(stream) {
  const { options, aliases } = require('internal/options');

  // Use 75 % of the available width, and at least 70 characters.
  const width = MathMax(70, (stream.columns || 0) * 0.75);
  const firstColumn = MathFloor(width * 0.4);
  const secondColumn = MathFloor(width * 0.57);

  options.set('-', { helpText: 'script read from stdin ' +
                               '(default if no file name is provided, ' +
                               'interactive mode if a tty)' });
  options.set('--', { helpText: 'indicate the end of node options' });
  stream.write(
    'Usage: node [options] [ script.js ] [arguments]\n' +
    '       node inspect [options] [ script.js | host:port ] [arguments]\n\n' +
    'Options:\n');
  stream.write(indent(format({
    options, aliases, firstColumn, secondColumn,
  }), 2));

  stream.write('\nEnvironment variables:\n');

  stream.write(format({
    options: envVars, firstColumn, secondColumn,
  }));

  stream.write('\nN|Solid environment variables:\n');
  stream.write(format({
    options: nsolidEnvVars, firstColumn, secondColumn,
  }));

  stream.write('\nOTLP exporter environment variables. For a full description ' +
    'visit: https://opentelemetry.io/docs/specs/otel/protocol/exporter/\n');
  stream.write(format({
    options: otlpEnvVars, firstColumn, secondColumn,
  }));

  stream.write(
    '\nN|Solid documentation can be found at https://docs.nodesource.com/');
  stream.write('\nDocumentation can be found at https://nodejs.org/\n');
}

prepareMainThreadExecution();

markBootstrapComplete();

print(process.stdout);
