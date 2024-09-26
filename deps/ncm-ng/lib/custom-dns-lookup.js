'use strict'

const dns = require('dns')
const util = require('util')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

module.exports = lookup

// Custom dns.lookup logic with timeout using dns.Resolver
function lookup (hostname, options, callback) {
  const doLookup = util.callbackify(async function (hostname) {
    const resolver = new dns.Resolver()

    const timeout = setTimeout(_ => {
      resolver.cancel()
    }, 1000)

    // The promise / async function stuff greatly simplifies this.
    for (const family of [4, 6]) {
      const resolve = util.promisify(resolver['resolve' + family].bind(resolver))
      let addresses
      try {
        logger.debug(`Attepting to resolve '${hostname}' using 'resolve${family}'`)
        addresses = await resolve(hostname)
      } catch (err) {
        if (err instanceof TypeError ||
            err instanceof SyntaxError) {
          throw err
        } else if (err.code === 'ECANCELLED') {
          logger.error(`DNS resolution timed out for '${hostname}' using 'resolve${family}'`)
          throw new Error('DNS resolution timed out')
        } else {
          logger.error(`Failed to resolve '${hostname}' using 'resolve${family}', got: ${err.message}`)
        }
      }
      if (addresses && addresses.length > 0) {
        clearTimeout(timeout)
        return { address: addresses[0], family }
      }
    }
    clearTimeout(timeout)
    throw new Error('No addresses found from DNS resolution')
  })

  // An extra callback layer on top of util.callbackify().
  // Does some debug logging and arranged the callback arguments as desired.
  doLookup(hostname, (err, { address, family } = {}) => {
    logger.debug(`Did lookup: ${err && err.message}, ${address}, ${family}`)
    callback(err, address, family)
  })
}
