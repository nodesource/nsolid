'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const semver = require('semver')

const StaticVulnDbFileName = path.join(__dirname, 'snyk-snapshot.json')
exports.create = create

function create (context) {
  return new VulnManager(context)
}

class VulnManager {
  constructor (context) {
    this._context = context
    this._vulnData = new Map() // map of pkg name -> [vulnRecord ...]
    this._vulnsById = new Map() // map of vuln id -> vulnRecord
    this._vulnDbHash = null // hash of vulnDb content
    this._vulnsActive = new Set()
    this._lastUpdated = null // timestamp to store the lastUpdated field

    setImmediate(() => {
      this._readVulnDb()
    })
  }

  shutdown () {
    clearInterval(this.refreshInterval)
  }

  // get the vuln data for a vuln id
  getVulnById (vulnId) {
    return this._vulnsById.get(vulnId)
  }

  // update the set of active vulns across all processes, sending the
  // active-vulns-updated event when they change
  updateActiveVulns () {
    const activeVulnsSet = new Set()

    // get the list of all vulnIds across all processes
    for (const agent of this._context.agentManager.list()) {
      for (const vuln of agent.vulns) {
        activeVulnsSet.add(vuln.id)
      }
    }

    // diff from what we have stored
    const newActiveVulns = Array.from(activeVulnsSet).sort()
    const oldActiveVulns = Array.from(this._vulnsActive).sort()

    // if not different, just return
    const changed = newActiveVulns.join(',') !== oldActiveVulns.join(',')
    if (!changed) return

    // if different, fire event
    this._vulnsActive = activeVulnsSet
    this._context.eventManager.emitSystemEvent('active-vulns-updated', null, {
      vulnIds: newActiveVulns
    })
  }

  // return a shallow copy of the vulns associated with a package, with an
  // additional `packages` property, which is an array of the affected package
  // paths
  getLinkedVulns (packages) {
    const vulnMap = new Map()

    // set the `packages` property
    for (const pkg of packages) {
      for (const vulnId of pkg.vulns) {
        let vuln = vulnMap.get(vulnId)
        if (vuln == null) {
          vuln = this.getVulnById(vulnId)
          if (vuln == null) continue // shouldn't happen

          vuln = Object.assign({}, vuln)
          vuln.packages = []
          vulnMap.set(vulnId, vuln)
        }

        vuln.packages.push(pkg.path)
      }
    }

    // return copy of vulns
    return Array.from(vulnMap.values())
  }

  // get the vulns for a package
  getVulnsForPackage (packageName) {
    return this._vulnData.get(packageName)
  }

  updateHiddenVulns (cb) {
    cb = cb || function () {}
    getHiddenVulnIds(this._context, (err, vulnIds) => {
      if (err) {
        Logger.error(err, 'error getting hidden vuln ids')
        return cb(err)
      }
      vulnIds = new Set(vulnIds)

      for (const vuln of this._vulnsById.values()) {
        if (vuln.nsolidMetaData == null) vuln.nsolidMetaData = {}
        vuln.nsolidMetaData.hidden = vulnIds.has(vuln.id)
      }
      return cb()
    })
  }

  setHiddenVulnId (vulnId, hidden, cb) {
    getHiddenVulnIds(this._context, (err, vulnIds) => {
      if (err) {
        Logger.error(err, 'error getting hidden vuln ids')
        return cb(err)
      }
      vulnIds = new Set(vulnIds)

      if (hidden) {
        vulnIds.add(vulnId)
      } else {
        vulnIds.delete(vulnId)
      }

      setHiddenVulnIds(this._context, Array.from(vulnIds), (err) => {
        if (err) {
          Logger.error(err, 'error setting hidden vuln ids')
          return cb(err)
        }

        this.updateHiddenVulns(cb)
      })
    })
  }

  getVulnsForAgent (agent) {
    if (agent == null) return []
    if (agent.vulns == null) return []

    return agent.vulns
      .map(vulnId => this.getVulnById(vulnId))
      .filter(vuln => vuln != null)
  }

