'use strict';

const {
  randomUUID,
} = require('internal/crypto/random');

const {
  ERR_NSOLID_CPU_PROFILE_START,
  ERR_NSOLID_CPU_PROFILE_STOP,
  ERR_NSOLID_HEAP_PROFILE_START,
  ERR_NSOLID_HEAP_PROFILE_STOP,
  ERR_NSOLID_HEAP_SAMPLING_START,
  ERR_NSOLID_HEAP_SAMPLING_STOP,
  ERR_NSOLID_HEAP_SNAPSHOT,
} = require('internal/errors').codes;
const {
  validateBoolean,
  validateFunction,
  validateNumber,
  validateObject,
} = require('internal/validators');

module.exports = ({ heapProfile: _heapProfile,
                    heapProfileEnd: _heapProfileEnd,
                    heapSampling: _heapSampling,
                    heapSamplingEnd: _heapSamplingEnd,
                    profile: _profile,
                    profileEnd: _profileEnd,
                    snapshot: _snapshot,
                    start,
                    status,
                    stop }) => {

  const profile = (timeout, cb) => {
    if (typeof timeout === 'function') {
      cb = timeout;
      timeout = null;
    }

    timeout = timeout || 600000;
    validateNumber(timeout, 'timeout');

    if (cb !== undefined) {
      validateFunction(cb, 'profileCallback');
    }

    const status = _profile(timeout);
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_CPU_PROFILE_START();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };


  const profileEnd = (cb) => {
    if (cb !== undefined) {
      validateFunction(cb, 'profileEndCallback');
    }

    const status = _profileEnd();
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_CPU_PROFILE_STOP();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };

  const heapProfile = (timeout, trackAllocations, cb) => {
    if (typeof timeout === 'function') {
      cb = timeout;
      timeout = null;
      trackAllocations = false;
    } else if (typeof trackAllocations === 'function') {
      cb = trackAllocations;
      trackAllocations = false;
    }

    timeout = timeout || 600000;
    trackAllocations = trackAllocations || false;
    validateNumber(timeout, 'timeout');
    validateBoolean(trackAllocations, 'trackAllocations');

    if (cb !== undefined) {
      validateFunction(cb, 'heapProfileCallback');
    }

    const status = _heapProfile(timeout, trackAllocations);
    console.log('status', status);
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_HEAP_PROFILE_START();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };


  const heapProfileEnd = (cb) => {
    if (cb !== undefined) {
      validateFunction(cb, 'heapProfileEndCallback');
    }

    const status = _heapProfileEnd();
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_HEAP_PROFILE_STOP();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };

  const defaultHeapSamplingOptions = { sampleInterval: 512 * 1024, stackDepth: 16, flags: 0 };

  const heapSampling = (duration, options, cb) => {
    if (typeof duration === 'function') {
      cb = duration;
      duration = null;
      options = null;
    } else if (typeof options === 'function') {
      cb = options;
      options = null;
    }

    duration = duration || 600000;
    options = options || {};
    validateObject(options, 'options');
    options = { ...defaultHeapSamplingOptions, ...options };
    validateNumber(duration, 'duration');
    validateNumber(options.sampleInterval, 'options.sampleInterval');
    validateNumber(options.stackDepth, 'options.stackDepth');
    validateNumber(options.flags, 'options.flags');

    if (cb !== undefined) {
      validateFunction(cb, 'heapSamplingCallback');
    }

    const status = _heapSampling(options.sampleInterval, options.stackDepth, options.flags, duration);
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_HEAP_SAMPLING_START();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };

  const heapSamplingEnd = (cb) => {
    if (cb !== undefined) {
      validateFunction(cb, 'heapSamplingEndCallback');
    }

    const status = _heapSamplingEnd();
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_HEAP_SAMPLING_STOP();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };

  const snapshot = (cb) => {
    if (cb !== undefined) {
      validateFunction(cb, 'snapshotCallback');
    }

    const status = _snapshot();
    let err;
    if (status !== 0) {
      err = new ERR_NSOLID_HEAP_SNAPSHOT();
      err.code = status;
    }

    if (cb) {
      process.nextTick(() => cb(err));
    } else if (err) {
      throw err;
    }
  };

  return {
    heapProfile,
    heapProfileEnd,
    heapSampling,
    heapSamplingEnd,
    profile,
    profileEnd,
    snapshot,
    start,
    status,
    stop,
  };
};
