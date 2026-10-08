'use strict'

process.on('uncaughtException', _ => {
  process.exit(1)
})

require('../worker-flows/certifyNG')
const flowRunner = require('../lib/flow-runner')
const VulnManager = require('../lib/vuln-manager')
const vulnManager = VulnManager.create()

let config
try {
  config = require('../config.json')
  if (!config.name) config = {}
} catch (err) {
  config = {}
}

const { whitelist = {}, rules = [] } = config || {}
const semver = require('semver')

const path = require('path')
const {
  promises: {
    access,
    writeFile
  }
} = require('fs')
const chalk = require('chalk')
const { exit } = require('process')
const { log } = console

const [, , _dir, _cacheDir, _isStrictMode] = process.argv

async function certify (dir, isStrictMode, cacheDir = 'tmp') {
  try {
    await access(dir)
  } catch (err) {
    exit(1)
  }

  const pkgJsonPath = path.join(dir, 'package.json')
  const { name, version } = require(pkgJsonPath)

  const flowName = 'certifyNG'
  const input = {
    name,
    version,
    dir
  }
  const config = {
    TMP_PATH: './tmp/certifyNG',
    parallel: 2
  }

  const { dependencies, devDependencies } = require(pkgJsonPath)
  const pkgs = { ...dependencies, ...devDependencies, [name]: version }
  Object.keys(pkgs).forEach(pkg => {
    const pkgVulns = vulnManager.getVulnsForPackage(pkg)
    if (pkgVulns && pkgVulns.length) {
      pkgVulns.forEach(({ vulnerable }) => {
        if (!semver.satisfies(pkgs[pkg], vulnerable)) return
        log('nsolid', chalk.black.bgYellow('STRICT MODE'), chalk.red(`access denied due to security vulnerabilities in ${pkg}@${pkgs[pkg]}`))
        process.exit(1)
      })
    }
  })

  const certs = await flowRunner.runFlow(flowName, input, config, true)
  const isViolated = ({ group, pass, name = '', version = '', package: pkg = '' }) => {
    try {
      if (rules.length && !rules.includes(name)) return false
      if (whitelist[pkg] && semver.satisfies(version, whitelist[pkg])) return false
      return pass !== true && ['risk', 'compliance'].indexOf(group) > -1
    } catch (err) {}
    return false
  }

  if (isStrictMode) {
    certs.forEach(cert => {
      if (isViolated(cert)) {
        log('nsolid', chalk.black.bgYellow('STRICT MODE'), chalk.red(`access denied due to policy violation:\n${JSON.stringify(cert, null, 2)}`))
        process.exit(1)
      }
    })
    return
  }

  if (_dir) {
    const _name = name.replace(/[^\w\s]/gi, '')
    await writeFile(`${cacheDir}/${_name}${version}.json`, JSON.stringify({
      id: `${_name}${version}`,
      data: certs
    }))
  }

  return certs
}

if (require.main === module && _dir) certify(_dir, _isStrictMode || false, _cacheDir)

module.exports = { certify }
