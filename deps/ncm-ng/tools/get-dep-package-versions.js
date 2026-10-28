#!/usr/bin/env node

// Pass package names as command-line arguments.
//
// Writes to stdout lines of `name version` for all the versions of those
// packages, and all the packages they depend on.
//
// Writes some diagnostic/status info to stderr.

'use strict'

const pDefer = require('p-defer')
const asyncLib = require('async')
const clientRequest = require('client-request/promise')

const Concurrency = 50
const Packuments = new Map()
const QueuedPackuments = new Set()

let Queued = 0
let Getting = 0

const DepsProperties = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
].slice(0, 1)

const PackumentQueue = asyncLib.queue(getPackument, Concurrency)

// main program
async function main (...packages) {
  for (let pkgName of packages) {
    if (pkgName === 'Top20') {
      for (let pkgName of Top20) {
        queuePackage(pkgName)
      }
      continue
    }

    if (pkgName === 'Top10') {
      for (let pkgName of Top10) {
        queuePackage(pkgName)
      }
      continue
    }

    queuePackage(pkgName)
  }

  // wait till queue is empty
  const done = pDefer()
  PackumentQueue.drain = function () {
    done.resolve()
  }

  await done.promise

  let packumentCount = 0
  let versionCount = 0

  for (let packument of Packuments.values()) {
    packumentCount++
    for (let version in packument.versions) {
      versionCount++
      console.log(`${packument.name} ${version}`)
    }
  }

  console.error(`packages: ${packumentCount}, versions: ${versionCount}`)
}

function queuePackage (pkgName, check) {
  if (check !== false) {
    if (QueuedPackuments.has(pkgName)) return
    QueuedPackuments.add(pkgName)
  }

  Queued++
  // console.error(`${Queued} queueing ${pkgName}`)
  PackumentQueue.push(pkgName)
}

function getPackument (pkgName, cb) {
  getPackumentAsync(pkgName, cb)
}

async function getPackumentAsync (pkgName, cb) {
  Getting++
  if (Getting % 100 === 0) {
    console.error(`getting packument ${Getting}/${Queued}`)
  }

  let url = `https://registry.npmjs.org/${pkgName}`

  const requestOptions = {
    uri: url,
    headers: {
      'accept': 'application/json'
    },
    json: true,
    timeout: 30 * 1000
  }

  try {
    var result = await clientRequest(requestOptions)
  } catch (err) {
    console.error(`error getting packument for ${pkgName}: ${err.message}`)
    if (err.message === 'read ECONNRESET') {
      console.error(`requeuing ${pkgName}`)
      queuePackage(pkgName, false)
    }
    return cb()
  }

  const packument = result.body

  Packuments.set(pkgName, packument)

  getDependentPackages(packument)

  cb()
}

// get all the packages that are dependencies of all versions in packument
function getDependentPackages (packument) {
  if (packument.versions == null) {
    console.error(`packument for ${packument.name} has no versions!`)
    return
  }

  for (let version of Object.keys(packument.versions)) {
    const packageVersion = packument.versions[version]
    for (let depProperty of DepsProperties) {
      const deps = packageVersion[depProperty]
      if (deps == null) continue

      const packages = Object.keys(deps)
      for (let pkgName of packages) {
        queuePackage(pkgName)
      }
    }
  }
}

const Top20 = `
  lodash
  request
  chalk
  react
  express
  commander
  async
  moment
  bluebird
  debug
  prop-types
  react-dom
  underscore
  fs-extra
  mkdirp
  uuid
  babel-runtime
  body-parser
  classnames
  glob
`
  .split('\n')
  .map(line => line.trim())
  .filter(line => line !== '')

const Top10 = Top20.slice(0, 10)

// run main
if (require.main === module) main.apply(null, process.argv.slice(2))
