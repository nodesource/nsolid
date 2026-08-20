'use strict'

const COMMAND_TIMEOUT_SECONDS = 10

const worker = require('../../lib/worker')

const fs = require('fs')
const path = require('path')
const map = require('map-async')

const res = {}

function stats (dir, options, callback) {
  dir = path.resolve(dir)
  fs.lstat(dir, afterLstat)

  function afterLstat (err, stat) {
    if (err) {
      return callback(err)
    }

    if (!stat) {
      return callback(null, 0)
    }

    const { pkg } = options
    let size = options.disk ? (512 * stat.blocks) : stat.size

    res[pkg] = res[pkg] || {}

    if (stat.isFile()) {
      if (res[pkg].files) {
        res[pkg].files++
      } else {
        res[pkg].files = 1
      }
    } else {
      if (res[pkg].dir) {
        res[pkg].dir++
      } else {
        res[pkg].dir = 1
      }
    }

    if (!stat.isDirectory()) {
      return callback(null, size)
    }

    fs.readdir(dir, afterReaddir)

    function afterReaddir (err, list) {
      if (err) {
        return callback(err)
      }

      map(
        list.map((f) => path.join(dir, f)),
        (f, callback) => stats(f, options, callback),
        (err, sizes) => callback(err, sizes && sizes.reduce((p, s) => p + s, size), res[pkg])
      )
    }
  }
}

function getStats (dir, options, callback) {
  if (typeof options !== 'object') {
    callback = options
    options = {}
  }

  if (typeof callback === 'function') {
    return stats(dir, options, callback)
  }

  return new Promise((resolve, reject) => {
    callback = (err, data, res) => {
      if (err) {
        return reject(err)
      }
      resolve({ size: data, res })
    }

    stats(dir, options, callback)
  })
}

exports.worker = worker.create({
  run: run,
  fileName: __filename,
  description: 'get disk usage for a package/version',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    file: 'tarball file name',
    dir: 'unpacked tarball directory',
    unpackedSizeBytes: 'size of all unpacked filesystem entries',
    packageFileCount: 'count of all files when unpacked'
  },
  output: {
    certName: 'name of the cert',
    certData: 'data of the cert'
  }
})

async function run (context, input) {
  const { size: expandedSize, res: { files: fileCount, dir: dirCount } } = await getStats(input.dir, { pkg: input.dir.replace(/[^\w\s]/gi, '') })
  return Object.assign({}, input, {
    certName: 'diskUsage',
    certData: { expandedSize, fileCount, dirCount: Math.max(dirCount - 1, 0) },
    worker: context.worker.name
  })
}
