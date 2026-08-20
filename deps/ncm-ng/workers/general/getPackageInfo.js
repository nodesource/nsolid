'use strict'

const FETCH_TIMEOUT_SECONDS = 90
const COMMAND_TIMEOUT_SECONDS = FETCH_TIMEOUT_SECONDS + 30

const worker = require('../../lib/worker')
const { promisify } = require('util')
const { readFile } = require('fs')

exports.worker = worker.create({
  run,
  fileName: __filename,
  description: 'generate npm package info from a specific local module and version',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package'
  },
  output: {
    name: 'name of the package',
    version: 'version of the package',
    packument: 'npm packument',
    packageInfo: 'npm package info',
    file: 'tarball file name',
    dir: 'target directory'
  }
})

async function run (context, input, config) {
  const read = promisify(readFile)
  const packageInfo = JSON.parse(await read(`${input.dir}/package.json`, { encoding: 'utf8' }))
  let readme = ''
  try {
    readme = await read(`${input.dir}/README.md`, { encoding: 'utf8' })
  } catch (err) {}
  const packument = { readme, ...packageInfo }

  return Object.assign({}, input, {
    packument,
    packageInfo,
    dir: input.dir
  })
}
