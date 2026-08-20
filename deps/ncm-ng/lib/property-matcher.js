'use strict'

// check that an object has all the properties specified in another property

exports.match = match

// Return names of properties in specObject that do not exist in testObject.
function match (specObject, testObject) {
  const missing = []

  for (let propName of Object.keys(specObject)) {
    if (testObject[propName] === undefined) missing.push(propName)
  }

  return missing
}
