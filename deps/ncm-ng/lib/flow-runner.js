'use strict'

// run a worker-flow object

exports.runFlow = runFlow

const tmp = require('tmp')
const pDefer = require('p-defer')
const nsUtil = require('../util')

const Flow = require('./flow')
const Context = require('./context')
const Config = require('./config')
const localTmp = require('./local-tmp-dir')
const cache = require('./cache')
const { getScores } = require('./default-scorer')

const logger = nsUtil.logger.getLogger(__filename)

// run a flow in-process
async function runFlow (flowName, input, config, isStrictMode) {
  const flow = Flow.getFlowNamed(flowName)
  if (flow == null) throw new Error(`flow not found: '${flowName}'`)

  const flowRunner = new FlowRunner(flow)

  return flowRunner.runFlow(input, config, isStrictMode)
}

// class to handle the running of a flow
class FlowRunner {
  constructor (flow) {
    this.flow = flow
    this.deferredDone = pDefer()
    this.runningWorkers = new Set()
    this.context = Context.createFlowContext(this.flow)
    this.result = {
      timeStart: null,
      timeElapsed: null,
      workers: {}
    }
  }

  toString () {
    return `${this.flow.name} ${this.context.id}`
  }

  // run the flow, returning promise on completion or error
  async runFlow (input, config, silentFlow) {
    Config.initStatic(config)

    logger.debug(`runFlow(${this})`)

    var tmpPath
    // create tmp dir, add dir to context
    logger.debug(`creating tmp directory for flow ${this}`)
    if (config.TMP_PATH) {
      tmpPath = (await localTmp(config.TMP_PATH)).tmpPath
    } else {
      /* eslint-disable-next-line no-redeclare */
      tmpPath = (await tmpDirP(this.flow.name)).tmpPath
    }
    this.context.data.tmpPath = tmpPath

    // kick it off by running the initial steps
    if (!silentFlow) {
      logger.info(`starting flow ${this}`)
    }

    this.result.timeStart = this.context.startTimer()
    this.runSteps(input, config, this.flow.steps.children)

    try {
      await this.deferredDone.promise
    } finally {
      this.result.timeElapsed = this.context.stopTimer()
      this.result.timeStart = this.result.timeStart.toISOString()
    }

    const scores = await getScores(input.name, input.version, cache[input.name])
    return scores
  }

  // run the specified steps
  runSteps (input, config, steps) {
    for (let step of steps) {
      // note this is an async method, but we don't want to await on it!
      this.runStep(input, config, step)
    }
  }

  // run the specified step
  async runStep (input, config, step) {
    const worker = step.action
    const context = this.context.createWorkerContext(worker)
    const result = {
      timeStart: null,
      timeElapsed: null
    }

    // add to running steps
    this.runningWorkers.add(step)

    result.timeStart = context.startTimer()

    // try running the worker, shouldn't throw, but just in case ...
    let workerResult
    let error
    try {
      workerResult = await worker.run(context, input, config)
    } catch (err) {
      logger.error(err, `unexpected error running worker ${worker}`)
      error = err
    }

    // assign error from call or invocation
    error = error || workerResult.error

    if (error != null) {
      result.error = error.message
      if (error.timedOut === true) result.timedOut = true
    }

    result.timeElapsed = context.stopTimer()
    result.timeStart = result.timeStart.toISOString()

    this.result.workers[worker.name] = result

    // remove from running steps
    this.runningWorkers.delete(step)

    // on error, resolve with error
    if (error != null) {
      this.err = result.error
      return this._resolveWhenFinished()
    }

    // on success, call next steps
    this.runSteps(workerResult.output, config, step.children)

    // if no steps were run, we may be finished
    if (step.children.length === 0) this._resolveWhenFinished()
  }

  // resolve the final promise when applicable
  _resolveWhenFinished () {
    if (this.runningWorkers.size === 0) return this.deferredDone.resolve(this)
  }
}

function tmpDirP (flowName) {
  const deferred = pDefer()

  // replace non-word char with _ ; non-word char: [^A-Za-z0-9_]
  flowName = flowName.replace(/\W/g, '_')
  const tmpOpts = {
    unsafeCleanup: true,
    prefix: `ncm-worker-${flowName}`
  }

  tmp.dir(tmpOpts, (err, tmpPath, tmpCleanupFn) => {
    if (err) return deferred.reject(new Error(`error getting tmp directory: ${err}`))

    deferred.resolve({ tmpPath, tmpCleanupFn })
  })

  return deferred.promise
}
