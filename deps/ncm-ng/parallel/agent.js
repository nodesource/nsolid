#!/usr/bin/env node

'use strict'

process.on('uncaughtException', _ => {
  process.exit(1)
})

const { certify } = require('./ncm-agent')
const path = require('path')
const { promises: { access }, writeFileSync } = require('fs')
const chalk = require('chalk')
const open = require('open')

const { exit } = require('process')
const { log } = console

let configError
if (process.argv[2] === '--config') {
  try {
    const config = require('../config.json')
    if (typeof config !== 'object') throw new Error()
  } catch (err) {
    try {
    const template = JSON.stringify(require('./config.json'), null, 2)
    writeFileSync(path.join(__dirname, '../config.json'), template)
    } catch (e) {
      configError = true
    }
  } finally {
    if (configError) return
    const config = path.join(__dirname, '../config.json')
    open(config)
  }
} else {
  agent().catch()
}

async function agent () {
  let pkgJson
  try {
    pkgJson = path.join(process.argv[2], 'package.json')
    await access(pkgJson)
  } catch (err) {
    process.exit(0) // skip cert because there's no package.json
  }

  const { dependencies = {} } = require(pkgJson)
  const pkgPath = pkg => path.join(process.argv[2], 'node_modules', pkg)

  log('nsolid', chalk.black.bgYellow('STRICT MODE'), chalk.greenBright('verifying...'))
  await Promise.all(Object.keys(dependencies).map(dep => certify(pkgPath(dep), true)))
  log('nsolid', chalk.black.bgYellow('STRICT MODE'), chalk.black.bgGreenBright('PASSED'))
}
