'use strict'

const util = require('util')

const mkdirpP = util.promisify(require('mkdirp'))
const rimraf = require('rimraf')
const rimrafP = util.promisify(rimraf)

module.exports = localTmp

async function localTmp (tmpPath) {
  const rmOpts = {
    glob: false
  }

  try {
    await mkdirpP(tmpPath)
  } catch (_) {}

  return { tmpPath, tmpCleanupFn: () => {} }
}
