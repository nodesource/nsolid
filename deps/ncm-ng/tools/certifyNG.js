#!/usr/bin/env node

'use strict'

// run the certifyNG flow for a package/version

exports.main = main

const path = require('path')

const clientRequest = require('client-request/promise')

const utils = require('./lib/utils')
const queueFlow = require('./queue-flow')
const ConcurrentRunner = require('./lib/concurrent-runner')

async function main (env, name, version) {
  if (env == null || name == null || version == null) help()

  let versions
  if (version !== '.') {
    versions = [ version ]
  } else {
    const packument = await getPackument(name)
    versions = Object.keys(packument.versions)
  }

  const concurrentRunner = ConcurrentRunner.create(50, queueFlow.main)
  for (let version of versions) {
    concurrentRunner.run(env, 'certifyNG', { name, version })
  }

  await concurrentRunner.done
}

async function getPackument (pkgName) {
  let url = `https://registry.npmjs.org/${pkgName}`

  const requestOptions = {
    uri: url,
    headers: { 'accept': 'application/json' },
    json: true,
    timeout: 30 * 1000
  }

  try {
    var result = await clientRequest(requestOptions)
  } catch (err) {
    throw new Error(`error getting packument for ${pkgName}: ${err.message}`)
  }

  return result.body
}

function help () {
  console.log(`
${path.basename(__filename)} env package version

Run the certifyNG flow for the specified package/version on the specified env.

If you specify "." as the version, all versions of the package will be certifed.

${utils.getEnvHelp()}
  `.trim())
  process.exit(1)
}
