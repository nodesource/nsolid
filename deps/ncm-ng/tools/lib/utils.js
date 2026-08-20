'use strict'

exports.getApiUrl = getApiUrl
exports.getEnvHelp = getEnvHelp
exports.httpRequest = httpRequest
exports.inputArgsToObject = inputArgsToObject

const clientRequest = require('client-request/promise')

// wrapper around client-request/promise that handles JSON parse errors better
async function httpRequest (options) {
  const jsonOption = options.json
  if (options.json) delete options.json

  try {
    var result = await clientRequest(options)
  } catch (err) {
    if (err.response != null) {
      result = err
    } else {
      throw err
    }
  }

  if (result.body) {
    result.body = result.body.toString()

    if (jsonOption) {
      try {
        result.body = JSON.parse(result.body)
      } catch (err) {
        console.log(`error parsing JSON response:\n${result.body}`)
        throw err
      }
    }
  }

  return result
}

// convert:
//    ['key1:', 'val1', 'key2:, 'val2', ...]
// to:
//    {key1: 'val1', key2: 'val2', ...}
function inputArgsToObject (inputArgs) {
  const object = {}

  while (inputArgs.length > 0) {
    let key = `${inputArgs.shift()}`
    let val = `${inputArgs.shift()}`

    if (!key.endsWith(':')) throw new Error(`expecting key ${key} to end with a colon`)
    key = key.replace(/:$/, '')

    object[key] = val
  }

  return object
}

// get an endpoint given an env string
function getApiUrl (env) {
  if (env == null && process.env.NCM_ENV != null) {
    env = process.env.NCM_ENV
  }

  if (env == null) env = 'local'
  if (env === 'local') env = 'localhost:3001'
  if (env === 'prod') return 'https://private-api.nodesource.com/ncm-workers'
  if (env === 'staging') return 'https://staging.private-api.nodesource.com/ncm-workers'

  if (/dev-\d+/.test(env)) {
    const match = env.match(/dev-(\d+)/)
    const prNum = match[1]
    return `https://dev.private-api.nodesource.com/ncm-workers-${prNum}`
  }

  if (/localhost:\d+/.test(env)) return `http://${env}/ncm-workers`

  return null
}

// help for programs that take an env
function getEnvHelp () {
  return 'The env parameter can be one of prod, staging, dev-PR, local, localhost:PORT'
}
