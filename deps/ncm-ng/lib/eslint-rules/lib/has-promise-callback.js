/**
 * Adapted from eslint-plugin-promise's "no-callback-in-promise",
 * minorly adjusted to handle Identifier cases.
 */

'use strict'

function hasPromiseCallback (node) {
  if (node.type !== 'CallExpression') return
  if (node.callee.type !== 'MemberExpression') return
  if (node.callee.computed) return
  const propertyName = node.callee.property.name
  return propertyName === 'then' || propertyName === 'catch'
}

module.exports = hasPromiseCallback
