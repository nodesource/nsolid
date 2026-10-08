'use strict'

// Entrypoint to get access to a queue. Queues have the same basic signature:
//
// async post(message, options) -> undefined
// async read(options) -> {handle: handle; message: anObject}
// async delete(handle) -> undefined
// async getStats() -> {visible: anInteger: notVisible: anInteger}
//
// Messages posted and read are JSON-able objects.  After a message is read(),
// the handle must be passed to delete() when the message is fully processed.
// A priority queue can be passed a `priority: anInteger` option during post,
// to indicate which priority to post (0 is highest; default is lowest).

const memory = require('./memory')
const priority = require('./priority')

const MEMORY_PREFIX = 'memory:'

exports.get = get
exports.getPriority = getPriority
exports.MEMORY_PREFIX = MEMORY_PREFIX

// return an object representing a queue - either in memory or sqs
async function get (name, options) {
  name = name.substr(MEMORY_PREFIX.length)
  return memory.get(name, options)
}

// return an object representing a priority queue
async function getPriority (name, queues) {
  return priority.get(name, queues)
}
