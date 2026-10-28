'use strict'

exports.get = get

async function get (name, options) {
  return new MemoryQueue(name, options)
}

// implementation of an in-memory queue
class MemoryQueue {
  constructor (name, options) {
    this._name = name
    this._options = options
    this._messages = []
    this._readMessages = new Map()
    this._handle = 0
  }

  get buffered () {
    return 0
  }

  // post a message to the queue
  async post (message, options) {
    return this.postMulti([message], options)
  }

  // post multiple messages to the queue
  async postMulti (messages, options) {
    if (!Array.isArray(messages)) throw new Error('messages argument must be an array')
    if (messages.length === 0) return

    for (let message of messages) {
      this._handle++
      const item = {
        handle: this._handle,
        message: message
      }

      this._messages.push(item)
    }
  }

  // read a message from the queue
  async read (options) {
    if (this._messages.length === 0) return null

    const result = this._messages.shift()
    this._readMessages.set(result.handle, result)

    return result
  }

  // delete a previously read message
  async delete (handle) {
    const item = this._readMessages.get(handle)
    if (item == null) throw new Error(`item with handle ${handle} not available`)

    this._readMessages.delete(handle)
  }

  // get some queue statistics
  async getStats () {
    return {
      visible: this._messages.length,
      notVisible: this._readMessages.size
    }
  }

  // return string representation of this object
  toString () {
    return `${this.constructor.name}[${this._name}]`
  }
}
