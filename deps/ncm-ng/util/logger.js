'use strict'

var path = require('path')
var bole = require('bole')

exports.getLogger = getLogger
exports.setLogLevel = setLogLevel
exports.getLogLevel = getLogLevel

// Handling of errors on stdout.
//
// It seems that sometimes at shutdown, if the node process is redirecting
// to a file, the pipe to that file is shutdown before node is finished,
// and then any subsequent writes to stdout/stderr will end up getting an
// error.
//
// So, at shutdown time only, should call `ignoreStreamError(true)` so that
// shutdown can continue, with the loss of logging, but at least the shutdown
// logic can proceed

// If passed with no arguments, return current setting.
// Otherwise set / unset the error handler.

const isBrowser = typeof window === 'object' && typeof document === 'object'

let SavedLevel = 'info'

// Handling of errors on stdout.
//
// It seems that sometimes at shutdown, if the node process is redirecting
// to a file, the pipe to that file is shutdown before node is finished,
// and then any subsequent writes to stdout/stderr will end up getting an
// error.
//
// So, at shutdown time only, should call `ignoreStreamError(true)` so that
// shutdown can continue, with the loss of logging, but at least the shutdown
// logic can proceed

// Return a new logger for a module, named with basenames of names passed in
// combined as a path; eg, (__dirname, __filename) -> 'lib/util.js'.
function getLogger (names) {
  let name = Array.prototype.slice.call(arguments)
    .map(name => path.basename(name))
    .join(path.sep)
  name = `nsolid-console:${name}`

  const logger = isBrowser ? console : bole(name)
  logger.mute = () => {}
  logger.setLogLevel = setLogLevel
  logger.getLogLevel = getLogLevel
  logger.ignoreStreamError = () => {}

  return logger
}

// Set the logging level
function setLogLevel (level) {
  if (!level.match(/^(debug)|(info)|(warn)|(error)$/)) {
    level = 'info'
  }

  SavedLevel = level
}

function getLogLevel () {
  return SavedLevel
}

// Handling of errors on stdout.
//
// It seems that sometimes at shutdown, if the node process is redirecting
// to a file, the pipe to that file is shutdown before node is finished,
// and then any subsequent writes to stdout/stderr will end up getting an
// error.
//
// So, at shutdown time only, should call `ignoreStreamError(true)` so that
// shutdown can continue, with the loss of logging, but at least the shutdown
// logic can proceed

// If passed with no arguments, return current setting.
// Otherwise set / unset the error handler.
