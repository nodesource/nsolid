// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

const {
  JSONStringify,
  ObjectDefineProperties,
  ObjectDefineProperty,
  Symbol,
} = primordials;

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_counts,
  nsolid_tracer_s,
  nsolid_span_id_s,
  nsolid_consts,
} = nsolidApi;

const cares = internalBinding('cares_wrap');
const { isIP } = require('internal/net');
const { customPromisifyArgs } = require('internal/util');
const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_INVALID_ARG_VALUE,
    ERR_MISSING_ARGS,
  },
  DNSException,
} = require('internal/errors');
const {
  bindDefaultResolver,
  setDefaultResolver,
  validateHints,
  emitInvalidHostnameWarning,
  getDefaultResultOrder,
  setDefaultResultOrder,
  errorCodes: dnsErrorCodes,
} = require('internal/dns/utils');
const {
  Resolver,
} = require('internal/dns/callback_resolver');
const {
  NODATA,
  FORMERR,
  SERVFAIL,
  NOTFOUND,
  NOTIMP,
  REFUSED,
  BADQUERY,
  BADNAME,
  BADFAMILY,
  BADRESP,
  CONNREFUSED,
  TIMEOUT,
  EOF,
  FILE,
  NOMEM,
  DESTRUCTION,
  BADSTR,
  BADFLAGS,
  NONAME,
  BADHINTS,
  NOTINITIALIZED,
  LOADIPHLPAPI,
  ADDRGETNETWORKPARAMS,
  CANCELLED,
} = dnsErrorCodes;
const {
  validateBoolean,
  validateFunction,
  validateNumber,
  validateOneOf,
  validatePort,
  validateString,
} = require('internal/validators');
const {
  getApi,
} = require('internal/otel/core');
const {
  generateSpan,
} = require('internal/nsolid_trace');

const { now: perfNow } = require('internal/perf/utils');

const {
  GetAddrInfoReqWrap,
  GetNameInfoReqWrap,
  DNS_ORDER_VERBATIM,
  DNS_ORDER_IPV4_FIRST,
  DNS_ORDER_IPV6_FIRST,
} = cares;

const kPerfHooksDnsLookupContext = Symbol('kPerfHooksDnsLookupContext');
const kPerfHooksDnsLookupServiceContext = Symbol('kPerfHooksDnsLookupServiceContext');

const {
  hasObserver,
  startPerf,
  stopPerf,
} = require('internal/perf/observe');

const {
  kDnsCount,
  kDnsLookup,
  kDnsLookupService,
  kSpanDns,
  kSpanDnsAddress,
  kSpanDnsOpType,
  kSpanDnsHostname,
  kSpanDnsPort,
  kSpanEndError,
  kSpanEndReason,
} = nsolid_consts;

let promises = null; // Lazy loaded

function onlookup(err, addresses) {
  const now = perfNow();
  nsolidApi.pushDnsBucket(now - this[nsolid_tracer_s]);

  const span = this[nsolid_span_id_s];
  if (err) {
    if (span && generateSpan(kSpanDns)) {
      span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
      span.end(now);
    }

    return this.callback(new DNSException(err, 'getaddrinfo', this.hostname));
  }

  if (span && generateSpan(kSpanDns)) {
    span._pushSpanDataString(kSpanDnsAddress, '"' + addresses[0] + '"');
    span.end(now);
  }

  this.callback(null, addresses[0], this.family || isIP(addresses[0]));
  if (this[kPerfHooksDnsLookupContext] && hasObserver('dns')) {
    stopPerf(this, kPerfHooksDnsLookupContext, { detail: { addresses } });
  }
}


function onlookupall(err, addresses) {
  const now = perfNow();
  nsolidApi.pushDnsBucket(now - this[nsolid_tracer_s]);

  const span = this[nsolid_span_id_s];
  if (err) {
    if (span && generateSpan(kSpanDns)) {
      span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
      span.end();
    }

    return this.callback(new DNSException(err, 'getaddrinfo', this.hostname));
  }

  const family = this.family;
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    addresses[i] = {
      address: addr,
      family: family || isIP(addr),
    };
  }

  if (span && generateSpan(kSpanDns)) {
    span._pushSpanDataString(kSpanDnsAddress, JSONStringify(addresses));
    span.end();
  }

  this.callback(null, addresses);
  if (this[kPerfHooksDnsLookupContext] && hasObserver('dns')) {
    stopPerf(this, kPerfHooksDnsLookupContext, { detail: { addresses } });
  }
}


