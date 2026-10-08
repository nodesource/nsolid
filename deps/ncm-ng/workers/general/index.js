'use strict'

exports.workers = {
  writeCert: require('./writeCert').worker,
  getPackageInfo: require('./getPackageInfo').worker,
  getLocalModuleFilePaths: require('./getLocalModuleFilePaths').worker,
  packageIntegrity: require('./package-integrity').worker,
  validatePackageJson: require('./validate-package-json').worker
}
