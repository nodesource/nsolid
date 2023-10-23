'use strict';

const {
  ERR_NSOLID_CPU_PROFILE_START,
  ERR_NSOLID_CPU_PROFILE_STOP,
  ERR_NSOLID_HEAP_SNAPSHOT,
} = require('internal/errors').codes;
const {
  validateFunction,
  validateNumber,
} = require('internal/validators');

module.exports = ({ profile: _profile,
                    profileEnd: _profileEnd,
                    snapshot: _snapshot,
                    start,
                    status,
                    stop }) => {
  /**
   * Executes CPU-profiling of the current JS thread for `timeout` seconds and
   * sends the data to the console once it's done. It does not return until the
   * profiling has started or it has failed.
   * @param {number} [timeout=600000]
   * @param {profileCallback} [cb] called when the profile has started or there
   * has been an error.
   * @example
   * const nsolid = require('nsolid');
   * // async version
   * nsolid.profile(600, (err) => {
   *   if(!err) {
   *     console.log('Profile started!');
   *   }
   * });
   * // sync version
   * try {
   *   // starts profiling for 600000 seconds
   *   nsolid.profile();
   * } catch (err) {
   *   // In case an error happens
   * }
   * @throws Will throw an error if an error happens and no callback was passed.
   * @function profile
   * @memberof module:nsolid
   */
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

  /**
   * Stops the running CPU-profile in the current JS thread (if any)
   * @param {profileEndCallback} [cb] called when the profile has started or
   * there has been an error.
   * @example
   * const nsolid = require('nsolid');
   * // async version
   * nsolid.profile(600, (err) => {
   *   if(!err) {
   *     console.log('Profile started!');
   *     setTimeout(() => {
   *       nsolid.profileEnd((err) => {
   *         if (!err) {
   *           console.log('Profile ended!');
   *         }}
   *       });
   *     }, 1000);
   *   }
   * });
   * @throws Will throw an error if an error happens and no callback was passed.
   * @function profileEnd
   * @memberof module:nsolid
   */
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

  /**
   * It generates a heap snapshot of the current JS thread and sends it to the
   * console. It does not return until the snapshot has been generated or an
   * error has happened.
   * @param {snapshotCallback} [cb] called when the snapshot has been generated
   * and sent to the console.
   * @example
   * const nsolid = require('nsolid');
   * // async version
   * nsolid.snapshot((err) => {
   *   if(!err) {
   *     console.log('Snapshot Generated!');
   *   }
   * });
   * // sync version
   * try {
   *   nsolid.snapshot();
   * } catch (err) {
   *   // In case an error happens
   * }
   * @throws Will throw an error if an error happens and no callback was passed.
   * @function snapshot
   * @memberof module:nsolid
   */
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
    profile,
    profileEnd,
    snapshot,
    start,
    status,
    stop,
  };
};
