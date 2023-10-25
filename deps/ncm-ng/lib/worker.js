'use strict'

exports.create = create

const path = require('path')

const joi = require('joi')
const pDefer = require('p-defer')
const nsUtil = require('../util')

const validateSchema = require('./validate-schema')

const logger = nsUtil.logger.getLogger(__filename)

// create a new Worker instance
function create (blueprint) {
  // validations throw errors; fine as these should fail fast; eg. catastrophic
  validateSchema(`worker blueprint ${blueprint.fileName}`, blueprint, blueprintSchema)

  return new Worker(blueprint)
}

class Worker {
  constructor (blueprint) {
    this._blueprint = blueprint
    this.name = getWorkerName(blueprint.fileName)
    this.runFn = blueprint.run
    this.fileName = blueprint.fileName
    this.description = blueprint.description
    this.time = blueprint.time
    this.inputSchema = blueprint.input
    this.outputSchema = blueprint.output
    this.params = {}
  }

  // create a clone of the worker
  clone (options) {
    const clone = new Worker(this._blueprint)
    if (options.parameters) clone.params = options.parameters
    if (options.name) clone.name = options.name
    if (options.suffix) clone.name = `${clone.name}${options.suffix}`
    return clone
  }

  // create a clone of the worker
  cloneWithSuffix (suffix) {
    const clone = new Worker(this._blueprint)
    clone.name = `${clone.name}${suffix}`
    return clone
  }

  // run a worker within a given timeout, returning
  // { timeStart: Date, timeElapsed: number, error, output }
  async run (context, input, config) {
    const result = {
      timeStart: Date.now()
    }

    const { timeoutPromise, cancelTimeout } = createTimeoutPromise(this.time)

    logger.debug(`worker started: ${this}`)
    try {
      result.output = await Promise.race([
        this.runFn(context, input, config || {}, this.params),
        timeoutPromise
      ])
    } catch (err) {
      if (err === 'timeout') {
        logger.debug(`worker timeout: ${this}`)
        result.error = new Error(`${this.name} timed out after ${this.time}ms`)
        result.error.timedOut = true
      } else {
        logger.debug(err, `error running worker ${this}`)
        result.error = err
      }
      // Safety for tests.
      if (typeof context.cancel === 'function') {
        context.cancel() // set the cancelled state for the worker to see
      }
    } finally {
      cancelTimeout()
      result.timeElapsed = Date.now() - result.timeStart
      logger.debug(`worker complete: ${this} - ${result.timeElapsed}ms`)
    }

    return result
  }

  toString () {
    return `${this.name}`
  }
}

// Create a promise for a timeout, returning the promise and a timeout cancel fn
// When the timeout occurs, it rejects with the string 'timeout'
function createTimeoutPromise (ms) {
  if (typeof ms !== 'number') throw new Error('expecting ms parameter to be a number')

  const deferred = pDefer()
  const timeout = setTimeout(onTimeout, ms)

  return {
    timeoutPromise: deferred.promise,
    cancelTimeout: () => clearTimeout(timeout)
  }

  function onTimeout () {
    deferred.reject('timeout')
  }
}

// Generate a nice name for a worker; if we ever have workers that come
// from other packages, presumably we can prefix the name with the package.
// For now, returns path of worker filename, sans `.js`, up to parent dir
// named 'workers'.
function getWorkerName (fileName) {
  fileName = fileName.replace(/\.js$/, '')
  const originalFileName = fileName

  const parts = [path.basename(fileName)]

  fileName = path.dirname(fileName)
  while (true) {
    const baseName = path.basename(fileName)

    if (baseName === 'workers') return parts.join('/')
    if (baseName === 'worker-flows') return parts.join('/')
    if (baseName === 'test') {
      parts.unshift('test')
      return parts.join('/')
    }

    if (baseName === '') return originalFileName
    if (baseName === fileName) return originalFileName

    parts.unshift(baseName)
    fileName = path.dirname(fileName)
  }
}

// joi schema for the worker blueprint
const blueprintSchema = joi.object().keys({
  run: joi.func(),
  fileName: joi.string().required(),
  description: joi.string().required(),
  time: joi.number().required(),
  input: joi.object().required(),
  output: joi.object().optional(),
  params: joi.object().optional(),
  config: joi.object().optional()
})

exports.type = Worker
