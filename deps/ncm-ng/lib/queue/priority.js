'use strict'

exports.get = get

// return an object representing a priority queue - which is really multiple
// explicit queues suffixed P0 ... Px (where x === levels - 1)
async function get (name, queues, options) {
  return new PriorityQueue(name, queues, options)
}

// implementation of a priority queue
class PriorityQueue {
  constructor (name, queues, options) {
    this._name = name
    this._queues = queues
    this._levels = queues.length
    this._options = options

    // default priority is the middle one, or just below for even
    this._defaultPriority = Math.floor(queues.length / 2)
  }

  get buffered () {
    // get buffered values for each queue
    const buffered = this._queues.map(queue => queue.buffered)

    // return sum of that
    return buffered.reduce((acc, el) => acc + el, 0)
  }

  // post a message to the queue; `priority` is an option
  async post (message, options) {
    return this.postMulti([message], options)
  }

  // post multiple messages to the queue
  async postMulti (messages, options = {}) {
    if (!Array.isArray(messages)) throw new Error('messages argument must be an array')
    if (messages.length === 0) return

    // calculate priority
    let priority = options.priority

    if (typeof priority !== 'number') priority = this._defaultPriority
    if (priority < 0) priority = 0
    if (priority >= this._levels) priority = this._levels - 1

    const queue = this._queues[priority]

    return queue.postMulti(messages, options)
  }

  // read a message from the queue
  // Note that the early read on buffered messages, means that if 10 messages
  // are buffered are P1, then those will end up all being returned before
  // P0 is read.  That should be fine, and will improve general throughput
  // (not having to wait for the P0 read, which will nearly always be empty).
  // The limit on buffering is currently the maxReceive length, which is 10.
  async read (options) {
    // see if any queue has buffered messages, if so, read from it first
    for (let queue of this._queues) {
      if (queue.buffered === 0) continue

      const result = await queue.read(options)
      if (result != null) {
        return readResult(queue, result)
      }
    }

    // nothing buffered? check each queue in order
    for (let queue of this._queues) {
      const result = await queue.read(options)
      if (result != null) {
        return readResult(queue, result)
      }
    }

    return null

    function readResult (queue, result) {
      return {
        handle: { queue: queue, handle: result.handle },
        message: result.message
      }
    }
  }

  // delete a previously read message
  async delete (handle) {
    const queue = handle.queue

    await queue.delete(handle.handle)
  }

  // get some queue statistics
  async getStats () {
    const finalResult = {
      visible: 0,
      notVisible: 0
    }

    for (let queue of this._queues) {
      const result = await queue.getStats()
      finalResult.visible += result.visible
      finalResult.notVisible += result.notVisible
    }

    return finalResult
  }

  // return string representation of this object
  toString () {
    return `${this.constructor.name}[${this._name}]`
  }
}
