'use strict'

const path = require('path')
const childProcess = require('child_process')

exports.run = run

const AppFile = path.join(__dirname, '..', '..', 'cli-bin.js')

// Run `nsolid-cli` with parms, and a timeout, call cb(err, stdout, stderr)
function run (parameters, timeout, cb) {
  const cmd = `node ${AppFile} ${parameters}`
  childProcess.exec(cmd, execCB)

  let finished = false
  setTimeout(timedOutCB, timeout)

  function execCB (err, stdout, stderr) {
    if (finished) return
    finished = true

    cb(err, stdout, stderr)
  }

  function timedOutCB () {
    if (finished) return
    finished = true

    cb(new Error('timed out'))
  }
}
