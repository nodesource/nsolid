'use strict'

exports.getScores = getScores
exports.getCertNames = getCertNames

const {
  SEVERITY_NONE,
  SEVERITY_LOW,
  SEVERITY_MEDIUM,
  SEVERITY_HIGH,
  SEVERITY_CRITICAL,
  setBooleanSeverity,
  setBooleanSeverityHits,
  setValueSeverity,
  hs
} = require('./helpers')

const byteSize = require('byte-size')
const spdxSatisfies = require('spdx-satisfies')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

// see: https://github.com/nodesource/ncm-workers/issues/34
// see: https://github.com/nodesource/ncm-workers/issues/102

const ValidSpdxs = [
  'MIT',
  'ISC',
  'Apache-1.0',
  'Apache-1.1',
  'Apache-2.0',
  'BSD-1-Clause',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-4-Clause'
]

const ValidSpdxExpression = `(${ValidSpdxs.join(' OR ')})`

const K = 1000

const ScoreFn = {
  deprecated: scoreFnDeprecated,
  readme: scoreFnReadme,
  diskUsage: scoreFnDiskUsage,
  license: scoreFnLicense,
  scm: scoreFnScm,
  installScripts: scoreFnInstallScripts,
  eval: scoreFnEval,
  dynamicRequire: scoreFnDynamicRequire,
  strictMode: scoreFnStrictMode,
  unsafeRegex: scoreFnUnsafeRegex,
  deprecatedNodeAPIs: scoreFnDeprecatedNodeAPIs,
  lostCallbackErrs: scoreFnLostCallbackErrs,
  abandonedPromises: scoreFnAbandonedPromises,
  callbackInAsyncFn: scoreFnCallbackInAsyncFn,
  asyncWithoutAwait: scoreAsyncWithoutAwait
}

function getCertNames () {
  return Object.keys(ScoreFn)
}

async function getScores (pkgName, version, certs) {
  let allScores = []
  let groups = new Map()
  groups.set('security', [])
  groups.set('compliance', [])
  groups.set('risk', [])
  groups.set('quality', [])

  for (let certDatum of certs) {
    const name = certDatum.name

    const scoreFn = ScoreFn[name]
    if (scoreFn == null) {
      logger.error(`no scorer for cert ${name} for ${pkgName} ${version}`)
      continue
    }

    const scores = scoreFn(pkgName, version, certDatum) || []

    allScores = allScores.concat(scores)
  }

  return allScores
}

// -----------------------------------------------------------------------------
function scoreFnDeprecated (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'deprecated'
  }
  setBooleanSeverity(score, !data.deprecated, SEVERITY_HIGH,
    'This package version is not deprecated.',
    `This package version is deprecated: ${data.deprecationInfo}`
  )

  return [ score ]
}

// -----------------------------------------------------------------------------
function scoreFnLicense (pkgName, version, certDatum) {
  const data = certDatum.data
  const original = data.original
  const corrected = data.corrected
  let score

  score = {
    package: pkgName,
    version: version,
    group: 'compliance',
    name: 'license',
    data: {
      spdx: corrected
    }
  }

  if (original == null) {
    score.title = 'This package version has no license.'
    score.pass = false
    score.severity = SEVERITY_HIGH

    return [ score ]
  }

  const originalJSON = JSON.stringify(original)

  if (corrected == null) {
    score.title = `This package version license is invalid: ${originalJSON}`
    score.pass = false
    score.severity = SEVERITY_HIGH

    return [ score ]
  }

  let acceptable
  try {
    acceptable = spdxSatisfies(ValidSpdxExpression, corrected)
  } catch (err) {
    acceptable = false
  }

  if (corrected && corrected.toLowerCase().includes('zlib')) acceptable = false

  if (!acceptable) {
    score.title = `This package version license is unacceptable: ${corrected}`
    score.pass = false
    score.severity = SEVERITY_MEDIUM

    return [ score ]
  }

  score.title = `This package version license is acceptable: ${corrected}`
  score.pass = true
  score.severity = SEVERITY_NONE

  return [ score ]
}

