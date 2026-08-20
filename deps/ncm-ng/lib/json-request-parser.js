'use strict'

const bodyParser = require('body-parser')

const parseBody = bodyParser.json({ type: () => true })

function parseBodyErrorHandler (err, req, res, next) {
  if (err == null) return next()

  res.status(400).send({ error: `invalid JSON: ${err.message}` })
}

exports.parseBody = parseBody
exports.parseBodyErrorHandler = parseBodyErrorHandler
