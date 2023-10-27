'use strict'

exports.isWhiteListed = isWhiteListed

const WHITELISTED_PACKAGES_FILE = 'etc/npm-package-subset.txt'

const fs = require('fs')
const path = require('path')

const nsUtil = require('../util')

const env = nsUtil.getEnv()
const IsProd = (env === 'prod')

let WhiteListedPackages = new Set()
load()

function isWhiteListed (pkgName) {
  if (IsProd) return true

  return WhiteListedPackages.has(pkgName)
}

function load () {
  if (IsProd) return

  const fileName = path.join(__dirname, '..', WHITELISTED_PACKAGES_FILE)
  try {
    var contents = fs.readFileSync(fileName, 'utf8')
  } catch (err) {
    throw new Error(`error reading whitelisted packages: ${err.message}`)
  }

  const pkgNames = contents
    .trim()
    .split('\n')
    .map(line => line.trim())

  for (let pkgName of pkgNames) {
    WhiteListedPackages.add(pkgName)
  }
}
