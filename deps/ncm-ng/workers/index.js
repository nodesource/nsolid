'use strict'

exports.allWorkers = {
  certifyBasic: require('./certifyBasic').workers,
  certifyNG: require('./certifyNG').workers,
  general: require('./general').workers
}
