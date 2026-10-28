'use strict';

const {
  ArrayFrom,
  ArrayPrototypePush,
  ArrayPrototypeSplice,
  JSONStringify,
  Promise,
  PromisePrototypeThen,
  PromiseResolve,
  ReflectApply,
  SafeMap,
  SafePromiseAllSettledReturnVoid,
  SafePromisePrototypeFinally,
  SafeSet,
  SafeWeakMap,
} = primordials;

const {
  codes: {
    ERR_INVALID_ARG_VALUE,
  },
} = require('internal/errors');
const { validateArray, validateFunction } = require('internal/validators');
const { clearTimeout, setTimeout } = require('timers');
const { Metrics } = internalBinding('metrics');

const metrics = new Metrics();
const observableCallbacks = new SafeSet();
const pendingObservableCallbacks = new SafeSet();
const observableInstrumentObservers = new SafeWeakMap();
const observableInstrumentMeters = new SafeWeakMap();
let observableCallbackRegistered = false;
let warnedInvalidMeasurement = false;
let warnedObservableTimeout = false;

function warnInvalidMeasurement() {
  if (warnedInvalidMeasurement) return;
  warnedInvalidMeasurement = true;
  process.emitWarning('Invalid OpenTelemetry metric input was ignored.', {
    code: 'NSOLID_OTEL_INVALID_METRIC',
  });
}

function recordMeasurement(id, value, attributes) {
  if (id === undefined) return;
  try {
    metrics.add(id, value, JSONStringify(attributes));
  } catch {
    // Invalid telemetry must not interrupt the instrumented application.
    warnInvalidMeasurement();
  }
}

function registerInstrument(register, meterName, meterVersion, meterSchemaUrl,
                            name, options) {
  const args = [ meterName, meterVersion, meterSchemaUrl, name ];
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] !== 'string') {
      args[i] = i === 3 ? 'unknown' : '';
      warnInvalidMeasurement();
    }
  }
  try {
    const unit = options?.unit;
    const description = options?.description;
    ArrayPrototypePush(args,
                       typeof unit === 'string' ? unit : '',
                       typeof description === 'string' ? description : '');
    if (register === 'registerHistogram') {
      try {
        const boundaries = options?.advice?.explicitBucketBoundaries;
        ArrayPrototypePush(args, boundaries === undefined ? '' :
          JSONStringify(boundaries));
        return ReflectApply(metrics[register], metrics, args);
      } catch {
        // Invalid advice falls back to the default explicit boundaries.
        warnInvalidMeasurement();
        args[6] = '';
      }
    }
    return ReflectApply(metrics[register], metrics, args);
  } catch {
    warnInvalidMeasurement();
  }
}

function bufferObservation(buffer, observer, value, attributes) {
  if (buffer.values === undefined) return;
  try {
    ArrayPrototypePush(buffer.values,
                       { observer, value, attributes: JSONStringify(attributes) });
  } catch {
    warnInvalidMeasurement();
  }
}

async function collectObservableCallback(callback) {
  const buffer = { values: [] };
  let timer;
  let cancel;
  try {
    await new Promise((resolve, reject) => {
      cancel = reject;
      pendingObservableCallbacks.add(cancel);
      timer = setTimeout(() => {
        reject();
        if (warnedObservableTimeout) return;
        warnedObservableTimeout = true;
        process.emitWarning('OpenTelemetry metric callback timed out.', {
          code: 'NSOLID_OTEL_METRIC_TIMEOUT',
        });
      }, 30000);
      timer.unref();
      PromisePrototypeThen(PromiseResolve(callback(buffer)), resolve, reject);
    });
    for (const { observer, value, attributes } of buffer.values) {
      observer(value, attributes);
    }
  } catch {
    // Failed callbacks contribute no observations to this collection.
  } finally {
    clearTimeout(timer);
    pendingObservableCallbacks.delete(cancel);
    buffer.values = undefined;
  }
}

function collectObservableCallbacks() {
  const promises = [];
  for (const callback of ArrayFrom(observableCallbacks)) {
    if (!observableCallbackRegistered) break;
    ArrayPrototypePush(promises, collectObservableCallback(callback));
  }
  SafePromisePrototypeFinally(
    SafePromiseAllSettledReturnVoid(promises),
    () => metrics.collectionDone());
}

function addObservableCallback(callback) {
  observableCallbacks.add(callback);
  if (observableCallbackRegistered) return;
  metrics.registerObservableCallback(collectObservableCallbacks);
  observableCallbackRegistered = true;
}

function removeObservableCallback(callback) {
  observableCallbacks.delete(callback);
  if (observableCallbacks.size !== 0 || !observableCallbackRegistered) return;
  metrics.removeObservableCallback();
  observableCallbackRegistered = false;
}

