'use strict';

function blockFor(duration) {
  const start = Date.now();
  while (Date.now() - start < duration);
}

module.exports = { blockFor };