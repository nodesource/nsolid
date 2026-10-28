'use strict'

exports.create = create

const asyncLib = require('async')

// Takes an async fn as input, returns a new fn which will call the original.
// The new function when invoked, will be queued to run, with the
// specified number of concurrent workers running them.

// Note: throws away results of calling the function, and only crudely
// reports errors rejected from the original function, to the console.
function create (concurrency, fn) {
  return new ConcurrentRunner(concurrency, fn)
}

class ConcurrentRunner {
  constructor (concurrency, fn) {
    const fnName = fn.name || 'anonymous'
    const queue = asyncLib.queue(queueWorker, concurrency)

    let doneResolver
    this.donePromise = new Promise(resolve => {
      doneResolver = resolve
    })

    queue.drain = () => {
      queue.kill()
      doneResolver()
    }

    this.runFn = async function (...args) {
      queue.push({ args })
    }

    function queueWorker ({ args }, cb) {
      setImmediate(async () => {
        try {
          await fn(...args)
        } catch (err) {
          console.error(`concurrent runner ${fnName} threw ${err.message}`)
        } finally {
          cb()
        }
      })
    }
  }

  // returns a promise when the last queue entry has run
  get done () { return this.donePromise }

  // returns a function which queues the request
  get run () { return this.runFn }
}

// run as main for example
if (require.main === module) main()

// example usage
async function main () {
  const runner = create(3, runOnce)

  for (let i = 0; i < 10; i++) {
    runner.run(i, i * i)
  }

  return runner.done
}

// the function that will be queued to run
async function runOnce (i, j) {
  console.log(i, j)

  let finishedResolver
  const finishedPromise = new Promise(resolve => {
    finishedResolver = resolve
  })

  setTimeout(finishedResolver, 1000)

  return finishedPromise
}