// Easy DNS A/AAAA look up
// lookup(hostname, [options,] callback)
const validFamilies = [0, 4, 6];
function lookup(hostname, options, callback) {
  let hints = 0;
  let family = 0;
  let all = false;
  let dnsOrder = getDefaultResultOrder();

  // Parse arguments
  if (hostname) {
    validateString(hostname, 'hostname');
  }

  if (typeof options === 'function') {
    callback = options;
    family = 0;
  } else if (typeof options === 'number') {
    validateFunction(callback, 'callback');

    validateOneOf(options, 'family', validFamilies);
    family = options;
  } else if (options !== undefined && typeof options !== 'object') {
    validateFunction(arguments.length === 2 ? options : callback, 'callback');
    throw new ERR_INVALID_ARG_TYPE('options', ['integer', 'object'], options);
  } else {
    validateFunction(callback, 'callback');

    if (options?.hints != null) {
      validateNumber(options.hints, 'options.hints');
      hints = options.hints >>> 0;
      validateHints(hints);
    }
    if (options?.family != null) {
      switch (options.family) {
        case 'IPv4':
          family = 4;
          break;
        case 'IPv6':
          family = 6;
          break;
        default:
          validateOneOf(options.family, 'options.family', validFamilies);
          family = options.family;
          break;
      }
    }
    if (options?.all != null) {
      validateBoolean(options.all, 'options.all');
      all = options.all;
    }
    if (options?.verbatim != null) {
      validateBoolean(options.verbatim, 'options.verbatim');
      dnsOrder = options.verbatim ? 'verbatim' : 'ipv4first';
    }
    if (options?.order != null) {
      validateOneOf(options.order, 'options.order', ['ipv4first', 'ipv6first', 'verbatim']);
      dnsOrder = options.dnsOrder;
    }
  }

  nsolid_counts[kDnsCount]++;

  if (!hostname) {
    emitInvalidHostnameWarning(hostname);
    if (all) {
      process.nextTick(callback, null, []);
    } else {
      process.nextTick(callback, null, null, family === 6 ? 6 : 4);
    }
    return {};
  }

  const matchedFamily = isIP(hostname);
  if (matchedFamily) {
    if (all) {
      process.nextTick(
        callback, null, [{ address: hostname, family: matchedFamily }]);
    } else {
      process.nextTick(callback, null, hostname, matchedFamily);
    }
    return {};
  }

  const req = new GetAddrInfoReqWrap();
  req.callback = callback;
  req.family = family;
  req.hostname = hostname;
  req.oncomplete = all ? onlookupall : onlookup;
  const now = perfNow();
  req[nsolid_tracer_s] = now;
  if (generateSpan(kSpanDns)) {
    const api = getApi();
    const tracer = api.trace.getTracer('dns');
    const span = tracer.startSpan('DNS lookup',
                                  { internal: true,
                                    kind: api.SpanKind.CLIENT,
                                    startTime: now,
                                    type: kSpanDns });
    req[nsolid_span_id_s] = span;
    span._pushSpanDataUint64(kSpanDnsOpType, kDnsLookup);
    span._pushSpanDataString(kSpanDnsHostname, hostname);
  }

  let order = DNS_ORDER_VERBATIM;

  if (dnsOrder === 'ipv4first') {
    order = DNS_ORDER_IPV4_FIRST;
  } else if (dnsOrder === 'ipv6first') {
    order = DNS_ORDER_IPV6_FIRST;
  }

  const err = cares.getaddrinfo(
    req, hostname, family, hints, order,
  );
  if (err) {
    process.nextTick(() => {
      const span = req[nsolid_span_id_s];
      if (span && generateSpan(kSpanDns)) {
        span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
        span.end();
      }

      callback(new DNSException(err, 'getaddrinfo', hostname));
    });
    return {};
  }
  if (hasObserver('dns')) {
    const detail = {
      hostname,
      family,
      hints,
      verbatim: order === DNS_ORDER_VERBATIM,
      order: dnsOrder,
    };

    startPerf(req, kPerfHooksDnsLookupContext, { type: 'dns', name: 'lookup', detail });
  }
  return req;
}

ObjectDefineProperty(lookup, customPromisifyArgs,
                     { __proto__: null, value: ['address', 'family'], enumerable: false });


