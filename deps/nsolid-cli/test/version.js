'use strict'

const test = require('tape')

const nsolidCLI = require('./lib/nsolid-cli-invoker')

const Version = require('../package.json').version

test('version', function (t) {
  nsolidCLI.run('-v', 1000, onDone)

  function onDone (err, stdout, stderr) {
    stdout = stdout.trim()
    stderr = stderr.trim()

    t.equal(err, null, 'expecting no error')
    t.equal(stderr, '', 'expecting no stderr')
    t.equal(stdout, Version, 'expecting version on stdout')
    t.end()
  }
})

test('version2', function (t) {
  nsolidCLI.run('--version', 1000, onDone)

  function onDone (err, stdout, stderr) {
    stdout = stdout.trim()
    stderr = stderr.trim()

    t.equal(err, null, 'expecting no error')
    t.equal(stderr, '', 'expecting no stderr')
    t.equal(stdout, Version, 'expecting version on stdout')
    t.end()
  }
})
