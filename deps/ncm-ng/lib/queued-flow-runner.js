'use strict'

// run a worker-flows via a queue

exports.create = create

const WAIT_IDLE_QUEUE_MS = 5 * 1000
const WAIT_AVAILABLE_WORKER_MS = 1 * 1000
const WAIT_QUEUE_READ_ERROR_MS = 5 * 1000

const pDefer = require('p-defer')

const json = require('./json')
const Config = require('./config')
const FixedSizePool = require('./fixed-size-pool')
const FlowInvokers = require('./flow-invokers')
const workerStats = require('./worker-stats')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

function create (options) {
  return new QueuedFlowRunner(options)
}

class QueuedFlowRunner {
  constructor (options) {
    this._name = options.name
    this._queue = options.queue
    this._running = false

    this._flowPool = FixedSizePool.create(`${this._name}-flows`)

    // use setter to set
    this.concurrency = options.concurrency

    this._flowInvoker = getFlowInvoker(options.flowInvoker)

    // bind the queue reader to make it easier to use w/ setImmediate, etc
    this._handleNextQueueMessage = this._handleNextQueueMessage.bind(this)
  }

  get isRunning () { return this._running }
  get concurrency () { return this._flowPool.maxSize }
  set concurrency (value) { this._flowPool.maxSize = value }

  toString () {
    return this._name
  }

  // start the queue runner
  start () {
    if (this.isRunning) {
      return logger.warn(`attempt to start queue runner, but already running: ${this}`)
    }

    this._running = true

    setImmediate(this._handleNextQueueMessage)
  }

  // stop the queue runner; returns when last flow is finished
  async stop () {
    if (!this.isRunning) {
      return logger.warn(`attempt to stop queue runner, but already stopped: ${this}`)
    }

    this._running = false

    const deferred = pDefer()

    const flowPool = this._flowPool
    const checkForEmptyPoolInterval = setInterval(checkForEmptyPool, 500)

    return deferred.promise

    function checkForEmptyPool () {
      if (!flowPool.isEmpty) return

      clearInterval(checkForEmptyPoolInterval)
      deferred.resolve()
    }
  }

  // This method is used to read the next queue entry and handle it, but only
  // if there is availability in the pool.
  async _handleNextQueueMessage () {
    if (!this.isRunning) return

    logger.debug(`starting handling of next queue message; available workers: ${this._flowPool.available}`)

    // if there's not room, try again in a bit
    if (!this._flowPool.isAvailable) {
      logger.debug('skipping queue read since pool is busy')
      setTimeout(this._handleNextQueueMessage, WAIT_AVAILABLE_WORKER_MS).unref()
      return
    }

    const flowObject = {}

    // add it to the pool
    flowObject.poolId = this._flowPool.add(flowObject)

    // unexpected! object could not be added to the pool
    if (flowObject.poolId == null) {
      logger.error(`error adding flow to pool`)
      setTimeout(this._handleNextQueueMessage, WAIT_QUEUE_READ_ERROR_MS).unref()
      return
    }

    // try to read something from the queue, on error, try again in a bit
    try {
      var queueMessage = await this._queue.read()
    } catch (err) {
      logger.error(`error reading queue: ${this}: ${err.message}`)
      this._flowPool.delete(flowObject.poolId)
      setTimeout(this._handleNextQueueMessage, WAIT_QUEUE_READ_ERROR_MS).unref()
      return
    }

    // if queue empty, try again in a bit
    if (queueMessage == null) {
      logger.debug('queue is empty')
      this._flowPool.delete(flowObject.poolId)
      setTimeout(this._handleNextQueueMessage, WAIT_IDLE_QUEUE_MS).unref()
      return
    }

    // schedule next check
    setImmediate(this._handleNextQueueMessage)

    // we got something, so run it!
    setImmediate(() => this._runQueueMessage(flowObject, queueMessage))
  }

  async _runQueueMessage (flowObject, queueMessage) {
    const config = Config.get()
    const message = queueMessage.message

    let error

    switch (message.type) {
      case 'run-flow':
        const payload = message.payload || {}
        flowObject.flowName = payload.flowName
        flowObject.input = payload.input
        flowObject.config = config
        flowObject.parameters = payload.parameters

        try {
          await this._runFlow(flowObject)
        } catch (err) {
          error = err
          logger.error(`error running flow: ${this}: ${err.message}`)
        }
        break

      default:
        logger.error(`unhandleable queue message ${this}: ${message.type}`)
    }

    // don't delete the queue message if an error occurred, let it retry
    if (error == null) {
      try {
        await this._queue.delete(queueMessage.handle)
      } catch (err) {
        logger.error(`error deleting message from queue: ${err.message}`)
      }
    }
  }

  async _runFlow (flowObject, queueMessage) {
    let result = null
    const { flowName, input, config, parameters } = flowObject

    const messageSubject = `${flowName} ${json.lineify(input)}`
    logger.debug(`_runFlow starting ${messageSubject}`)

    try {
      result = await this._flowInvoker.invoke(flowName, input, config, parameters)
    } catch (err) {
      logger.error(err, `_runFlow error invoking flow ${messageSubject}`)
      throw err
    } finally {
      this._flowPool.delete(flowObject.poolId)
    }

    let successes = 0
    const errors = []
    const timeouts = []
    const workerTimings = []

    for (let workerName of Object.keys(result.workers)) {
      const workerResult = result.workers[workerName]

      workerTimings.push([workerName, workerResult.timeElapsed])

      if (workerResult.timedOut === true) {
        timeouts.push(workerName)
      } else if (workerResult.error != null) {
        errors.push({
          worker: workerName,
          message: workerResult.error
        })
      } else {
        successes++
      }
    }

    workerStats.addWorkerTimings(workerTimings)

    logger.debug(`_runFlow complete ${messageSubject} elapsed: ${result.timeElapsed} successes: ${successes} timeouts: ${timeouts.length} errors: ${errors.length}`)

    for (let worker of timeouts) {
      logger.error(`_runFlow timeout ${messageSubject} timeout: ${worker}`)
    }

    for (let error of errors) {
      logger.error(`_runFlow error ${messageSubject} worker: ${error.worker} error: ${error.message}`)
    }

    logger.debug(`_runFlow result ${messageSubject} ${JSON.stringify(result, null, 4)}`)

    return result
  }
}

function getFlowInvoker (name) {
  const FlowInvokerClass = FlowInvokers[name]
  if (FlowInvokerClass == null) throw new Error(`unsupported flow invoker: ${name}`)

  const createFn = FlowInvokerClass.create
  if (createFn == null) throw new Error(`flow invoker has no create function: ${name}`)

  return createFn()
}