  // Return an array of vuln objects associated with this package.
  // Side-effect of updating the package objects with a `vulns` array
  // which is an array of vulnIds.
  setVulnsForPackages (packages) {
    // add each found vuln to a set
    const vulnsReturned = new Set()

    // process each package
    for (const pkg of packages) {
      pkg.vulns = []

      const pkgVulns = this.getVulnsForPackage(pkg.name)

      // if no vulns for this package, continue
      if (pkgVulns == null) continue

      // check each vuln
      for (const pkgVuln of pkgVulns) {
        const vulnSemverRange = pkgVuln.vulnerable

        // not in range
        if (!semver.valid(pkg.version)) {
          Logger.warn(`version for package ${pkg.name} is not valid: ${pkg.version}`)
          continue
        }

        if (!semver.satisfies(pkg.version, vulnSemverRange)) continue

        // check for flag file
        if (hasVulnFlagFile(pkg, pkgVuln.id)) continue

        // it's vulnerable

        // add vuln to package.vulns
        pkg.vulns.push(pkgVuln.id)

        vulnsReturned.add(pkgVuln)
      }
    }

    // return the set of vulns we collected, as an array sorted by id
    const vulns = Array.from(vulnsReturned)
      .sort((a, b) => a.id.localeCompare(b.id))

    // process any newly seen vulns
    checkForNewSeenVulns(this._context, vulns)

    return vulns
  }

  // if license has become valid, download the vulndb immediately
  _licenseUpdated (event) {
    Logger.debug(`license updated: ${JSON.stringify(event)}`)
    if (event == null || event.args == null) return
    if (event.args.licensed !== true) return

    // remove this event listener and download the vulndb
    this.revokeLicenseUpdated()
    this._downloadVulnDb()
  }

  // read the cached vuln db
  _readVulnDb () {
    let reader = readFile(this._vulnDbFileName)
    if (reader.content) {
      Logger.info('setting vulnerability data from cached file')
      return this._setVulnDataFromContent(reader.content, { writeFile: false })
    }

    reader = readFile(StaticVulnDbFileName)
    if (reader.content) {
      return this._setVulnDataFromContent(reader.content)
    }

  }

  // set the live vuln data from the content
  _setVulnDataFromContent (content, opts) {
    if (opts == null) opts = {}

    if (content == null) {
      return
    }

    // get a hash of the content
    const hash = hashString(content)

    // if hash is the same has the last hash, return
    if (hash === this._vulnDbHash) return

    // parse the content, returning if not JSON
    let contentObject
    try {
      contentObject = JSON.parse(content)
    } catch (err) {
      return
    }

    if (contentObject == null) {
      return
    }

    const lastUpdated = contentObject.lastUpdated
    contentObject = contentObject.npm
    if (contentObject == null) {
      return
    }

    // now we have to reset the universe
    this._vulnDbHash = hash
    this._lastUpdated = lastUpdated

    // build the new live vuln data
    this._vulnData.clear()
    this._vulnsById.clear()

    for (const packageName in contentObject) {
      const vulns = contentObject[packageName]
      const vulnData = vulns
        .map(normalizeVuln)
        .filter(vuln => vuln != null)

      this._vulnData.set(packageName, vulnData)

      for (const vuln of vulnData) {
        this._vulnsById.set(vuln.id, vuln)
      }
    }
  }
}
// given a vuln from snyk, return the value we use in APIs
function normalizeVuln (vuln) {
  if (vuln.id == null) {
    Logger.warn('no id name for vuln', vuln)
    return null
  }

  let vulnSemver = vuln.semver && vuln.semver.vulnerable

  // welp, if no value, give it a bogus one, better than nothing
  vulnSemver = vulnSemver || '0.0.0'

  // snyk v2 changed semver ranges form string to array of string, but we'll
  // keep it as a string, and join the expressions.  Supposedly for node they
  // will always return an array with one element, but ...
  if (Array.isArray(vulnSemver)) vulnSemver = vulnSemver.join(' || ')

  // if vulnSemver is an empty array, the expression `vulnSemver || '0.0.0'` will be `[]`,
  // and the `[].join(' || ')` will be an empty string ('') and that will break schema validation.
  vulnSemver = vulnSemver || '0.0.0'

  if (!semver.validRange(vulnSemver)) {
    Logger.warn(`invalid semver range for ${vuln.id} - "${vulnSemver}"`)
    return null
  }

  if (vuln.packageName == null) {
    Logger.warn(`no package name for ${vuln.id}`)
    return null
  }

  return {
    package: vuln.packageName,
    title: vuln.title,
    published: vuln.publicationTime,
    credit: vuln.credit,
    id: vuln.id,
    ids: vuln.identifiers,
    vulnerable: vulnSemver,
    severity: vuln.severity,
    description: vuln.description
  }
}

