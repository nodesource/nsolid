#!/usr/bin/env node

'use strict'

const { certify } = require('./ncm')
const path = require('path')
const { promises: { access } } = require('fs')
const chalk = require('chalk')
const { log } = console

async function agent () {
  const pkgJson = path.join(process.argv[2], 'package.json')

  try {
    await access(pkgJson)
  } catch (err) {
    process.exit(0) // skip cert because there's no package.json
  }

  const { dependencies = {} } = require(pkgJson)
  const pkgPath = pkg => path.join(process.argv[2], 'node_modules', pkg)

  log(chalk.yellow('[NSOLID STRICT MODE] Verifying...'))
  await Promise.all(Object.keys(dependencies).map(dep => certify(pkgPath(dep), true)))
  log(chalk.green('[NSOLID STRICT MODE] PASSED'))
}
agent()
