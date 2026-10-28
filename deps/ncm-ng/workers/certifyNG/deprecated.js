'use strict'

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run,
  fileName: __filename,
  description: 'check npm package info for deprecated status',
  time: 3 * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    packageInfo: 'npm package info'
  },
  output: {
    certName: 'name of the cert',
    certData: 'data of the cert'
  }
})

async function run (context, input) {
  let deprecated = input.packageInfo.deprecated
  let deprecationInfo // === undefined, but standard won't let me make it explicit!

  // Cases to consider for deprecated: null-ish, string, boolean, everything else.
  // If it's boolean, nothing to do, properties will be set up as expected.
  // If it's unexpected, falls in the last block, we'll assume it's deprecated,
  // and set the deprecation info to the JSON.stringify()'d version of the value.
  if (deprecated == null) {
    deprecated = false
  } else if (typeof deprecated === 'string') {
    deprecationInfo = deprecated
    deprecated = true
  } else if (typeof deprecated !== 'boolean') {
    deprecationInfo = JSON.stringify(deprecated)
    deprecated = true
  }

  return Object.assign({}, input, {
    certName: 'deprecated',
    certData: { deprecated, deprecationInfo },
    worker: context.worker.name
  })
}
