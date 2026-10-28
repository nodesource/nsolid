/**
 * Adapted from eslint-plugin-promise's "catch-or-return"
 * The is-promise helper has been **heavily** modified.
 */

'use strict'

const isPromise = require('./lib/is-promise')

const DEFAULT_METHODS = ['catch', 'finally']

module.exports = {
  meta: {
    messages: {
      terminationMethod: 'Expected {{ terminationMethods }}() or return'
    }
  },
  create (context) {
    const options = context.options[0] || {}
    const allowThen = options.allowThen
    const terminationMethods = options.terminationMethods || DEFAULT_METHODS
    const detectableMethods = options.detectableMethods || DEFAULT_METHODS

    function isHandled (expression) {
      // somePromise.then(a, b)
      if (
        allowThen &&
        expression.type === 'CallExpression' &&
        expression.callee.type === 'MemberExpression' &&
        expression.callee.property.name === 'then' &&
        expression.arguments.length === 2
      ) {
        return true
      }

      // somePromise.catch()
      if (
        expression.type === 'CallExpression' &&
        expression.callee.type === 'MemberExpression' &&
        terminationMethods.includes(expression.callee.property.name)
      ) {
        return true
      }

      // somePromise['catch']()
      if (
        expression.type === 'CallExpression' &&
        expression.callee.type === 'MemberExpression' &&
        expression.callee.property.type === 'Literal' &&
        terminationMethods.includes(expression.callee.property.value)
      ) {
        return true
      }

      return false
    }

    return {
      ExpressionStatement (node) {
        const { expression } = node
        if (!isPromise(context.getScope(), expression, detectableMethods, terminationMethods)) {
          return
        }

        let expr = expression
        // Recurse the call graph in situations such as result.catch().then()
        while (expr && expr.type === 'CallExpression') {
          if (isHandled(expr)) {
            return
          } else {
            expr = expr.callee.object
          }
        }

        // TODO(Jeremiah) Handle this somehow?
        //
        // promise.then(function () {})
        // promise.finally(function () {})

        context.report({
          node,
          messageId: 'terminationMethod',
          data: { terminationMethods }
        })
      }
    }
  }
}
