'use strict'

const Flow = require('../lib/flow')
const workers = require('../workers')

const allWorkers = workers.allWorkers

const general = allWorkers.general
const certifyBasic = allWorkers.certifyBasic
const certifyNG = allWorkers.certifyNG

exports.flow = Flow.create({
  name: 'certifyNG',
  description: 'next generation package certification workers',
  inProcess: true,
  steps: [
    general.getPackageInfo,
    { parallel: [
      [ certifyNG.deprecated, general.writeCert.cloneWithSuffix(':deprecated') ],
      [ certifyNG.license, general.writeCert.cloneWithSuffix(':license') ],
      [
        general.validatePackageJson,
        { parallel: [
          [ certifyBasic.diskUsage, general.writeCert.cloneWithSuffix(':diskUsage') ],
          [ certifyBasic.readme, general.writeCert.cloneWithSuffix(':readme') ],
          [ certifyNG.installScripts, general.writeCert.cloneWithSuffix(':install-scripts') ],
          [
            general.getLocalModuleFilePaths,
            certifyNG.eslintASTChecker.clone({
              suffix: ':absolute-checks',
              parameters: {
                eslintChecks: {
                  eval: {
                    rules: [ 'no-eval', 'no-implied-eval', 'no-new-func' ]
                  },
                  strictMode: {
                    rules: [ 'strict' ],
                    options: [ 'global' ]
                  },
                  unsafeRegex: {
                    plugin: 'no-unsafe-regex',
                    rules: [ 'no-unsafe-regex/no-unsafe-regex' ]
                  },
                  deprecatedNodeAPIs: {
                    plugin: 'node',
                    rules: [ 'node/no-deprecated-api' ]
                  },
                  dynamicRequire: {
                    plugin: 'import',
                    rules: [ 'import/no-dynamic-require' ]
                  },
                  lostCallbackErrs: {
                    rules: [ 'ncm-handle-callback-err' ],
                    options: [ /err/i ] // Find anything with /err/i
                  },
                  abandonedPromises: {
                    rules: [ 'ncm-handle-promise-errors' ],
                    options: [{
                      allowThen: true, // Allow `.then(_ , err => ...)`
                      terminationMethods: [
                        'catch', 'finally', // Default
                        'asCallback', // ?? Suggested by eslint-plugin-promise
                        'nodeify', 'error', // BlueBird
                        'fail', 'done' // Q
                      ]
                    }]
                  },
                  callbackInAsyncFn: {
                    rules: [ 'ncm-no-cb-in-async-fn' ]
                  },
                  asyncWithoutAwait: {
                    plugin: 'no-async-without-await',
                    rules: [ 'no-async-without-await/no-async-without-await' ]
                  }
                }
              }
            }),
            general.writeCert.cloneWithSuffix(':eslint-ast-checker:absolute')
          ]
        ] }
      ]
    ] }
  ]
})
