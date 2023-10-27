'use strict';


const { ObjectCreate,
        ObjectDefineProperty,
        SafeWeakMap,
        Symbol } = primordials;

const async_hooks = require('async_hooks');
const events = require('events');

const {
  getApi,
} = require('internal/otel/core');

const ADD_LISTENER_METHODS = [
  'addListener',
  'on',
  'once',
  'prependListener',
  'prependOnceListener',
];

class AbstractAsyncHooksContextManager {
  constructor() {
    this._kOtListeners = Symbol('OtListeners');
  }
  /**
   * Binds a the certain context or the active one to the target function and
   * then returns the target
   * @param {Context} context A context (span) to be bind to target
   * @param {Function|EventEmitter} target When target or one of its
   * callbacks is called, the provided context will be used as the active
   * context for the durationof the call.
   */
  bind(context, target) {
    if (target instanceof events.EventEmitter) {
      return this._bindEventEmitter(context, target);
    }

    if (typeof target === 'function') {
      return this._bindFunction(context, target);
    }

    return target;
  }

  _bindFunction(context, target) {
    const manager = this;
    function contextWrapper(...args) {
      return manager.with(context, () => target.apply(this, args));
    }

    ObjectDefineProperty(contextWrapper, 'length', {
      __proto__: null,
      enumerable: false,
      configurable: true,
      writable: false,
      value: target.length,
    });

    return contextWrapper;
  }

  /**
   * By default, EventEmitter call their callback with their context, which we
   * do not want, instead we will bind a specific context to all callbacks that
   * go through it.
   * @param {Context} context The context we want to bind
   * @param {EventEmitter} ee An instance of EventEmitter to patch
   */
  _bindEventEmitter(context, ee) {
    const map = this._getPatchMap(ee);
    if (map !== undefined)
      return ee;
    this._createPatchMap(ee);
    // Patch methods that add a listener to propagate context
    ADD_LISTENER_METHODS.forEach((methodName) => {
      if (ee[methodName] === undefined)
        return;
      ee[methodName] = this._patchAddListener(ee, ee[methodName], context);
    });
    // Patch methods that remove a listener
    if (typeof ee.removeListener === 'function') {
      ee.removeListener = this._patchRemoveListener(ee, ee.removeListener);
    }
    if (typeof ee.off === 'function') {
      ee.off = this._patchRemoveListener(ee, ee.off);
    }
    // Patch method that remove all listeners
    if (typeof ee.removeAllListeners === 'function') {
      ee.removeAllListeners =
        this._patchRemoveAllListeners(ee, ee.removeAllListeners);
    }
    return ee;
  }
  /**
   * Patch methods that remove a given listener so that we match the "patched"
   * version of that listener (the one that propagate context).
   * @param {EventEmitter} ee EventEmitter instance
   * @param {Function} original reference to the patched method
   */
  _patchRemoveListener(ee, original) {
    const contextManager = this;
    return function(event, listener) {
      const map = contextManager._getPatchMap(ee);
      const events = map ? map[event] : undefined;
      if (events === undefined) {
        return original.call(this, event, listener);
      }
      const patchedListener = events.get(listener);
      return original.call(this, event, patchedListener || listener);
    };
  }
  /**
   * Patch methods that remove all listeners so we remove our
   * internal references for a given event.
   * @param {EventEmitter} ee EventEmitter instance
   * @param {Function} original reference to the patched method
   */
  _patchRemoveAllListeners(ee, original) {
    const contextManager = this;
    return function(event) {
      const map = contextManager._getPatchMap(ee);
      if (map !== undefined) {
        if (arguments.length === 0) {
          contextManager._createPatchMap(ee);
        } else if (map[event] !== undefined) {
          delete map[event];
        }
      }
      return original.apply(this, arguments);
    };
  }
  /**
   * Patch methods on an event emitter instance that can add listeners so we
   * can force them to propagate a given context.
   * @param {EventEmitter} ee EventEmitter instance
   * @param {Function} original reference to the patched method
   * @param {Context} context to propagate when calling listeners
   */
  _patchAddListener(ee, original, context) {
    const contextManager = this;
    return function(event, listener) {
      let map = contextManager._getPatchMap(ee);
      if (map === undefined) {
        map = contextManager._createPatchMap(ee);
      }
      let listeners = map[event];
      if (listeners === undefined) {
        listeners = new SafeWeakMap();
        map[event] = listeners;
      }
      const patchedListener = contextManager.bind(context, listener);
      // Store a weak reference of the user listener to ours
      listeners.set(listener, patchedListener);
      return original.call(this, event, patchedListener);
    };
  }
  _createPatchMap(ee) {
    const map = ObjectCreate(null);
    ee[this._kOtListeners] = map;
    return map;
  }
  _getPatchMap(ee) {
    return ee[this._kOtListeners];
  }
}

class AsyncLocalStorageContextManager extends AbstractAsyncHooksContextManager {
  constructor() {
    super();
    this._asyncLocalStorage = new async_hooks.AsyncLocalStorage();
  }

  active() {
    const context = this._asyncLocalStorage.getStore();
    if (!context) {
      return getApi().ROOT_CONTEXT;
    }

    return context;
  }

  with(context, fn, thisArg, ...args) {
    const cb = thisArg == null ? fn : fn.bind(thisArg);
    return this._asyncLocalStorage.run(context, cb, ...args);
  }

  enable() {
    return this;
  }

  disable() {
    this._asyncLocalStorage.disable();
    return this;
  }
}

const contextManager = new AsyncLocalStorageContextManager();

module.exports = {
  contextManager,
};
