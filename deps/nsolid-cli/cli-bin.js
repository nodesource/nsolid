#!/usr/bin/env node
'use strict'

process.title = 'nsolid-cli'
const { readFileSync } = require('fs')
const Client = require('./lib/client')
const formats = require('./cli_formats')
const packageJSON = require('./package.json')

const argv = require('minimist-lite')(process.argv.slice(2), {
  'boolean': ['delete'],
  'default': {
    remote: 'http://localhost:6753/api/'
  }
})

let conf
try {
  const home = process.platform === 'win32' ?
    process.env.USERPROFILE :
    process.env.HOME
  const file = readFileSync(`${home}/.nsolid-clirc`).toString()
  const config = require('ini').parse(file)
  conf = Object.assign(argv, config)
} catch {
  conf = argv
}

if (!/^http/.test(conf.remote)) {
  conf.remote = 'http://' + conf.remote
}

if (!/\/api\/$/.test(conf.remote)) {
  conf.remote = conf.remote + '/api/'
}

if (conf.h || conf.help) {
  const helpFile = require('path').join(__dirname, 'help.txt')
  const helpText = readFileSync(helpFile)
  console.error(String(helpText))
  process.exit(0)
}

if (conf.s || conf.stdin) {
  // passing -s or --stdin expects to read from stdin
  conf.body = process.stdin
}

// this is specific to the import settings endpoint
if (conf.attach) {
  try {
    const data = readFileSync(conf.attach, 'utf8')
    conf.attach = data
  } catch (err) {
    console.error('Could not read file:', err)
  }
}

if (conf.v || conf.version) {
  console.log(packageJSON.version)
  process.exit(0)
}

if (conf._.length === 0) {
  usageError('Expecting a command: snapshot, etc. Use -h for list of commands.')
}

if (conf._.length > 1) {
  usageError('Expecting only a single command')
}

let command = conf._[0]
// 'ls' is an alias for 'list'
if (command === 'ls') {
  command = 'list'
}

const client = new Client(conf.remote, function onReady (err) {
  if (err) {
    // Error setting up client, bad server?
    console.error('Failed to get schema from API server:')
    return usageError(err.message)
  }
})

if (command === 'snapshot' || command === 'profile') {
  // First trigger the command and wait for it to complete.
  client.run(command, conf, (err, res, reply) => {
    if (err) {
      return usageError(err.message)
    }

    let payload
    try {
      payload = JSON.parse(reply)
    } catch (e) {
      console.error('Invalid payload')
      console.error(payload)
      return
    }
    if (!payload || !payload.asset) {
      console.error('Unable to create/fetch asset')
      console.error(payload)
      return
    }

    // The command was successfully triggered and the asset has been created.
    // Now retrieve it from the server.
    const assetConf = {
      id: payload.asset,
      auth: conf.auth
    }
    client.run('asset', assetConf, (err, res, reply) => {
      if (err) {
        return usageError(err.message)
      }
      process.stdout.write(reply)
    })
  })

} else {
  client.run(command, conf, (err, res, reply) => {
    // Command body didn't return anything.
    if (!reply) {
      return
    }
    if (err) {
      return usageError(err.message)
    }
    // If the response is not a 2XX then print to stderr.
    const printTo = /^2/.test(res.statusCode) ? process.stdout : process.stderr
    // Reply can be a reply OR a stream. Such as the "metrics" command.
    if (reply.pipe != null && (typeof reply.pipe === 'function')) {
      return reply.pipe(formats.Consolize(printTo)).pipe(printTo)
    }
    printTo.write(reply)
    if (printTo.isTTY) {
      // Append a newline if it didn't end with one.
      if (reply[reply.length - 1] !== 10) {
        printTo.write('\n')
      }
    }
  })
}

function usageError (message) {
  console.error(message)
  process.exit(1)
}