function onlookupservice(err, hostname, service) {
  const now = perfNow();
  nsolidApi.pushDnsBucket(now - this[nsolid_tracer_s]);

  const span = this[nsolid_span_id_s];
  if (err) {
    if (span && generateSpan(kSpanDns)) {
      span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
      span.end(now);
    }

    return this.callback(new DNSException(err, 'getnameinfo', this.hostname));
  }

  if (span && generateSpan(kSpanDns)) {
    span._pushSpanDataString(kSpanDnsHostname, hostname);
    span.end(now);
  }

  this.callback(null, hostname, service);
  if (this[kPerfHooksDnsLookupServiceContext] && hasObserver('dns')) {
    stopPerf(this, kPerfHooksDnsLookupServiceContext, { detail: { hostname, service } });
  }
}


function lookupService(address, port, callback) {
  if (arguments.length !== 3)
    throw new ERR_MISSING_ARGS('address', 'port', 'callback');

  if (isIP(address) === 0)
    throw new ERR_INVALID_ARG_VALUE('address', address);

  validatePort(port);

  validateFunction(callback, 'callback');

  port = +port;

  nsolid_counts[kDnsCount]++;

  const req = new GetNameInfoReqWrap();
  req.callback = callback;
  req.hostname = address;
  req.port = port;
  req.oncomplete = onlookupservice;
  const now = perfNow();
  req[nsolid_tracer_s] = now;
  if (generateSpan(kSpanDns)) {
    const api = getApi();
    const tracer = api.trace.getTracer('dns');
    const span = tracer.startSpan('DNS lookup_service',
                                  { internal: true,
                                    kind: api.SpanKind.CLIENT,
                                    startTime: now,
                                    type: kSpanDns });
    req[nsolid_span_id_s] = span;
    span._pushSpanDataUint64(kSpanDnsOpType, kDnsLookupService);
    span._pushSpanDataString(kSpanDnsAddress, '"' + address + '"');
    span._pushSpanDataUint64(kSpanDnsPort, port);
  }

  const err = cares.getnameinfo(req, address, port);
  if (err) {
    const span = req[nsolid_span_id_s];
    if (span && generateSpan(kSpanDns)) {
      span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
      span.end();
    }
  }
  if (err) throw new DNSException(err, 'getnameinfo', address);
  if (hasObserver('dns')) {
    startPerf(req, kPerfHooksDnsLookupServiceContext, {
      type: 'dns',
      name: 'lookupService',
      detail: {
        host: address,
        port,
      },
    });
  }
  return req;
}

ObjectDefineProperty(lookupService, customPromisifyArgs,
                     { __proto__: null, value: ['hostname', 'service'], enumerable: false });

function defaultResolverSetServers(servers) {
  const resolver = new Resolver();

  resolver.setServers(servers);
  setDefaultResolver(resolver);
  bindDefaultResolver(module.exports, Resolver.prototype);

  if (promises !== null)
    bindDefaultResolver(promises, promises.Resolver.prototype);
}

module.exports = {
  lookup,
  lookupService,

  Resolver,
  getDefaultResultOrder,
  setDefaultResultOrder,
  setServers: defaultResolverSetServers,

  // uv_getaddrinfo flags
  ADDRCONFIG: cares.AI_ADDRCONFIG,
  ALL: cares.AI_ALL,
  V4MAPPED: cares.AI_V4MAPPED,

  // ERROR CODES
  NODATA,
  FORMERR,
  SERVFAIL,
  NOTFOUND,
  NOTIMP,
  REFUSED,
  BADQUERY,
  BADNAME,
  BADFAMILY,
  BADRESP,
  CONNREFUSED,
  TIMEOUT,
  EOF,
  FILE,
  NOMEM,
  DESTRUCTION,
  BADSTR,
  BADFLAGS,
  NONAME,
  BADHINTS,
  NOTINITIALIZED,
  LOADIPHLPAPI,
  ADDRGETNETWORKPARAMS,
  CANCELLED,
};

bindDefaultResolver(module.exports, Resolver.prototype);

ObjectDefineProperties(module.exports, {
  promises: {
    __proto__: null,
    configurable: true,
    enumerable: true,
    get() {
      if (promises === null) {
        promises = require('internal/dns/promises');
      }
      return promises;
    },
  },
});
