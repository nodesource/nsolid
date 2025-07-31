'use strict'

/**
 * Adapted from eslint-plugin-promise's "no-callback-in-promise"
 * Cleaned up a bunch, was a mess in upstream.
 */

function isCallback (node, namesToMatch) {
  const isCallExpression = node.type === 'CallExpression'
  const callee = node.callee || {}
  const nameIsCallback = namesToMatch.some(name => {
    return callee.name === name
  })
  const isCB = isCallExpression && nameIsCallback
  return isCB
}

module.exports = isCallback
