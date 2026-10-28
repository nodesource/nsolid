'use strict'

const path = require('path')

const nsUtil = require('../util')

const pkg = require('../package.json')

// obligatory requires until they are used in mains
require('joi')

// set some defaults for the logger, if not already set
process.title = path.basename(pkg.name)
nsUtil.logger.setBasePath(path.dirname(__dirname))

exports.flowRunner = require('./flow-runner')
exports.queuedFlowRunner = require('./queued-flow-runner')
exports.flow = require('./flow')
