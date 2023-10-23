#!/usr/bin/env node

// Pass count and gzemnid stats.json file name as command-line arguments.
//
// Writes to stdout lines of package names for all the most <count> most
// downloaded packages and all their deps for their latest version.
//
// Writes some diagnostic/status info to stderr.

'use strict'

const fs = require('fs')
const util = require('util')

const clientRequest = require('client-request/promise')

const concurrentRunner = require('./lib/concurrent-runner')

const Concurrency = 20

const fsReadFile = util.promisify(fs.readFile)
const processPackageConc = concurrentRunner.create(Concurrency, processPackage)

let DownloadStats = {}
let AllPackages = new Set()
let Processed = 0

// main program
async function main (countArg, statsFile) {
  const count = parseInt(countArg, 10)
  if (isNaN(count)) {
    console.error('first argument count must be a number')
    process.exit(1)
  }

  const pkgNames = await getTopPackages(count, statsFile)

  AllPackages = new Set(pkgNames)

  for (let pkgName of pkgNames) {
    processPackageConc.run(pkgName)
  }

  await processPackageConc.done

  AllPackages = Array.from(AllPackages).sort(sortPackagesByDownload)

  for (let pkgName of AllPackages) {
    console.log(pkgName)
  }

  console.error(`total package count: ${AllPackages.length}`)
}

async function processPackage (pkgName) {
  Processed++
  if (Processed % 100 === 0) console.error(`processed ${Processed} / ${AllPackages.size}`)

  try {
    var packument = await getPackument(pkgName)
  } catch (err) {
    return console.error(`error getting packument for ${pkgName} - ${err.message}`)
  }

  if (packument == null) {
    return console.error(`null packument for ${pkgName}`)
  }

  for (let depPkgName of getDependentPackages(packument)) {
    if (AllPackages.has(depPkgName)) continue

    // console.error(`adding dep ${depPkgName}`)
    AllPackages.add(depPkgName)
    processPackageConc.run(pkgName)
  }
}

async function getPackument (pkgName) {
  let url = `https://registry.npmjs.org/${pkgName}`

  const requestOptions = {
    uri: url,
    headers: {
      'accept': 'application/json'
    },
    json: true,
    timeout: 60 * 1000
  }

  const result = await clientRequest(requestOptions)

  return result.body
}

// get all the packages that are dependencies of all versions in packument
function getDependentPackages (packument) {
  const result = new Set()
  const pkgName = packument.name

  const distTags = packument['dist-tags']
  if (distTags == null) {
    console.error(`dist-tags null for ${pkgName}`)
    return result
  }

  const latest = distTags.latest
  if (latest == null) {
    console.error(`dist-tags latest null for ${pkgName}`)
    return result
  }

  const packageVersion = packument.versions[latest]
  if (packageVersion == null) {
    console.error(`no version record for dist-tags latest ${latest} for ${pkgName}`)
    return result
  }

  for (let depProperty of DepsProperties) {
    const deps = packageVersion[depProperty]
    if (deps == null) continue

    const packages = Object.keys(deps)
    for (let depPkgName of packages) {
      // console.error(`add ${pkgName} ${depProperty} ${depPkgName}`)
      result.add(depPkgName)
    }
  }

  return result
}

async function getTopPackages (count, statsFile) {
  try {
    var content = await fsReadFile(statsFile, 'utf8')
  } catch (err) {
    console.error(`error reading stats file '${statsFile}' - ${err.message}`)
    process.exit(1)
  }

  try {
    DownloadStats = JSON.parse(content)
  } catch (err) {
    console.error(`stats file '${statsFile}' is not JSON`)
    process.exit(1)
  }

  const allPackageNames = Object.keys(DownloadStats)

  allPackageNames.sort(sortPackagesByDownload)

  return allPackageNames.slice(0, count)
}

function sortPackagesByDownload (a, b) {
  const downloadsA = DownloadStats[a] || -1
  const downloadsB = DownloadStats[b] || -1

  // if comparing scoped packages, compare by file name
  if (downloadsA === -1 && downloadsB === -1) {
    return a.localeCompare(b)
  }

  return downloadsB - downloadsA
}

const DepsProperties = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
]

// run main
if (require.main === module) main(...process.argv.slice(2))
