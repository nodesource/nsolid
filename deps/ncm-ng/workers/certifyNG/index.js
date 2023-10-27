'use strict'

exports.workers = {
  license: require('./license').worker,
  deprecated: require('./deprecated').worker,
  installScripts: require('./install-scripts').worker,
  eslintASTChecker: require('./eslint-ast-checker').worker
}
