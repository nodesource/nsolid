'use strict'

exports.workers = {
  diskUsage: require('./diskUsage').worker,
  readme: require('./readme').worker,
  scm: require('./scm').worker
}
