'use strict';

const {
  ArrayBufferPrototypeSlice,
  ArrayPrototypePush,
  ArrayPrototypeShift,
  AsyncIteratorPrototype,
  FunctionPrototypeCall,
  MathMax,
  NumberIsNaN,
  PromisePrototypeThen,
  ReflectGet,
  Symbol,
  SymbolAsyncIterator,
  SymbolIterator,
  Uint8Array,
} = primordials;

const {
  codes: {
    ERR_INVALID_ARG_VALUE,
    ERR_OPERATION_FAILED,
    ERR_INVALID_STATE,
  },
} = require('internal/errors');

const {
  copyArrayBuffer,
  detachArrayBuffer,
} = internalBinding('buffer');

const {
  inspect,
} = require('util');

const {
  constants: {
    kPending,
  },
  getPromiseDetails,
} = internalBinding('util');

const assert = require('internal/assert');
const { isArrayBufferDetached } = require('internal/util');

const {
  validateFunction,
} = require('internal/validators');

const kState = Symbol('kState');
const kType = Symbol('kType');

const AsyncIterator = {
  __proto__: AsyncIteratorPrototype,
  next: undefined,
  return: undefined,
};

function extractHighWaterMark(value, defaultHWM) {
  if (value === undefined) return defaultHWM;
  value = +value;
  if (typeof value !== 'number' ||
      NumberIsNaN(value) ||
      value < 0)
    throw new ERR_INVALID_ARG_VALUE.RangeError('strategy.highWaterMark', value);
  return value;
}

function extractSizeAlgorithm(size) {
  if (size === undefined) return () => 1;
  validateFunction(size, 'strategy.size');
  return size;
}

function customInspect(depth, options, name, data) {
  if (depth < 0)
    return this;

  const opts = {
    ...options,
    depth: options.depth == null ? null : options.depth - 1,
  };

  return `${name} ${inspect(data, opts)}`;
}

// These are defensive to work around the possibility that
// the buffer, byteLength, and byteOffset properties on
// ArrayBuffer and ArrayBufferView's may have been tampered with.

function ArrayBufferViewGetBuffer(view) {
  return ReflectGet(view.constructor.prototype, 'buffer', view);
}

function ArrayBufferViewGetByteLength(view) {
  return ReflectGet(view.constructor.prototype, 'byteLength', view);
}

function ArrayBufferViewGetByteOffset(view) {
  return ReflectGet(view.constructor.prototype, 'byteOffset', view);
}

function cloneAsUint8Array(view) {
  const buffer = ArrayBufferViewGetBuffer(view);
  const byteOffset = ArrayBufferViewGetByteOffset(view);
  const byteLength = ArrayBufferViewGetByteLength(view);
  return new Uint8Array(
    ArrayBufferPrototypeSlice(buffer, byteOffset, byteOffset + byteLength),
  );
}

function isBrandCheck(brand) {
  return (value) => {
    return value != null &&
           value[kState] !== undefined &&
           value[kType] === brand;
  };
}

function transferArrayBuffer(buffer) {
  const res = detachArrayBuffer(buffer);
  if (res === undefined) {
    throw new ERR_OPERATION_FAILED.TypeError(
      'The ArrayBuffer could not be transferred');
  }
  return res;
}

function isViewedArrayBufferDetached(view) {
  return (
    ArrayBufferViewGetByteLength(view) === 0 &&
    isArrayBufferDetached(ArrayBufferViewGetBuffer(view))
  );
}

function dequeueValue(controller) {
  assert(controller[kState].queue !== undefined);
  assert(controller[kState].queueTotalSize !== undefined);
  assert(controller[kState].queue.length);
  const {
    value,
    size,
  } = ArrayPrototypeShift(controller[kState].queue);
  controller[kState].queueTotalSize =
    MathMax(0, controller[kState].queueTotalSize - size);
  return value;
}

function resetQueue(controller) {
  assert(controller[kState].queue !== undefined);
  assert(controller[kState].queueTotalSize !== undefined);
  controller[kState].queue = [];
  controller[kState].queueTotalSize = 0;
}

function peekQueueValue(controller) {
  assert(controller[kState].queue !== undefined);
  assert(controller[kState].queueTotalSize !== undefined);
  assert(controller[kState].queue.length);
  return controller[kState].queue[0].value;
}

