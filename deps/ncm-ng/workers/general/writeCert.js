'use strict'

const RETRY_LIMIT = 3
const PUSH_TIMEOUT_SECONDS = 3
const COMMAND_TIMEOUT_SECONDS = (PUSH_TIMEOUT_SECONDS * RETRY_LIMIT) + 1

const worker = require('../../lib/worker')
const cache = require('../../lib/cache')

exports.worker = worker.create({
  run: run,
  fileName: __filename,
  description: 'write certification data to cache',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    certName: 'name of the cert',
    certData: 'data of the cert',
    certs: 'an object of multiple certs like { name: data }'
  },
  output: {}
})

async function run (context, input, config) {
  if (input.certName && input.certData) {
    await writeCert(input, config)
  }

  if (typeof input.certs === 'object') {
    const writeFns = []
    for (const certName in input.certs) {
      // Normalize input to single-cert data
      const normalizedInput = Object.assign({}, input, { certName, certData: input.certs[certName] })
      writeFns.push(writeCert(normalizedInput, config))
    }

    await Promise.all(writeFns)
  }
}

async function writeCert (input, config) {
  const body = {
    package: input.name,
    version: input.version,
    name: input.certName,
    data: input.certData,
    worker: input.worker,
    created: new Date().toISOString()
  }

  const cached = cache[input.name]
  if (cached) {
    cached.push(body)
  } else {
    cache[input.name] = [body]
  }
}
