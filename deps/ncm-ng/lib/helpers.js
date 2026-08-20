'use strict'

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

const SEVERITY_NONE = 'NONE'
const SEVERITY_LOW = 'LOW'
const SEVERITY_MEDIUM = 'MEDIUM'
const SEVERITY_HIGH = 'HIGH'
const SEVERITY_CRITICAL = 'CRITICAL'

// function to assign a severity based on a value and set of functions
function setBooleanSeverity (score, passes, severity, titlePass, titleFail) {
  if (passes) {
    score.pass = true
    score.severity = SEVERITY_NONE
    score.title = titlePass
  } else {
    score.pass = false
    score.severity = severity
    score.title = titleFail
  }
}

// function to assign a severity based on a value and set of functions
function setBooleanSeverityHits (score, hits, passes, severity, titlePass, titleFail) {
  if (passes) {
    score.pass = true
    score.severity = SEVERITY_NONE
    score.title = titlePass
    return [ score ]
  }

  const scores = []
  const scoreCore = Object.assign({}, score)

  for (const hit of hits) {
    const score = Object.assign({}, scoreCore)

    score.pass = false
    score.severity = severity
    score.title = titleFail.replace('%location%', hit.locations[0]).replace('%info%', hit.message)
    score.data = { locations: hit.locations }

    scores.push(score)
  }

  return scores
}

// function to assign a severity based on a value and set of functions
function setValueSeverity (score, value, predicates) {
  score.severity = SEVERITY_NONE

  for (let severity in predicates) {
    const testFn = predicates[severity]
    if (testFn(value)) {
      score.severity = severity
      break
    }
  }

  score.pass = score.severity === SEVERITY_NONE
}

// normalize severity level
const ValidSeverities = new Set([
  SEVERITY_NONE,
  SEVERITY_LOW,
  SEVERITY_MEDIUM,
  SEVERITY_HIGH,
  SEVERITY_CRITICAL
])

function getVulnSeverity (severity) {
  if (severity == null) {
    logger.error(`vuln severity null found`)
    severity = SEVERITY_MEDIUM
  }

  severity = severity.toUpperCase()
  if (ValidSeverities.has(severity)) return severity

  logger.error(`unknown vuln severity: "${severity}"`)
  return SEVERITY_MEDIUM
}

// return a nice numeric value for a human
function hs (number) {
  if (number == null) return '0'
  return number.toLocaleString()
}

module.exports = {
  SEVERITY_NONE,
  SEVERITY_LOW,
  SEVERITY_MEDIUM,
  SEVERITY_HIGH,
  SEVERITY_CRITICAL,
  setBooleanSeverity,
  setBooleanSeverityHits,
  setValueSeverity,
  getVulnSeverity,
  hs
}
