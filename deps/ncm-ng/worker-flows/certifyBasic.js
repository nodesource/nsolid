'use strict'

const Flow = require('../lib/flow')
const workers = require('../workers')

const allWorkers = workers.allWorkers

const general = allWorkers.general
const certifyBasic = allWorkers.certifyBasic

exports.flow = Flow.create({
  name: 'certifyBasic',
  description: 'basic package certification workers',
  inProcess: true,
  steps: [
    general.getPackageInfo,
    { parallel: [
      [ certifyBasic.diskUsage, general.writeCert.cloneWithSuffix(':diskUsage') ],
      [ certifyBasic.readme, general.writeCert.cloneWithSuffix(':readme') ],
      [ certifyBasic.scm, general.writeCert.cloneWithSuffix(':scm') ]
    ] }
  ]
})
