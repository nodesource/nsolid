'use strict'

// General JSON parser that logs errors and returns undefined on failure.

exports.parse = parse
exports.parseAsync = parseAsync
exports.lineify = lineify

const pDefer = require('p-defer')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

function parse (content) {
  if (content == null) return null

  if (typeof content !== 'string') {
    const err = new Error('parse() called with non-string parameter')
    logger.error(err)
    return undefined
  }

  try {
    return JSON.parse(content)
  } catch (err) {
    const slice = content.slice(0, 30)
    logger.error(`parse() called with non-JSON content: "${slice}...": ${err}`)
    return undefined
  }
}

// This function just breaks up JSON parse to keep it in it's own
// event loop.  For processing that includes parsing a large JSON
// wad, this may help keeping the el from blocking.
async function parseAsync (content) {
  const deferred = pDefer()
  let result

  setImmediate(doParse)

  return deferred.promise

  // do the parse only in a tick
  function doParse () {
    result = parse(content)
    setImmediate(sendResponse)
  }

  function sendResponse () {
    deferred.resolve(result)
  }
}

// convert a "small" JSON object to a nice line representation
function lineify (object, isSubObject) {
  const result = []

  if (typeof object === 'string') return JSON.stringify(object)
  if (typeof object === 'number') return `${object}`
  if (typeof object === 'boolean') return `${object}`
  if (object === undefined) return 'undefined'
  if (object == null) return 'null'

  if (isSubObject) result.push('{')

  for (let key of Object.keys(object)) {
    result.push(`${key}:`)
    result.push(lineify(object[key], true))
  }

  if (isSubObject) result.push('}')

  return result.join(' ')
}
