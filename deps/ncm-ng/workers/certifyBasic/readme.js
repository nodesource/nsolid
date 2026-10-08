'use strict'

const COMMAND_TIMEOUT_SECONDS = 5

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run: run,
  fileName: __filename,
  description: 'get the readme for a package/version',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    dir: 'unpacked tarball directory'
  },
  output: {
    certName: 'name of the cert',
    certData: 'data of the cert'
  }
})

const fs = require('fs')
const path = require('path')
const util = require('util')

const nsUtil = require('../../util')

const logger = nsUtil.logger.getLogger(__filename)
const fsPromises = {
  stat: util.promisify(fs.stat),
  readdir: util.promisify(fs.readdir),
  readFile: util.promisify(fs.readFile)
}

async function run (context, input) {
  // npm matches anything that has 'readme' in the name and takes the first (valid?) item.

  let files = []
  try {
    files = await fsPromises.readdir(input.dir)
  } catch (err) {
    logger.error(`error running fs.readdir("${input.dir}": ${err}`)
  }

  let readmeFile
  let readmeFileSize = readmeFile || null
  for (const fileName of files) {
    if (fileName.toLowerCase().includes('readme')) {
      const filePath = path.join(input.dir, fileName)

      let stats
      try {
        stats = await fsPromises.stat(filePath)
      } catch (err) {
        logger.error(`error running fs.stat("${fileName}": ${err}`)
        continue
      }

      if (stats.isFile()) {
        logger.debug(`Found 'readme' file: ${fileName}`)
        readmeFileSize = stats.size
        readmeFile = await fsPromises.readFile(filePath)
        break
      } else {
        logger.debug(`${fileName} was not a file. Directory? ${stats.isDirectory()}`)
      }
    }
  }

  const hasReadme = typeof readmeFileSize === 'number' && Number.isFinite(readmeFileSize)
  const certData = {
    hasReadme
  }
  if (hasReadme) {
    certData.size = readmeFileSize
  }

  return Object.assign({}, input, {
    certName: 'readme',
    certData,
    worker: context.worker.name
  })
}
