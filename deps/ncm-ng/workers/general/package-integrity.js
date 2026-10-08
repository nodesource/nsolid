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
    packageInfo: 'npm package info'
  },
  output: {
    name: 'name of the package',
    version: 'version of the package',
    file: 'tarball file name',
    packageInfo: 'npm package info'
  }
})

const util = require('util')
const fs = require('fs')
const ssri = require('ssri') // 'Standard Sub-Resource Integrity'
const sha = require('sha')

const nsUtil = require('../../util')
const logger = nsUtil.logger.getLogger(__filename)

async function run (context, input) {
  if (!input.packageInfo.dist) {
    logger.error(`Integrity: ${input.name} ${input.version} has no 'dist' information!`)
    throw new Error('Integrity: no dist info')
  }

  let { integrity } = input.packageInfo.dist
  const { shasum } = input.packageInfo.dist

  if (integrity) {
    const fileStream = fs.createReadStream(input.file)
    const ssriCheck = ssri.checkStream(fileStream, integrity)

    try {
      await ssriCheck
      return input
    } catch (err) {
      if (err.code === 'EINTEGRITY') {
        throw new Error(`Integrity: SRI mismatch ${input.name} ${input.version} - npm: "${err.sri}" , ours: "${err.found}"`)
      } else {
        logger.error(`Integrity: unexpected SRI error on ${input.name} ${input.version}: ${err.message}`)
        throw err
      }
    }
  } else {
    logger.debug(`Integrity: no integrity field for ${input.name} ${input.version}`)
  }

  const hash = util.promisify(sha.get)
  const ourShasum = await hash(input.file, { algorithm: 'sha1' })
  const shasumValid = shasum === ourShasum
  if (!shasumValid) {
    throw new Error(`Integrity: shasum mismatch ${input.name} ${input.version} - shasum: ${shasum}, ours: ${ourShasum}`)
  }

  return input
}
