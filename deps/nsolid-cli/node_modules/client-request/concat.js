'use strict'

module.exports = Concat

var Writable = require('stream').Writable
var inherits = require('util').inherits

function Concat (options, callback) {
  if (!(this instanceof Concat)) {
    return new Concat(options, callback)
  }

  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  if (typeof callback !== 'function') {
    // This stream goes nowhere...
    callback = function devnull () {
      this._collection = []
    }
  }

  if (options == null) {
    options = {}
  }
  this.options = options
  this.callback = callback
  this._collection = []
  Writable.call(this, this.options)

  this.on('finish', this._done)
}
inherits(Concat, Writable)

Concat.prototype._write = function _write (chunk, encoding, callback) {
  this._collection.push(chunk)
  callback()
}

Concat.prototype._done = function _done () {
  if (this.options.objectMode) {
    this.callback(this._collection)
  } else {
    this.callback(Buffer.concat(this._collection))
  }
}
