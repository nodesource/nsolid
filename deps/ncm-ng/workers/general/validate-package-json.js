'use strict'

const COMMAND_TIMEOUT_SECONDS = 10

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run,
  fileName: __filename,
  description: 'verify packument signatures against a tarball',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    file: 'tarball file name',
    dir: 'unpacked tarball directory',
    packageInfo: 'npm package info'
  },
  output: {
    name: 'name of the package',
    version: 'version of the package',
    file: 'tarball file name',
    dir: 'unpacked tarball directory',
    packageInfo: 'npm package info',
    packageJson: 'package.json'
  }
})

const path = require('path')
const util = require('util')
const fs = require('fs')

const fsPromises = {
  readFile: util.promisify(fs.readFile)
}

const nsUtil = require('../../util')
const logger = nsUtil.logger.getLogger(__filename)

// Check that we can parse the package.json. If we can't, the package is kinda 'broken'.
//
// Also use this to parse the package.json only one and send it to downstream workers.
async function run (context, input) {
  const packageJsonPath = path.join(input.dir, 'package.json')
  const rawJson = await fsPromises.readFile(packageJsonPath, 'utf8')

  let packageJson
  try {
    packageJson = JSON.parse(rawJson)
  } catch (err) {
    logger.debug(rawJson)
    throw new Error(`${err.message} package.json parse failure ${input.name} ${input.version}`)
  }

  return Object.assign({}, input, { packageJson })
}
