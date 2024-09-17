'use strict'

// generates certData of the form: {
//    original: <the original license object>
//    corrected: <spdx expression, or null>
// }
// The original property is an arbitrary object, often a string, but maybe
// an object, array of strings, array of objects, etc
// The corrected property is a SPDX expression, for use with spdx-satisfies

const spdxCorrect = require('spdx-correct')

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run,
  fileName: __filename,
  description: 'get license information from just the package.json',
  time: 5 * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    packageInfo: 'npm package info'
  },
  output: {
    certName: 'name of the cert',
    certData: 'data of the cert'
  }
})

async function run (context, input) {
  const certData = getLicenseInfo(input.packageInfo)

  return Object.assign({}, input, {
    certName: 'license',
    certData,
    worker: context.worker.name
  })
}

// for more info on the license property in package.json, see:
// https://docs.npmjs.com/files/package.json.html#license

// returns { original: anObject, corrected: aStringOrNull }
function getLicenseInfo (packageInfo) {
  const result = {
    original: null,
    corrected: null
  }

  if (packageInfo == null) return result

  // check either license or licenses
  let license = packageInfo.license || packageInfo.licenses

  if (license == null) return result

  // if it's not an array, return license info
  if (!Array.isArray(license)) {
    return getSingleLicenseInfo(license)
  }

  // if it's an array of length zero, return default
  if (Array.isArray(license) && license.length === 0) {
    result.original = []
    return result
  }

  // if it's an array of length one, just use that element
  if (Array.isArray(license) && license.length === 1) {
    return getSingleLicenseInfo(license[0])
  }

  // return aggregated info from licenses array property, if present
  if (Array.isArray(license)) {
    result.original = license

    // get corrections on the elements
    const corrected = license.map(license => getSingleLicenseInfo(license))
      .map(licenseInfo => licenseInfo.corrected)

    // if any couldn't be corrected, the whole thing can't be corrected
    for (let oneCorrection of corrected) {
      if (oneCorrection == null) return result
    }

    // return OR'd expression
    result.corrected = `(${corrected.join(' OR ')})`

    return result
  }

  // return default
  return result
}

// returns { original: anObject, corrected: aStringOrNull }
function getSingleLicenseInfo (license) {
  const result = {
    original: license,
    corrected: null
  }

  if (license == null) return result

  let licenseString

  // get the license string from likely places
  if (typeof license === 'string') licenseString = license
  else if (typeof license.type === 'string') licenseString = license.type
  else if (typeof license.name === 'string') licenseString = license.name
  else if (typeof license.license === 'string') licenseString = license.license

  // nuthin? return
  if (licenseString == null) return result

  // trim it and check for empty string
  licenseString = licenseString.trim()
  if (licenseString === '') return result

  // correct it - handles expressions as well
  try {
    result.corrected = spdxCorrect(licenseString)
  } catch (err) {
    return result
  }

  return result
}
