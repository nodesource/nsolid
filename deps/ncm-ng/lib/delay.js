'use strict'

// delay for specified number of seconds

const pDefer = require('p-defer')

module.exports = async function delay (seconds) {
  const deferred = pDefer()

  setTimeout(
    () => deferred.resolve(seconds),
    seconds * 1000
  ).unref()

  return deferred.promise
}