// -----------------------------------------------------------------------------
function scoreFnReadme (pkgName, version, certDatum) {
  const data = certDatum.data
  const scores = []
  let score

  score = {
    package: pkgName,
    version: version,
    group: 'quality',
    name: 'readme-exists'
  }

  setBooleanSeverity(score, data.hasReadme, SEVERITY_MEDIUM,
    'This package version has a README file.',
    `This package version does not have a README file.`
  )
  scores.push(score)

  if (data.hasReadme) {
    score = {
      package: pkgName,
      version: version,
      group: 'quality',
      name: 'readme-size'
    }
    score.title = `This package version has a README file of ${byteSize(data.size)}.`
    setValueSeverity(score, data.size, {
      [SEVERITY_NONE]: size => size > 1000,
      [SEVERITY_LOW]: size => size > 500,
      [SEVERITY_MEDIUM]: size => true
    })
    scores.push(score)
  }

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnDiskUsage (pkgName, version, certDatum) {
  const data = certDatum.data
  const scores = []
  let score

  // 'expandedSize': 240000, 'fileCount': 16, 'dirCount': 4

  score = {
    package: pkgName,
    version: version,
    group: 'quality',
    name: 'disk-usage-expanded-size'
  }

  score.title = `This package version's size on disk is ${byteSize(data.expandedSize)}.`
  setValueSeverity(score, data.expandedSize, {
    [SEVERITY_NONE]: size => size < 20 * K,
    [SEVERITY_LOW]: size => size < 50 * K,
    [SEVERITY_MEDIUM]: size => size < 100 * K,
    [SEVERITY_HIGH]: size => size < 1000 * K,
    [SEVERITY_CRITICAL]: size => true
  })
  scores.push(score)

  score = {
    package: pkgName,
    version: version,
    group: 'quality',
    name: 'disk-usage-file-count'
  }

  score.title = `This package has ${hs(data.fileCount)} file(s).`
  setValueSeverity(score, data.fileCount, {
    [SEVERITY_NONE]: size => size < 100,
    [SEVERITY_MEDIUM]: size => true
  })
  scores.push(score)

  score = {
    package: pkgName,
    version: version,
    group: 'quality',
    name: 'disk-usage-dir-count'
  }

  score.title = `This package has ${hs(data.dirCount)} dir(s).`
  setValueSeverity(score, data.dirCount, {
    [SEVERITY_NONE]: size => size < 20,
    [SEVERITY_MEDIUM]: size => true
  })
  scores.push(score)

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnScm (pkgName, version, certDatum) {
  const data = certDatum.data
  const scores = []
  let score

  score = {
    package: pkgName,
    version: version,
    group: 'quality',
    name: 'has-scm-info'
  }

  const hasScmInfo = data.type != null && data.url != null

  setBooleanSeverity(score, hasScmInfo, SEVERITY_HIGH,
    `This package version has a ${data.type} repository at ${data.url} .`,
    'This package version does not have a scm repository specified.'
  )
  scores.push(score)

  // if it's not a git repo, we don't have tags, so no additional scores
  if (data.type !== 'git') return scores

  // for git repos, calculate taggedFinalVersions / finalVersions; 'final'
  // indicates that it's not a pre-release version
  const finalVersions = data.finalVersions || 0
  const taggedFinalVersions = data.taggedFinalVersions || 0

  let percentage = 0
  if (finalVersions !== 0) percentage = taggedFinalVersions / finalVersions

  percentage = Math.round(percentage * 100)

  let acceptable
  if (finalVersions > 3) {
    acceptable = percentage > 80 // if not just a few versions, limit is 80%
  } else {
    acceptable = percentage > 30 // if just a few versions, limit is 30%
  }

  score = {
    package: pkgName,
    version: version,
    group: 'quality',
    name: 'scm-tagged-versions'
  }

  score.title = `This package has ${percentage}% tagged non-prelease versions in ${data.type}.`
  setValueSeverity(score, acceptable, {
    [SEVERITY_NONE]: acceptable => acceptable,
    [SEVERITY_MEDIUM]: acceptable => true
  })
  scores.push(score)

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnInstallScripts (pkgName, version, certDatum) {
  const data = certDatum.data
  const scores = []
  let score

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-install-scripts'
  }

  const riskyEvents = [
    'preinstall',
    'install',
    'postinstall',
    'preuninstall',
    'uninstall',
    'postuninstall'
  ]
  const scripts = data.installScripts
    ? data.scriptsOfNote.filter(name => riskyEvents.includes(name))
    : []

  setBooleanSeverity(score, scripts.length === 0, SEVERITY_CRITICAL,
    'This package version does not have install scripts.',
    `This package version has install scripts: ${scripts.join(', ')}.`
  )
  scores.push(score)

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-gyp-file'
  }

  setBooleanSeverity(score, !data.hasGypFile, SEVERITY_CRITICAL,
    'This package version does not have a Gyp build file.',
    `This package version has a Gyp build file.`
  )
  scores.push(score)

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnEval (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'uses-eval'
  }

  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_HIGH,
    'This package version does not use eval() or implied eval.',
    `This package version does eval at %location%.`
  )

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnDynamicRequire (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'uses-dynamic-require'
  }

  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_LOW,
    'This package version does not use dynamic require().',
    `This package version does use dynamic require() at %location%.`
  )

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnStrictMode (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'missing-strict-mode'
  }

  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_LOW,
    'This package version always uses strict mode.',
    `This package version doesn't use strict mode in %location%.`
  )

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnUnsafeRegex (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-unsafe-regexps'
  }

  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_MEDIUM,
    'This package version does not have unsafe regular expressions.',
    'This package version has an unsafe regular expression at %location%.'
  )

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnDeprecatedNodeAPIs (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'uses-deprecated-node-apis'
  }

  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_MEDIUM,
    'This package version does not use any deprecated Node APIs.',
    'This package version uses a deprecated Node API at %location% — %info%'
  )

  return scores
}

// -----------------------------------------------------------------------------
function scoreFnLostCallbackErrs (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-lost-callback-errs'
  }

  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_HIGH,
    'This package version handles all callback errors.',
    'This package version does not handle a callback error at %location%.'
  )

  return scores
}

function scoreFnAbandonedPromises (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-abandoned-promises'
  }
  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_HIGH,
    'This package version finalizes all detectable promises.',
    'This package version fails to finalize a promise at %location%.'
  )

  return scores
}

function scoreFnCallbackInAsyncFn (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-callback-in-async-function'
  }
  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_MEDIUM,
    'This package version does not misuse callbacks within async functions.',
    'This package version misuses a callback within a async function at %location%.'
  )

  return scores
}

function scoreAsyncWithoutAwait (pkgName, version, certDatum) {
  const data = certDatum.data
  let score

  if (data.hits == null) data.hits = []

  score = {
    package: pkgName,
    version: version,
    group: 'risk',
    name: 'has-async-without-await'
  }
  const scores = setBooleanSeverityHits(score, data.hits,
    data.hits.length === 0, SEVERITY_LOW,
    'This package version always uses await within async functions.',
    'This package version allocates an unncessary promise from an async function without await at %location%.'
  )

  return scores
}
