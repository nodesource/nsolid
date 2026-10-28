'use strict'

exports.createFlowContext = createFlowContext

// A context is created for each flow that's run, and one for each worker
// that gets run.  The `data` property in a flow is shallow-copied into
// it's worker contexts.  Flow and Worker contexts have some of their own
// particular properties / methods.

const uuid = require('uuid')

function createFlowContext (flow) {
  return new FlowContext(flow)
}

class Context {
  constructor () {
    this.id = uuid.v4().substring(0, 7)
    this.data = {}
    this.timeStart = null
    this.timeStop = null
    this.timeElapsed = null
  }

  // starts the timer
  startTimer () {
    this.timeStart = new Date()

    return this.timeStart
  }

  // stops the timer, returns elapsed
  stopTimer () {
    this.timeStop = new Date()
    this.timeElapsed = this.timeStop.getTime() - this.timeStart.getTime()

    return this.timeElapsed
  }
}

class FlowContext extends Context {
  constructor (flow) {
    super()

    this.flow = flow
  }

  // return a new context for a worker, with a new top-level worker property
  createWorkerContext (worker) {
    return new WorkerContext(this, worker)
  }
}

class WorkerContext extends Context {
  constructor (flowContext, worker) {
    super()

    this.flowContext = flowContext
    this.worker = worker

    this.data = Object.assign({}, this.flowContext.data)

    this._cancelled = false
  }

  isCancelled () {
    return this._cancelled
  }

  cancel () {
    this._cancelled = true
  }
}
