/**
 * Adapted from eslint-plugin-promise's "no-callback-in-promise"
 * **Heavily** modified, essentially re-written.
 */

'use strict'

const hasPromiseCallback = require('./lib/has-promise-callback')
const isCallback = require('./lib/is-callback')

module.exports = {
  meta: {
    messages: {
      callback: 'Callbacks in async functions often cause promise leaks.'
    }
  },
  create (context) {
    const options = context.options[0] || {}
    const namesToMatch = options.namesToMatch || [
      'callback',
      'cb',
      'next',
      'done'
    ]

    return {
      CallExpression (node) {
        if (!context.getAncestors().some(isInsideAsyncFn)) {
          return
        }

        if (isCallback(node, namesToMatch)) {
          context.report({
            node,
            messageId: 'callback'
          })
          return
        }

        // in general we send you packing if you're not a callback
        // but we also need to watch out for callback passing
        if (!node.arguments) return

        if (hasPromiseCallback(node)) {
          const argument = node.arguments[0]
          const name = argument && argument.name
          if (namesToMatch.includes(name)) {
            context.report({
              node: argument,
              messageId: 'callback'
            })
          }
        } else if (usesCallback(node)) {
          const argument = node.arguments[node.arguments.length - 1]
          const name = argument && argument.name
          if (namesToMatch.includes(name)) {
            context.report({
              node: argument,
              messageId: 'callback'
            })
          }
        }
      }
    }
  }
}

function usesCallback (node) {
  if (node.type !== 'CallExpression') return
  if (node.callee.type !== 'MemberExpression') return
  return true
}

function isInsideAsyncFn (node) {
  const isFunctionExpression =
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  return isFunctionExpression && node.async
}
