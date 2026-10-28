#!/usr/bin/env node

'use strict'

// read a list of <package> <version> lines from stdin, queue a certifyNG on them

const path = require('path')

const pDefer = require('p-defer')
const readline = require('readline')

const certifyNG = require('./certifyNG')
const utils = require('./lib/utils')
const concurrentRunner = require('./lib/concurrent-runner')

async function main ([env]) {
  if (env == null) help()

  const apiURL = utils.getApiUrl(env)
  console.log(`posting stdin to queue via ${apiURL}`)

  const packageVersions = await readPackageVersionsFromStdin()
  const certifyNGconc = concurrentRunner.create(20, certifyNG.main)

  for (let { name, version } of packageVersions) {
    certifyNGconc.run(env, name, version)
  }

  await certifyNGconc.done
}

async function readPackageVersionsFromStdin () {
  const deferred = pDefer()
  const packageVersions = []

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  })

  rl.on('line', (line) => {
    const parts = line.trim().split(' ')
    const name = parts[0]
    const version = parts[1] || '.'
    packageVersions.push({ name, version })
  })

  rl.on('close', () => {
    deferred.resolve(packageVersions)
  })

  return deferred.promise
}

function help () {
  console.log(`
${path.basename(__filename)} env

Reads lines of "package version" from stdin, queues them for certifyNG.
If version isn't specified, all versions of the package will be queued.

${utils.getEnvHelp()}
  `.trim())
  process.exit(1)
}

if (require.main === module) main(process.argv.slice(2))
