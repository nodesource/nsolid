'use strict'

exports.addWorkerTimings = addWorkerTimings
exports.log = log

const SERIES = 500

const statsLite = require('stats-lite')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

const WorkerArrays = new Map()

function addWorkerTimings (workerTimings) {
  for (let [workerName, elapsed] of workerTimings) {
    const workerArray = getWorkerArray(workerName)

    workerArray.push(elapsed)
    trim(workerArray)
  }
}

function log () {
  for (let workerName of WorkerArrays.keys()) {
    const array = WorkerArrays.get(workerName)

    const mean = Math.round(statsLite.mean(array))
    const min = Math.min.apply(Math, array)
    const max = Math.max.apply(Math, array)

    logger.info(`worker timings for ${workerName}: mean: ${mean} min: ${min} max: ${max}`)
  }
}

function trim (array) {
  while (array.length > SERIES) array.shift()
}

function getWorkerArray (workerName) {
  let result = WorkerArrays.get(workerName)
  if (result != null) return result

  result = []
  WorkerArrays.set(workerName, result)
  return result
}
