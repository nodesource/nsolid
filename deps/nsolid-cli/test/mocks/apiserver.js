'use strict'

const http = require('http')

module.exports = start

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
  const server = http.createServer((req, res) => {
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
      case '/api/v4/empty':
        return res.end('')
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
