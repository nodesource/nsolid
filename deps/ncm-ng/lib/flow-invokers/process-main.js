'use strict'

// main entrypoiny called by the process flow invoker

// launched via child_process.fork()

// set process title for logger
process.title = 'ncm-workers-process'
process.env.LOGLEVEL = 'warn'

require('../../worker-flows') // load all the flows

const flowRunner = require('../flow-runner')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

if (require.main !== module) {
  logger.error('this module is expected to be run via child_process.fork()')
  process.exit(1)
}

main()

async function main () {
  process.on('message', async (message) => {
    logger.debug(`received message: ${JSON.stringify(message, null, 4)}`)

    const { flowName, input, config } = message

    const result = await flowRunner.runFlow(flowName, input, config)
    process.send(result)
    process.exit(0)
  })
}
