'use strict'

const test = require('tape')

const fs = require('fs')
const path = require('path')

const nsolidCLI = require('./lib/nsolid-cli-invoker')

const HelpText = fs.readFileSync(path.join(__dirname, '..', 'help.txt'), 'utf8')
  .trim()

test('help', function (t) {
  nsolidCLI.run('-h', 1000, onDone)

  function onDone (err, stdout, stderr) {
    stdout = stdout.trim()
    stderr = stderr.trim()

    t.equal(err, null, 'expecting no error')
    t.equal(stdout, '', 'expecting no stdout')
    t.equal(stderr, HelpText, 'expecting help text on stderr')
    t.end()
  }
})
