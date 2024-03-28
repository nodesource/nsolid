'use strict';

const {
  ObjectDefineProperty,
  ReflectApply,
  ArrayPrototypeMap,
  Symbol,
  JSONStringify,
} = primordials;

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_consts,
  nsolid_counts,
  nsolid_tracer_s,
  nsolid_span_id_s,
} = nsolidApi;

const { now: perfNow } = require('internal/perf/utils');

const {
  getApi,
} = require('internal/otel/core');
const {
  generateSpan,
} = require('internal/nsolid_trace');

const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_INVALID_ARG_VALUE,
  },
  DNSException,
} = require('internal/errors');

const {
  createResolverClass,
} = require('internal/dns/utils');

const {
  validateFunction,
  validateString,
} = require('internal/validators');

const {
  QueryReqWrap,
} = internalBinding('cares_wrap');

const {
  hasObserver,
  startPerf,
  stopPerf,
} = require('internal/perf/observe');

const {
  kDnsCount,
  kDnsResolve,
  kSpanDns,
  kSpanDnsAddress,
  kSpanDnsOpType,
  kSpanDnsHostname,
  kSpanEndError,
  kSpanEndReason,
} = nsolid_consts;

const kPerfHooksDnsLookupResolveContext = Symbol('kPerfHooksDnsLookupResolveContext');

function onresolve(err, result, ttls) {
  const now = perfNow();
  nsolidApi.pushDnsBucket(now - this[nsolid_tracer_s]);
  if (ttls && this.ttl)
    result = ArrayPrototypeMap(
      result, (address, index) => ({ address, ttl: ttls[index] }));

  const span = this[nsolid_span_id_s];
  if (err) {
    if (span && generateSpan(kSpanDns)) {
      span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
      span.end(now);
    }

    this.callback(new DNSException(err, this.bindingName, this.hostname));
  } else {
    if (span && generateSpan(kSpanDns)) {
      span._pushSpanDataString(kSpanDnsAddress, JSONStringify(result));
      span.end(now);
    }

    this.callback(null, result);
    if (this[kPerfHooksDnsLookupResolveContext] && hasObserver('dns')) {
      stopPerf(this, kPerfHooksDnsLookupResolveContext, { detail: { result } });
    }
  }
}

function resolver(bindingName) {
  function query(name, /* options, */ callback) {
    let options;
    if (arguments.length > 2) {
      options = callback;
      callback = arguments[2];
    }

    validateString(name, 'name');
    validateFunction(callback, 'callback');

    nsolid_counts[kDnsCount]++;

    const req = new QueryReqWrap();
    req.bindingName = bindingName;
    req.callback = callback;
    req.hostname = name;
    req.oncomplete = onresolve;
    req.ttl = !!(options && options.ttl);

    const now = perfNow();
    req[nsolid_tracer_s] = now;

    if (generateSpan(kSpanDns)) {
      const api = getApi();
      const tracer = api.trace.getTracer('dns');
      const span = tracer.startSpan('DNS resolve',
                                    { internal: true,
                                      kind: api.SpanKind.CLIENT,
                                      startTime: now,
                                      type: kSpanDns });
      req[nsolid_span_id_s] = span;
      span._pushSpanDataUint64(kSpanDnsOpType, kDnsResolve);
      span._pushSpanDataString(kSpanDnsHostname, name);
    }

    const err = this._handle[bindingName](req, name);
    if (err) {
      const span = req[nsolid_span_id_s];
      if (span && generateSpan(kSpanDns)) {
        span._pushSpanDataUint64(kSpanEndReason, kSpanEndError);
        span.end();
      }

      throw new DNSException(err, bindingName, name);
    }

    if (hasObserver('dns')) {
      startPerf(req, kPerfHooksDnsLookupResolveContext, {
        type: 'dns',
        name: bindingName,
        detail: {
          host: name,
          ttl: req.ttl,
        },
      });
    }
    return req;
  }
  ObjectDefineProperty(query, 'name', { __proto__: null, value: bindingName });
  return query;
}

// This is the callback-based resolver. There is another similar
// resolver in dns/promises.js with resolve methods that are based
// on promises instead.
const { Resolver, resolveMap } = createResolverClass(resolver);
Resolver.prototype.resolve = resolve;

function resolve(hostname, rrtype, callback) {
  let resolver;
  if (typeof rrtype === 'string') {
    resolver = resolveMap[rrtype];
  } else if (typeof rrtype === 'function') {
    resolver = resolveMap.A;
    callback = rrtype;
  } else {
    throw new ERR_INVALID_ARG_TYPE('rrtype', 'string', rrtype);
  }

  if (typeof resolver === 'function') {
    return ReflectApply(resolver, this, [hostname, callback]);
  }
  throw new ERR_INVALID_ARG_VALUE('rrtype', rrtype);
}

module.exports = {
  Resolver,
};