function enqueueValueWithSize(controller, value, size) {
  assert(controller[kState].queue !== undefined);
  assert(controller[kState].queueTotalSize !== undefined);
  size = +size;
  if (typeof size !== 'number' ||
      size < 0 ||
      NumberIsNaN(size) ||
      size === Infinity) {
    throw new ERR_INVALID_ARG_VALUE.RangeError('size', size);
  }
  ArrayPrototypePush(controller[kState].queue, { value, size });
  controller[kState].queueTotalSize += size;
}

// This implements "invoke a callback function type" for callback functions that return a promise.
// See https://webidl.spec.whatwg.org/#es-invoking-callback-functions
async function invokePromiseCallback(fn, thisArg, ...args) {
  return FunctionPrototypeCall(fn, thisArg, ...args);
}

function createPromiseCallback(name, fn, thisArg) {
  validateFunction(fn, name);
  return (...args) => invokePromiseCallback(fn, thisArg, ...args);
}

function isPromisePending(promise) {
  if (promise === undefined) return false;
  const details = getPromiseDetails(promise);
  return details?.[0] === kPending;
}

function setPromiseHandled(promise) {
  // Alternatively, we could use the native API
  // MarkAsHandled, but this avoids the extra boundary cross
  // and is hopefully faster at the cost of an extra Promise
  // allocation.
  PromisePrototypeThen(promise, () => {}, () => {});
}

async function nonOpFlush() {}

function nonOpStart() {}

async function nonOpPull() {}

async function nonOpCancel() {}

async function nonOpWrite() {}

let transfer;
function lazyTransfer() {
  if (transfer === undefined)
    transfer = require('internal/webstreams/transfer');
  return transfer;
}

function createAsyncFromSyncIterator(syncIteratorRecord) {
  const syncIterable = {
    [SymbolIterator]: () => syncIteratorRecord.iterator,
  };

  const asyncIterator = (async function* () {
    return yield* syncIterable;
  }());

  const nextMethod = asyncIterator.next;
  return { iterator: asyncIterator, nextMethod, done: false };
}

function getIterator(obj, kind = 'sync', method) {
  if (method === undefined) {
    if (kind === 'async') {
      method = obj[SymbolAsyncIterator];
      if (method === undefined) {
        const syncMethod = obj[SymbolIterator];
        const syncIteratorRecord = getIterator(obj, 'sync', syncMethod);
        return createAsyncFromSyncIterator(syncIteratorRecord);
      }
    } else {
      method = obj[SymbolIterator];
    }
  }

  const iterator = FunctionPrototypeCall(method, obj);
  if (typeof iterator !== 'object' || iterator === null) {
    throw new ERR_INVALID_STATE.TypeError('The iterator method must return an object');
  }
  const nextMethod = iterator.next;
  return { iterator, nextMethod, done: false };
}

function iteratorNext(iteratorRecord, value) {
  let result;
  if (value === undefined) {
    result = FunctionPrototypeCall(iteratorRecord.nextMethod, iteratorRecord.iterator);
  } else {
    result = FunctionPrototypeCall(iteratorRecord.nextMethod, iteratorRecord.iterator, [value]);
  }
  if (typeof result !== 'object' || result === null) {
    throw new ERR_INVALID_STATE.TypeError('The iterator.next() method must return an object');
  }
  return result;
}

module.exports = {
  ArrayBufferViewGetBuffer,
  ArrayBufferViewGetByteLength,
  ArrayBufferViewGetByteOffset,
  AsyncIterator,
  createPromiseCallback,
  cloneAsUint8Array,
  copyArrayBuffer,
  customInspect,
  dequeueValue,
  enqueueValueWithSize,
  extractHighWaterMark,
  extractSizeAlgorithm,
  lazyTransfer,
  invokePromiseCallback,
  isBrandCheck,
  isPromisePending,
  isViewedArrayBufferDetached,
  peekQueueValue,
  resetQueue,
  setPromiseHandled,
  transferArrayBuffer,
  nonOpCancel,
  nonOpFlush,
  nonOpPull,
  nonOpStart,
  nonOpWrite,
  getIterator,
  iteratorNext,
  kType,
  kState,
};
