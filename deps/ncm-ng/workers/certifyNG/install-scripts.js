'use strict'

const COMMAND_TIMEOUT_SECONDS = 10

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run,
  fileName: __filename,
  description: 'check if a package has risky install scripts',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    file: 'tarball file name',
    dir: 'unpacked tarball directory'
  },
  output: {
    certName: 'name of the cert',
    certData: 'data of the cert'
  }
})

const globby = require('fast-glob')

async function run (context, input) {
  const dirName = input.dir

  const foundEvents = checkNpmLifecycleScripts(input.packageJson, input)
  const hasGypFile = await hasGlob(dirName, '*.gyp')

  const installScripts = foundEvents.length > 0 || hasGypFile

  return Object.assign({}, input, {
    certName: 'installScripts',
    certData: {
      installScripts,
      scriptsOfNote: foundEvents,
      hasGypFile
    },
    worker: context.worker.name
  })
}

// Checks for the existance of a glob.
async function hasGlob (dirName, glob) {
  try {
    const paths = await globby(glob, { cwd: dirName })
    if (paths.length > 0) {
      return true
    }
  } catch (err) {}
  return false
}

// Checks for "risky" npm lifecycle scripts that may execute in install / uninstall.
function checkNpmLifecycleScripts (packageJson, input) {
  // See https://docs.npmjs.com/misc/scripts
  // Everything that can possibly run automatically on 'npm install' or `npm uninstall`.
  const riskyEvents = [
    'preinstall',
    'install',
    'postinstall',
    'preuninstall',
    'uninstall',
    'postuninstall'
  ]

  const foundEvents = []

  // If scripts is undefined or invalid, bail.
  if (typeof packageJson.scripts !== 'object') {
    return foundEvents
  }

  for (const key of Object.keys(packageJson.scripts)) {
    if (riskyEvents.includes(key)) {
      foundEvents.push(key)
    }
  }

  return foundEvents
}
