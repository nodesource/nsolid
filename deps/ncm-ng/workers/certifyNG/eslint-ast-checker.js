'use strict'

const COMMAND_TIMEOUT_SECONDS = 60 * 5

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run: () => {},
  fileName: __filename,
  description: 'runs eslint javascript AST Cert checks on a set of files',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    dir: 'unpacked tarball directory',
    files: 'files in the module\'s load path for AST parsing'
  },
  output: {
    certs: 'an object of cert name and data as derived from the eslintChecks'
  },
  params: {
    eslintChecks: 'configuration options describing the rules to run and outputs to gather'
  }
})
