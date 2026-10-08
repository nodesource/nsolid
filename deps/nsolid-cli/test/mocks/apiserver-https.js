'use strict'

const https = require('https')
const { readFileSync } = require('fs')
const { resolve } = require('path')

module.exports = start

process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0

const options = {
  key: readFileSync(resolve(__dirname, '..', 'etc', 'nsolid-self-signed.key')),
  cert: readFileSync(resolve(__dirname, '..', 'etc', 'nsolid-self-signed.crt'))
}

const schema = {
  'foo': {
    'GET': {
      response: 'json',
      params: [],
      required: [],
      keepalive: false
    },
    'POST': {
      response: 'json',
      params: ['id'],
      required: ['id'],
      keepalive: false
    }
  },
  'bar': {
    'GET': {
      response: 'streaming:blah',
      params: [],
      required: [],
      keepalive: true
    }
  },
  'slow': {
    'GET': {
      response: 'json',
      params: [],
      required: [],
      keepalive: false
    }
  }
}

function start (port, ready) {
  const intervals = []
  const server = https.createServer(options, (req, res) => {
    console.log(`mock 4.x server handling ${req.url}`)
    let uri = req.url.split('?')[0]
    switch (uri) {
      case '/api/':
        return res.end('{"versions":{"program":"4.0.0-pre","api":["4"]}}\n')
      case '/api/v4/schema':
        return res.end(JSON.stringify(schema))
      case '/api/v4/foo':
        return res.end(JSON.stringify({hello: 'world'}))
      case '/api/v4/bar':
        const i = setInterval(() => {
          res.write('MORE\n')
        }, 10)
        intervals.push([i, res])
        return
      case '/api/v4/slow':
        return setTimeout(() => {
          res.end('{"slow":"reply"}')
        }, 50)
      default:
        return res.end(`ERROR unrecognized url ${req.url}\n`)
    }
  })

  console.log('starting 4.x mock server')

  server.listen(port, () => {
    ready(once((cb) => {
      intervals.forEach((tuple) => {
        clearInterval(tuple[0])
        tuple[1].end()
      })
      server.close(() => {
        cb()
      })
    }))
  })
}

function once (cb) {
  let called = false
  return function f () {
    if (!called) {
      called = true
      cb.apply(this, arguments)
    }
  }
}