class Counter {
  #id;
  #state;
  constructor(meterName,
              meterVersion,
              meterSchemaUrl,
              name,
              options,
              state,
              register = 'registerCounter') {
    this.#state = state;
    if (!state.disabled) {
      this.#id = registerInstrument(register, meterName, meterVersion,
                                    meterSchemaUrl, name, options);
    }
  }

  add(value, attributes = {}, context) {
    if (this.#state.disabled) return;
    recordMeasurement(this.#id, value, attributes);
  }
}

class Gauge {
  #id;
  #state;
  constructor(meterName, meterVersion, meterSchemaUrl, name, options, state) {
    this.#state = state;
    if (!state.disabled) {
      this.#id = registerInstrument('registerGauge', meterName, meterVersion,
                                    meterSchemaUrl, name, options);
    }
  }

  record(value, attributes = {}, context) {
    if (this.#state.disabled) return;
    recordMeasurement(this.#id, value, attributes);
  }
}

class Histogram {
  #id;
  #state;
  constructor(meterName, meterVersion, meterSchemaUrl, name, options, state) {
    this.#state = state;
    if (!state.disabled) {
      this.#id = registerInstrument('registerHistogram', meterName, meterVersion,
                                    meterSchemaUrl, name, options);
    }
  }

  record(value, attributes = {}, context) {
    if (this.#state.disabled) return;
    recordMeasurement(this.#id, value, attributes);
  }
}

class ObservableInstrument {
  #id;
  #state;
  #callbacks = new SafeMap();
  constructor(meter,
              meterName,
              meterVersion,
              meterSchemaUrl,
              name,
              options,
              state,
              register) {
    this.#state = state;
    observableInstrumentMeters.set(this, meter);
    if (!state.disabled) {
      this.#id = registerInstrument(register, meterName, meterVersion,
                                    meterSchemaUrl, name, options);
    }
    observableInstrumentObservers.set(this, (value, attributes) => {
      if (this.#state.disabled || this.#id === undefined) return;
      try {
        metrics.add(this.#id, value, attributes);
      } catch {
        warnInvalidMeasurement();
      }
    });
  }

  addCallback(callback) {
    validateFunction(callback, 'callback');
    if (this.#state.disabled) return;
    if (this.#callbacks.has(callback)) return;
    const observer = observableInstrumentObservers.get(this);
    const registeredCallback = (buffer) => callback({
      observe(value, attributes = {}) {
        bufferObservation(buffer, observer, value, attributes);
      },
    });
    this.#callbacks.set(callback, registeredCallback);
    addObservableCallback(registeredCallback);
  }

  removeCallback(callback) {
    const registeredCallback = this.#callbacks.get(callback);
    if (registeredCallback === undefined) return;
    this.#callbacks.delete(callback);
    removeObservableCallback(registeredCallback);
  }
}

class Meter {
  #name;
  #version;
  #schemaUrl;
  #counters;
  #gauges;
  #histograms;
  #upDownCounters;
  #observableCounters;
  #observableGauges;
  #observableUpDownCounters;
  #batchCallbacks;
  #state;

  constructor(name, version, schemaUrl, state) {
    this.#name = name;
    this.#version = version;
    this.#schemaUrl = schemaUrl;
    this.#state = state;
    this.#counters = new SafeMap();
    this.#gauges = new SafeMap();
    this.#histograms = new SafeMap();
    this.#upDownCounters = new SafeMap();
    this.#observableCounters = new SafeMap();
    this.#observableGauges = new SafeMap();
    this.#observableUpDownCounters = new SafeMap();
    this.#batchCallbacks = new SafeMap();
  }

  addBatchObservableCallback(callback, observables) {
    validateFunction(callback, 'callback');
    validateArray(observables, 'observables');
    if (this.#state.disabled) return;

    const observableSet = new SafeSet(observables);
    const observers = new SafeMap();
    for (const observable of observableSet) {
      const observer = observableInstrumentObservers.get(observable);
      if (observer === undefined ||
          observableInstrumentMeters.get(observable) !== this) {
        throw new ERR_INVALID_ARG_VALUE(
          'observables', observables,
          'must contain only observable instruments from this meter');
      }
      observers.set(observable, observer);
    }

    let callbacks = this.#batchCallbacks.get(callback);
    if (callbacks) {
      for (const registration of callbacks) {
        if (sameObservableSet(registration.observableSet, observableSet)) return;
      }
    } else {
      callbacks = [];
      this.#batchCallbacks.set(callback, callbacks);
    }

    const registeredCallback = (buffer) => callback({
      observe(observable, value, attributes = {}) {
        const observer = observers.get(observable);
        if (observer !== undefined) {
          bufferObservation(buffer, observer, value, attributes);
        }
      },
    });
    ArrayPrototypePush(callbacks, { observableSet, registeredCallback });
    addObservableCallback(registeredCallback);
  }

  createCounter(name, options) {
    if (!this.#counters.has(name)) {
      this.#counters.set(name,
                         new Counter(this.#name,
                                     this.#version,
                                     this.#schemaUrl,
                                     name,
                                     options,
                                     this.#state));
    }

    return this.#counters.get(name);
  }

  createGauge(name, options) {
    if (!this.#gauges.has(name)) {
      this.#gauges.set(name,
                       new Gauge(this.#name,
                                 this.#version,
                                 this.#schemaUrl,
                                 name,
                                 options,
                                 this.#state));
    }

    return this.#gauges.get(name);
  }

  createHistogram(name, options) {
    if (!this.#histograms.has(name)) {
      this.#histograms.set(name,
                           new Histogram(this.#name,
                                         this.#version,
                                         this.#schemaUrl,
                                         name,
                                         options,
                                         this.#state));
    }
    return this.#histograms.get(name);
  }

  createObservableCounter(name, options) {
    if (!this.#observableCounters.has(name)) {
      this.#observableCounters.set(name,
                                   new ObservableInstrument(
                                     this,
                                     this.#name,
                                     this.#version,
                                     this.#schemaUrl,
                                     name,
                                     options,
                                     this.#state,
                                     'registerObservableCounter'));
    }
    return this.#observableCounters.get(name);
  }

  createObservableGauge(name, options) {
    if (!this.#observableGauges.has(name)) {
      this.#observableGauges.set(name,
                                 new ObservableInstrument(
                                   this,
                                   this.#name,
                                   this.#version,
                                   this.#schemaUrl,
                                   name,
                                   options,
                                   this.#state,
                                   'registerObservableGauge'));
    }
    return this.#observableGauges.get(name);
  }

  createObservableUpDownCounter(name, options) {
    if (!this.#observableUpDownCounters.has(name)) {
      this.#observableUpDownCounters.set(name,
                                         new ObservableInstrument(
                                           this,
                                           this.#name,
                                           this.#version,
                                           this.#schemaUrl,
                                           name,
                                           options,
                                           this.#state,
                                           'registerObservableUpDownCounter'));
    }
    return this.#observableUpDownCounters.get(name);
  }

  createUpDownCounter(name, options) {
    if (!this.#upDownCounters.has(name)) {
      this.#upDownCounters.set(name,
                               new Counter(this.#name,
                                           this.#version,
                                           this.#schemaUrl,
                                           name,
                                           options,
                                           this.#state,
                                           'registerUpDownCounter'));
    }
    return this.#upDownCounters.get(name);
  }

  removeBatchObservableCallback(callback, observables) {
    validateFunction(callback, 'callback');
    validateArray(observables, 'observables');
    const callbacks = this.#batchCallbacks.get(callback);
    if (callbacks === undefined) return;
    const observableSet = new SafeSet(observables);
    for (let i = 0; i < callbacks.length; i++) {
      if (!sameObservableSet(callbacks[i].observableSet, observableSet)) continue;
      const { 0: registration } = ArrayPrototypeSplice(callbacks, i, 1);
      removeObservableCallback(registration.registeredCallback);
      if (callbacks.length === 0) this.#batchCallbacks.delete(callback);
      return;
    }
  }
}

function sameObservableSet(left, right) {
  if (left.size !== right.size) return false;
  for (const observable of left) {
    if (!right.has(observable)) return false;
  }
  return true;
}

class MeterProvider {
  #meters;
  #state;
  constructor() {
    this.#meters = new SafeMap();
    this.#state = { disabled: false };
  }

  disable() {
    if (this.#state.disabled) return;
    this.#state.disabled = true;
    this.#meters.clear();
    observableCallbacks.clear();
    observableCallbackRegistered = false;
    metrics.disable();
    for (const cancel of pendingObservableCallbacks) cancel();
  }

  getMeter(name, version = '', options) {
    const schemaUrl = options?.schemaUrl ?? '';
    let versions = this.#meters.get(name);
    if (!versions) {
      versions = new SafeMap();
      this.#meters.set(name, versions);
    }

    let schemas = versions.get(version);
    if (!schemas) {
      schemas = new SafeMap();
      versions.set(version, schemas);
    }

    if (!schemas.has(schemaUrl)) {
      schemas.set(schemaUrl, new Meter(name, version, schemaUrl, this.#state));
    }

    return schemas.get(schemaUrl);
  }
}

const meterProvider = new MeterProvider();

module.exports = {
  meterProvider,
};
