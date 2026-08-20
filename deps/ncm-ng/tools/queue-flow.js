#!/usr/bin/env node

'use strict'

// queue a flow to run with specified input

exports.main = main
exports.queueFlow = queueFlow

const path = require('path')

const json = require('../lib/json')
const utils = require('./lib/utils')

// main program
async function main (env, flowName, input) {
  if (env == null || flowName == null) help()

  const apiURL = utils.getApiUrl(env)

  const flowMessage = `flow ${flowName} ${json.lineify(input)}`

  try {
    var response = await queueFlow(apiURL, flowName, input)
  } catch (err) {
    console.log(`❌ error queueing ${flowMessage}`)
    console.log(err)
    return
  }

  if (response.status === 'ok') {
    console.log(`💚  queued ${flowMessage}`)
    return
  }

  console.log(`❌ error queueing ${flowMessage}`)
  console.log(JSON.stringify(response, null, 4))
}

// queue a request to run a flow
async function queueFlow (apiURL, flowName, input) {
  const requestOptions = {
    method: 'POST',
    uri: `${apiURL}/api/v1/run-flow`,
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    json: true,
    body: {
      flowName,
      input,
      parameters: {}
    },
    timeout: 300 * 1000
  }

  const result = await utils.httpRequest(requestOptions)
  return result.body
}

function help () {
  console.log(`
${path.basename(__filename)} env flowName key1: val1 key2: val2 ...

Queue a flow to run with the specified input.

${utils.getEnvHelp()}
  `.trim())
  process.exit(1)
}
