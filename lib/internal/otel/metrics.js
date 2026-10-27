'use strict';

const {
  ArrayFrom,
  ArrayPrototypePush,
  ArrayPrototypeSplice,
  JSONStringify,
  PromiseResolve,
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
const { Metrics } = internalBinding('metrics');

const metrics = new Metrics();
const observableCallbacks = new SafeSet();
const observableInstrumentObservers = new SafeWeakMap();
const observableInstrumentMeters = new SafeWeakMap();
let observableCallbackRegistered = false;

function collectObservableCallbacks() {
  const promises = [];
  for (const callback of ArrayFrom(observableCallbacks)) {
    try {
      const promise = callback();
      if (promise !== undefined) {
        ArrayPrototypePush(promises, PromiseResolve(promise));
      }
    } catch {
      // A failed callback must not suppress the remaining observations.
    }
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
      this.#id = metrics[register](meterName,
                                   meterVersion,
                                   meterSchemaUrl,
                                   name,
                                   options?.unit ?? '',
                                   options?.description ?? '');
    }
  }

  add(value, attributes = {}, context) {
    if (this.#state.disabled) return;
    metrics.add(this.#id, value, JSONStringify(attributes));
  }
}

class Gauge {
  #id;
  #state;
  constructor(meterName, meterVersion, meterSchemaUrl, name, options, state) {
    this.#state = state;
    if (!state.disabled) {
      this.#id = metrics.registerGauge(meterName,
                                       meterVersion,
                                       meterSchemaUrl,
                                       name,
                                       options?.unit ?? '',
                                       options?.description ?? '');
    }
  }

  record(value, attributes = {}, context) {
    if (this.#state.disabled) return;
    metrics.record(this.#id, value, JSONStringify(attributes));
  }
}

class Histogram {
  #id;
  #state;
  constructor(meterName, meterVersion, meterSchemaUrl, name, options, state) {
    this.#state = state;
    if (!state.disabled) {
      this.#id = metrics.registerHistogram(meterName,
                                           meterVersion,
                                           meterSchemaUrl,
                                           name,
                                           options?.unit ?? '',
                                           options?.description ?? '',
                                           options?.advice?.explicitBucketBoundaries === undefined ?
                                             '' :
                                             JSONStringify(
                                               options.advice.explicitBucketBoundaries));
    }
  }

  record(value, attributes = {}, context) {
    if (this.#state.disabled) return;
    metrics.record(this.#id, value, JSONStringify(attributes));
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
      this.#id = metrics[register](meterName,
                                   meterVersion,
                                   meterSchemaUrl,
                                   name,
                                   options?.unit ?? '',
                                   options?.description ?? '');
    }
    observableInstrumentObservers.set(this, (value, attributes = {}) => {
      if (this.#state.disabled) return;
      metrics.add(this.#id, value, JSONStringify(attributes));
    });
  }

  addCallback(callback) {
    validateFunction(callback, 'callback');
    if (this.#state.disabled) return;
    if (this.#callbacks.has(callback)) return;
    const result = {
      observe: observableInstrumentObservers.get(this),
    };
    const registeredCallback = () => callback(result);
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

    const registeredCallback = () => callback({
      observe(observable, value, attributes = {}) {
        const observer = observers.get(observable);
        if (observer !== undefined) observer(value, attributes);
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
