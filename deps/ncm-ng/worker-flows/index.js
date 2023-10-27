'use strict'

// Handling of errors on stdout.
//
// It seems that sometimes at shutdown, if the node process is redirecting
// to a file, the pipe to that file is shutdown before node is finished,
// and then any subsequent writes to stdout/stderr will end up getting an
// error.

exports.allFlows = {
  certifyBasic: require('./certifyBasic').flow,
  certifyNG: require('./certifyNG').flow
}

for (let flow in require('./experiments').flows) {
  exports.allFlows[flow.name] = flow
}
