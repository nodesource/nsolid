'use strict';

const common = require('../common');
const assert = require('assert');
const async_hooks = require('async_hooks');
const nsolid = require('nsolid');

new Promise((resolve) => resolve());
nsolid.metrics(common.mustCall((er, m) => {
  assert.strictEqual(m.promiseCreatedCount, 0);
  assert.strictEqual(m.promiseResolvedCount, 0);
  nsolid.start({
    promiseTracking: true
  });

  assert.strictEqual(nsolid.config.promiseTracking, true);
  new Promise((resolve) => resolve());
  nsolid.metrics(common.mustCall((er, m) => {
    assert.strictEqual(m.promiseCreatedCount, 1);
    assert.strictEqual(m.promiseResolvedCount, 1);
    nsolid.start({
      promiseTracking: false
    });

    assert.strictEqual(nsolid.config.promiseTracking, false);
    new Promise((resolve) => resolve());
    nsolid.metrics(common.mustCall((er, m) => {
      assert.strictEqual(m.promiseCreatedCount, 1);
      assert.strictEqual(m.promiseResolvedCount, 1);

      const asyncHook = async_hooks.createHook({
        init: () => {},
        promiseResolve: () => {}
      });

      // It must also work even with async hooks enabled
      asyncHook.enable();
      nsolid.start({
        promiseTracking: true
      });

      assert.strictEqual(nsolid.config.promiseTracking, true);
      new Promise((resolve) => resolve());
      nsolid.metrics(common.mustCall((er, m) => {
        assert.strictEqual(m.promiseCreatedCount, 2);
        assert.strictEqual(m.promiseResolvedCount, 2);
        asyncHook.disable();
        new Promise((resolve) => resolve());
        nsolid.metrics(common.mustCall((er, m) => {
          assert.strictEqual(m.promiseCreatedCount, 3);
          assert.strictEqual(m.promiseResolvedCount, 3);
          nsolid.start({
            promiseTracking: false
          });

          assert.strictEqual(nsolid.config.promiseTracking, false);
          new Promise((resolve) => resolve());
          nsolid.metrics(common.mustCall((er, m) => {
            assert.strictEqual(m.promiseCreatedCount, 3);
            assert.strictEqual(m.promiseResolvedCount, 3);
          }));
        }));
      }));
    }));
  }));
}));
