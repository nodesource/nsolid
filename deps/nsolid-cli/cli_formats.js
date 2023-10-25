'use strict'

const { PassThrough, Transform } = require('stream')

module.exports.Consolize = Consolize

function Consolize (output) {
  let final = null

  // Just pass the data along if the output is not TTY.
  if (!output.isTTY) {
    return new PassThrough()
  }

  // Add a final \n if we're in a TTY and it doesn't have one already
  return new Transform({
    transform(chunk, encoding, callback) {
      final = chunk[chunk.length - 1]
      callback(null, chunk)
    },
    flush(callback) {
      if (final !== null && final !== 10) { // 0x10 = \n
        // only add newline if in TTY & doesn't already end with one
        this.push('\n')
      }
      callback()
    }
  })
}
