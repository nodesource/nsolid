'use strict'

// Deal with spdx licenses.

exports.isValidNCM1 = isValidNCM1
exports.satisfies = satisfies
exports.toCorrectedString = toCorrectedString

const UNKNOWN = 'unknown'

const NCM1xValidSpdxs = [
  'Apache-1.0', 'Apache-1.1', 'Apache-2.0',
  'BSD-1-Clause', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause',
  'ISC', 'MIT'
]

const NCM1xValidSpdxsExpression = `(${NCM1xValidSpdxs.join(' OR ')})`

const spdxSatisfies = require('spdx-satisfies')
const spdxCorrect = require('spdx-correct')

// return whether a license is a valid NCM 1x license (bsd, mit, apache, isc)
function isValidNCM1 (license) {
  return satisfies(license, NCM1xValidSpdxsExpression)
}

// return whether license satisfies the spdx expression
function satisfies (license, spdxExpression) {
  license = toCorrectedString(license)

  try {
    return spdxSatisfies(license, spdxExpression)
  } catch (err) {
    return false
  }
}

// Convert a value - string, object, null, etc to a license string, corrected.
// Specifically built to handle cases from package.json license/licenses.
// Multiple licenses will be returned as a spdx OR expression.
function toCorrectedString (licenseObject) {
  // handle a bunch of common cases
  switch (licenseObject) {
    case '':
    case null:
    case 'null':
    case undefined:
    case 'undefined':
    case UNKNOWN:
      return UNKNOWN
  }

  // if we found a single license, return it, "corrected" if correctable
  let licenseString = null
  if (typeof licenseObject === 'string') licenseString = licenseObject
  if (typeof licenseObject.type === 'string') licenseString = licenseObject.type

  // if we have a single string value ...
  if (licenseString != null) {
    licenseString = licenseString.trim() // trim it
    if (licenseString === '') return UNKNOWN // if empty string, return UNKNOWN

    // if SPDX expression-ish, return that
    if (licenseString.startsWith('(')) return licenseString

    // otherwise, return string, trying to correct it
    return correctedLicense(licenseString)
  }

  // we'll also check for arrays, but anything else is unknown
  if (!Array.isArray(licenseObject)) return UNKNOWN
  if (licenseObject.length === 0) return UNKNOWN

  // for arrays, map entry with this function, return `(${a[1]} OR ${a[2]} ...)`
  const licenses = licenseObject
    .map(toCorrectedString)

  if (licenses.length === 0) return UNKNOWN

  const licenseStrings = Array.from(new Set(licenses)) // uniq-ize

  if (licenseStrings.length === 1) return licenseStrings[0] // if only one, just return it
  return `(${licenseStrings.join(' OR ')})` // return as spdx OR expression
}

// wrapper for spdx-correct
function correctedLicense (licenseString) {
  try {
    var corrected = spdxCorrect(licenseString)
  } catch (err) {
    return licenseString
  }

  if (corrected != null) return corrected
  return licenseString
}