// Snyk vuln id's use colon, but files have hyphens, so xlate -> hyphen.
// Can't translate the other way, since hyphen is valid in a package name.
// Example flag file names:
//   .snyk-npm-marked-20140131-1.flag   => id: npm:marked:20140131-1
//   .snyk-npm:npm:marked:20150520.flag => id: npm:marked:20150520
function hasVulnFlagFile (pkg, vulnId) {
  const flagFiles = pkg && pkg.flagFiles
  if (flagFiles == null) return false

  vulnId = vulnId.replace(/:/g, '-')
  for (const flagFile of flagFiles) {
    if (flagFile.endsWith(`${vulnId}.flag`)) return true
  }

  return false
}

// read a file, returning an object with either `content` or `err` property
function readFile (fileName) {
  try {
    return { content: fs.readFileSync(fileName, 'utf8') }
  } catch (err) {
    return { err: err }
  }
}

// write a file, returning an error if it occurred
function writeFile (fileName, content) {
  try {
    fs.writeFileSync(fileName, content)
  } catch (err) {
    return err
  }
}

// hash a string
function hashString (string) {
  const hash = crypto.createHash('sha1')
  hash.update(string)
  return hash.digest('hex')
}

function getLicenseKey (context) {
  if (context == null || context.provider == null || context.provider.license == null) {
    return null
  }

  if (context.provider.license.valid !== true) return null

  return context.provider.license.key
}

// see if any of the vulns passed in are new ids we've not seen so far, ever
function checkForNewSeenVulns (context, vulns) {
  // just need the vuln ids
  const vulnIds = vulns.map(vuln => vuln.id)

  // build a set of potential new vuln ids
  const newVulnIds = new Set(vulnIds)

  // delete seen vulns from the potential new vuln ids
  getSeenVulnIds(context, (err, seenVulnIds) => {
    if (err) {
      Logger.error(err, 'error getting seen vuln ids')
      return
    }

    for (const vulnId of seenVulnIds) {
      newVulnIds.delete(vulnId)
    }

    // if no new ones, leave
    if (newVulnIds.size === 0) return

    // otherwise we need to update the seen vulns, so build the array
    const newSeenVulnIds = seenVulnIds.concat(Array.from(newVulnIds))

    // make the update
    setSeenVulnIds(context, newSeenVulnIds, (err) => {
      if (err) {
        Logger.error(err, 'error updating seen vuln ids')
      }

      // after updating (even if failure), send events for each new vuln
      for (const newVulnId of newVulnIds) {
        context.eventManager.emitSystemEvent('new-vulnerability-found', null, { vulnId: newVulnId })
      }
    })
  })
}

// generalSettings id for our saved list of vulns
const SeenVulnIdsSettingsId = 'seen-vuln-ids'

// get the list of all the vuln ids we've seen so far, ever
function getSeenVulnIds (context, cb) {
  context.settingsManager.getEntry('generalSettings', SeenVulnIdsSettingsId, (err, record) => {
    if (err) return cb(err)
    if (record == null) return cb(null, [])
    if (!Array.isArray(record.vulnIds)) return cb(null, [])

    return cb(null, record.vulnIds)
  })
}

// update the list of all the vuln ids we've seen so far, ever
function setSeenVulnIds (context, vulnIds, cb) {
  vulnIds = vulnIds.slice().sort()

  const record = {
    id: SeenVulnIdsSettingsId,
    vulnIds: vulnIds
  }

  context.settingsManager.setSetting('generalSettings', record, cb)
}

// generalSettings id for our saved list of vulns
const HiddenVulnIdsSettingsId = 'hidden-vuln-ids'

// get the list of all the vuln ids we've seen so far, ever
function getHiddenVulnIds (context, cb) {
  context.settingsManager.getEntry('generalSettings', HiddenVulnIdsSettingsId, (err, record) => {
    if (err) return cb(err)
    if (record == null) return cb(null, [])
    if (!Array.isArray(record.vulnIds)) return cb(null, [])

    return cb(null, record.vulnIds)
  })
}

// update the list of all the vuln ids we've seen so far, ever
function setHiddenVulnIds (context, vulnIds, cb) {
  vulnIds = vulnIds.slice().sort()

  const record = {
    id: HiddenVulnIdsSettingsId,
    vulnIds: vulnIds
  }

  context.settingsManager.setSetting('generalSettings', record, cb)
}
