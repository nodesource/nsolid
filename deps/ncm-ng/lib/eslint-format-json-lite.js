'use strict'

module.exports = function (results) {
  // Delete the full sources off the object...
  for (const result of results) {
    delete result.source
  }
  return JSON.stringify(results)
}
