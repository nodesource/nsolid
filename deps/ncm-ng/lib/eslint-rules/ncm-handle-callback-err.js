/**
 * Adapted from eslint's handle-callback-err & prefer-rest-params rules
 */

/* eslint-disable quotes, spaced-comment, semi, indent, padded-blocks, space-before-function-paren, one-var */

"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    create(context) {

        const errorArgument = context.options[0] || "err";

        /**
         * Reports references of the implicit `arguments` variable if exist.
         *
         * @returns {void}
         */
        function checkForArguments() {
            const argumentsVar = getVariableOfArguments(context.getScope());

            if (!argumentsVar) return false

            return argumentsVar
                    .references
                    .filter(isNotNormalMemberAccess)
                    .length > 0
        }

        /**
         * Checks if the given name matches the configured error argument.
         * @param {string} name The name which should be compared.
         * @returns {boolean} Whether or not the given name matches the configured error variable name.
         */
        function matchesConfiguredErrorName(name) {
            if (errorArgument instanceof RegExp) {
                return errorArgument.test(name);
            }
            return name === errorArgument;
        }

        /**
         * Get the parameters of a given function scope.
         * @param {Object} scope The function scope.
         * @returns {array} All parameters of the given scope.
         */
        function getParameters(scope) {
            return scope.variables.filter(variable => variable.defs[0] && variable.defs[0].type === "Parameter");
        }

        /**
         * Check to see if we're handling the error object properly.
         * @param {ASTNode} node The AST node to check.
         * @returns {void}
         */
        function checkForError(node) {
            const scope = context.getScope(),
                parameters = getParameters(scope),
                firstParameter = parameters[0];

            if (parameters.length < 2) {
              // If the callback only has an 'error' parameter, presumably it is
              // only called in the case of an error. In that case, we can
              // say that the error condition was handled in some way, even
              // if the 'error' parameter in not accessed.
              //
              // e.g EE.on('error', error => {/* ... */})
              return
            }

            if (checkForArguments()) {
              // If the special `arguments` variable was accessed, the code in
              // question is likely some intermediary passing mechanism / utility
              // and it is probably fine.
              return
            }

            if (firstParameter && matchesConfiguredErrorName(firstParameter.name)) {
                if (firstParameter.references.length === 0) {
                    context.report({ node, message: "Expected error to be handled." });
                }
            }
        }

        return {
            FunctionDeclaration: checkForError,
            FunctionExpression: checkForError,
            ArrowFunctionExpression: checkForError
        };

    }
}

//------------------------------------------------------------------------------
// Helpers
//
// See https://github.com/eslint/eslint/blob/master/lib/rules/prefer-rest-params.js
//------------------------------------------------------------------------------

/**
* Gets the variable object of `arguments` which is defined implicitly.
* @param {eslint-scope.Scope} scope - A scope to get.
* @returns {eslint-scope.Variable} The found variable object.
*/
function getVariableOfArguments(scope) {
  const variables = scope.variables;

  for (let i = 0; i < variables.length; ++i) {
    const variable = variables[i];

    if (variable.name === "arguments") {

      /*
       * If there was a parameter which is named "arguments", the implicit "arguments" is not defined.
       * So does fast return with null.
       */
      return (variable.identifiers.length === 0) ? variable : null;
    }
  }

  /* istanbul ignore next : unreachable */
  return null;
}

/**
* Checks if the given reference is not normal member access.
*
* - arguments         .... true    // not member access
* - arguments[i]      .... true    // computed member access
* - arguments[0]      .... true    // computed member access
* - arguments.length  .... false   // normal member access
*
* @param {eslint-scope.Reference} reference - The reference to check.
* @returns {boolean} `true` if the reference is not normal member access.
*/
function isNotNormalMemberAccess(reference) {
  const id = reference.identifier;
  const parent = id.parent;

  return !(
    parent.type === "MemberExpression" &&
    parent.object === id &&
    !parent.computed
  );
}
