'use strict'

module.exports = validateSchema

const joi = require('joi')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

// Validate an object matches the schema.
// If it doesn't, log error messages and throw an error.
function validateSchema (schemaName, object, schema) {
  const result = schema.validate(object)
  if (result.error == null) return

  logger.error(`error validating ${schemaName}: ${result.error}`)
  throw result.error
}
