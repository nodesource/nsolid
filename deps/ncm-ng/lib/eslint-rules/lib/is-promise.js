/**
 * Adapted from eslint-plugin-promise's "catch-or-return"
 * The helper has been **heavily** modified.
 */

'use strict'

const PROMISE_STATICS = {
  all: true,
  race: true,
  reject: true,
  resolve: true
}

function isPromise (scope, expression, detectables, terminations) {
  if (expression.type !== 'CallExpression') {
    return false
  } else if (
    expression.callee.type === 'MemberExpression' &&
    ( // hello.then()
      expression.callee.property.name === 'then' ||
      // any method specified in terminationMethods
      detectables.includes(expression.callee.property.name) ||
      // Promise.STATIC_METHOD()
      (expression.callee.object.type === 'Identifier' &&
      expression.callee.object.name === 'Promise' &&
      PROMISE_STATICS[expression.callee.property.name])
    )
  ) {
    return true
  } else if (expression.callee.type === 'Identifier') {
    const name = expression.callee.name
    // Now we dig through variables...
    for (const variable of scope.variables) {
      // Only the variable in question...
      if (variable.name !== name) continue
      // Last (re)definition
      const def = variable.defs[variable.defs.length - 1]
      // No defs... dunno.
      if (!def) continue

      // Regular variable definition
      if (def.type === 'Variable' &&
        def.node.init) {
        const init = def.node.init

        if (init.type === 'NewExpression' &&
          init.callee.name === 'Promise') {
          // A raw Promise declaration
          return true
        } else if (isPromise(scope, init, detectables, terminations)) {
          // Else recurse looking for e.g. Promise.reject()
          return true
        }
      } else if (def.type === 'FunctionName' && def.node.async) {
        // Async functions
        return true
      }
    }

    return false
  }
}

module.exports = isPromise
