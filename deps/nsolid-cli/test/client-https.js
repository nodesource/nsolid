'use strict'

const test = require('tape')
const Client = require('../lib/client')

const start = require('./mocks/apiserver-https')

test('client creation', (t) => {
  start(6750, (stop) => {
    const client = new Client('https://localhost:6750/api/', (err, c) => {
      t.notOk(err, 'no error')
      t.equals(client, c, 'returns client in onReady')
      stop(() => t.end())
    })
  })
})

test('client reuse', (t) => {
  start(6750, (stop) => {
    const client = new Client('https://localhost:6750/api/', (err, c) => {
      t.notOk(err, 'no error')
      t.equals(client, c, 'returns client in onReady')
    })

    client.run('foo', {}, (err, res, reply) => {
      t.error(err, 'no error')
      t.ok(res, 'has response object')
      t.equals(reply.toString(), '{"hello":"world"}')
    })

    client.run('nope', {}, (err, res, reply) => {
      t.ok(err instanceof Error, 'error (no command)')
      t.equals(err.message, 'Command \'nope\' not found in schema definition.', 'error is no command')
      t.notOk(res, 'no response object (did not attempt)')
      t.notOk(reply, 'no reply (did not attempt)')
    })

    client.run('foo', {body: 'FOO'}, (err, res, reply) => {
      t.ok(err instanceof Error, 'error (missing required param)')
      t.equals(err.message, 'Missing required param(s): [id]', 'error is correct')
      t.notOk(res, 'no response object (did not attempt)')
      t.notOk(reply, 'no reply (did not attempt)')
    })

    client.run('foo', {id: 'abc', body: 'FOO'}, (err, res, reply) => {
      t.error(err, 'no error')
      t.ok(res, 'has response object')
      t.equals(reply.toString(), '{"hello":"world"}')
    })

    client.flushed = () => { stop(() => t.end()) }
  })
})

test('keepalive', (t) => {
  start(6750, (stop) => {
    const client = new Client('https://localhost:6750/api/', (err, c) => {
      t.notOk(err, 'no error')
      t.equals(client, c, 'returns client in onReady')
    })

    client.run('bar', {}, (err, res, reply) => {
      t.error(err)
      let chunks = 0
      reply.on('data', (chunk) => {
        if (++chunks === 4) {
          t.ok(true, 'got some chunks')
          stop(() => t.end())
        }
      })
    })
  })
})

test('timeout', (t) => {
  start(6750, (stop) => {
    const client = new Client('https://localhost:6750/api/', (err, c) => {
      t.notOk(err, 'no error')
      t.equals(client, c, 'returns client in onReady')
    })

    client.run('slow', {timeout: 20}, (err, res, reply) => {
      t.ok(err, 'has error')
      t.equal(err.message, 'client request timeout', 'error is timeout')
      t.notOk(reply, 'no reply')
    })

    client.flushed = () => { stop(() => t.end()) }
  })
})
