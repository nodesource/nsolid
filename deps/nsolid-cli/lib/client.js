'use strict'

const request = require('client-request')

class Client {
  constructor (remote, onReady) {
    this.apiVersion = 4
    this.uri = remote + `v${this.apiVersion}`
    this.schema = {}
    this.ready = false
    this.queued = []
    this.flushed = null
    this.length = 0

    this.onReady = (err, client) => {
      if (err) {
        console.error(err)
        console.error(`Error attempting to initialize ${this.apiVersion}.x API client`)
      }
    }
    if (onReady != null && (typeof onReady === 'function')) {
      this.onReady = onReady
    }

    request({uri: this.uri + '/schema', json: true}, (err, res, body) => {
      if (err) {
        this.onReady(err)
      }
      this.schema = body
      this.ready = true
      if (onReady != null && (typeof onReady === 'function')) {
        onReady(null, this)
        this._flushQueue()
      }
    })
  }

  _flushQueue () {
    if (!this.ready) {
      throw new Error('_flushQueue called before ready!')
    }
    this.queued.forEach((args) => {
      this.run.apply(this, args)
    })
  }

  run (command, conf, callback) {
    if (!this.ready) {
      this.queued.push([command, conf, callback])
      return
    }
    if (this.schema[command] == null) {
      return setImmediate(() => {
        callback(new Error(`Command '${command}' not found in schema definition.`))
      })
    }
    const rules = this.schema[command]
    const verbs = Object.keys(rules)
    const opts = {
      uri: `${this.uri}/${command}`,
      method: verbs[0],
      timeout: conf.timeout
    }
    if (conf.auth) {
      opts.headers = {
        Authorization: `Bearer ${conf.auth}`
      }
    }
    let method = verbs[0]
    if (verbs.length > 1) {
      // determine verb based on conf
      if (conf.body == null && verbs.indexOf('GET') >= 0) {
        method = 'GET'
      }
      // if there's a body, assume it's either PUT or POST
      if (conf.body && verbs.indexOf('PUT') >= 0) {
        opts.body = conf.body
        method = 'PUT'
      }
      if (conf.body && verbs.indexOf('POST') >= 0) {
        opts.body = conf.body
        method = 'POST'
      }
      // delete has to be manually selected to disambiguate
      if (conf.delete && verbs.indexOf('DELETE') >= 0) {
        method = 'DELETE'
      }
    }
    opts.method = method

    // validate action vs. params and requirements
    const params = new URLSearchParams()
    for (let idx in rules[method].params) {
      const param = rules[method].params[idx]
      if (conf[param] != null) {
        params.append(param, conf[param])
      }
    }

    const { threadId } = conf
    if (threadId != null) {
      params.append('threadId', threadId)
    }

    const missing = []
    for (let idx in rules[method].required) {
      const required = rules[method].required[idx]
      if (!params.has(required)) {
        missing.push(required)
      }
    }
    if (missing.length) {
      return setImmediate(() => {
        callback(new Error(`Missing required param(s): [${missing.join(', ')}]`))
      })
    }

    const params_str = params.toString()
    if (params_str) {
      opts.uri += '?' + params_str
    }

    // if keepalive, results will stream
    if (rules[method].keepalive) {
      opts.stream = true
    }
    // if fields are set, use streaming for our filter stream
    if (conf.fields != null) {
      opts.stream = true
    }

    // this is specific to the import settings endpoint
    if (conf.attach != null) {
      opts.body = conf.attach
    }

    this.length++
    const cb = (...args) => {
      this.length--
      callback.apply(undefined, args)
      if (this.length === 0 && typeof this.flushed === 'function') {
        this.flushed()
      }
    }

    // run command
    return request(opts, cb)
  }
}

module.exports = Client
