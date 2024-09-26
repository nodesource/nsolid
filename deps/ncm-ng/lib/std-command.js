'use strict'

// run an OS command (unix-ish) that generates output to stdout
exports.run = run
exports.exec = exec

const util = require('util')
const childProcess = require('./child-process-exec')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

const childProcessExecP = util.promisify(childProcess.exec)

// Run the command with child_process.exec(), returning { stdout, stderr }
// If opts.env is passed in, only needs to be extra env vars.
// Trims white-space from the end of stdout/stderr.
// On errors from child_process, throws new exception with copied properties.
async function exec (command, opts) {
  opts = Object.assign({}, opts)
  if (opts.encoding == null) opts.encoding = 'utf-8'
  if (opts.env != null) {
    opts.env = Object.assign({}, process.env, opts.env)
  }

  logger.debug(`running "${command}"`)
  try {
    var { stdout, stderr } = await childProcessExecP(command, opts)
  } catch (err) {
    var { stdout, stderr } = err // eslint-disable-line no-redeclare
    if (!opts.ignoreErrors) {
      logger.error(`command failed: "${command}": code:${err.code}; signal:${err.signal}; message: ${err.message}`)
      logger.error(`stdout: "${JSON.stringify(err.stdout)}"`)
      logger.error(`stderr: "${JSON.stringify(err.stderr)}"`)
      throw err
    }
  }

  stdout = fixupOutput(stdout)
  stderr = fixupOutput(stderr)

  logger.debug(`stdout: "${stdout}"`)
  logger.debug(`stderr: "${stderr}"`)

  if (stderr !== '' && !opts.ignoreErrors) {
    const err = new Error(`unexpected stderr from command "${command}": "${stderr.slice(0, 30)}"`)
    err.stdout = stdout
    err.stderr = stderr
    throw err
  }

  return { stdout, stderr }
}

// Run the command with child_process.exec(), returning stdout as a string.
// If opts.env is passed in, only needs to be extra env vars.
// Trims white-space from the end of stdout/stderr.
// On errors from child_process, throws new exception with copied properties.
async function run (...args) {
  const { stdout } = await exec(...args)
  return stdout
}

function fixupOutput (output) {
  if (output == null) return ''
  return `${output}`.replace(/\s*$/, '')
}
