'use strict'

// invokes a flow via child_process.fork()

exports.create = create

const path = require('path')
const childProcess = require('child_process')

const pDefer = require('p-defer')

const FlowInvoker = require('./flow-invoker-base')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

function create (options) {
  return new ProcessFlowInvoker(options)
}

class ProcessFlowInvoker extends FlowInvoker {
  invoke (flowName, input, config, parameters) {
    const deferred = pDefer()
    let resolved = false

    const mainModule = path.join(__dirname, 'process-main.js')
    const options = { execArgv: fixExecArgv() }
    const forkedProcess = childProcess.fork(mainModule, [], options)

    forkedProcess.on('error', (err) => {
      logger.error(err, `error running flow`)
      deferred.reject(err)
    })

    forkedProcess.on('exit', (code, signal) => {
      if (resolved) return

      const err = new Error(`flow exited: ${code} ${signal}`)
      err.code = code
      err.signal = signal

      logger.error(err, err.message)
      deferred.reject(err)
    })

    forkedProcess.on('message', (message) => {
      resolved = true
      logger.debug(`message received: ${JSON.stringify(message, null, 4)}`)
      deferred.resolve(message)
    })

    forkedProcess.send({ flowName, input, config, parameters })

    return deferred.promise
  }
}

// Fix execArgv to remove `--inspect*` options in process.execArgv.
// Otherwise, if the invoker is being debugged, it's `--inspect*` arg is
// passed to the forked process, and you'll get an error with code 12.
function fixExecArgv () {
  return process.execArgv
    .filter(arg => !arg.startsWith('--inspect'))
}
