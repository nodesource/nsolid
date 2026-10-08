'use strict'

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run: run,
  fileName: __filename,
  description: 'check scm parts of a package/version',
  time: 10 * 1000,
  input: {
    name: 'name of the package',
    version: 'version of the package',
    dir: 'unpacked tarball directory',
    packument: 'npm packument',
    packageInfo: 'npm package info'
  },
  output: {
    certName: 'name of the cert',
    certData: 'data of the cert',
    worker: 'name of the worker'
  }
})

const net = require('net')
const url = require('url')
const semver = require('semver')

const gitclient = require('git-fetch-pack')
const transport = require('git-transport-protocol')

const nsUtil = require('../../util')
const logger = nsUtil.logger.getLogger(__filename)

const lookup = require('../../lib/custom-dns-lookup')

async function run (context, input) {
  const { packageInfo } = input

  // npm normalizes scm repository information in packuments.
  //
  // As far as we know, this is the tool they use for this:
  // https://www.npmjs.com/package/hosted-git-info

  let repoType = packageInfo.repository && packageInfo.repository.type
  let repoUrl = packageInfo.repository && packageInfo.repository.url

  if (repoType === '') repoType = null
  if (repoUrl === '') repoUrl = null

  const result = Object.assign({}, input, {
    // this cert will apply to ANY version of the package
    version: 'any',
    certName: 'scm',
    certData: {},
    worker: context.worker.name
  })

  if (repoType == null || repoUrl == null) return result

  result.certData.type = repoType
  result.certData.url = repoUrl

  if (repoType !== 'git') return result

  try {
    var tagsObject = await remoteGitTags(repoUrl)
  } catch (err) {
    logger.error(`error running remoteGitTags(${repoUrl}): ${err.message}`)
    return result
  }

  const tags = new Set(tagsObject.keys())
  const versions = Object.keys(input.packument.versions)
  const finalVersions = versions
    .filter(version => {
      if (!semver.valid(version)) return false
      return semver.prerelease(version) == null
    })

  result.certData.tags = tags.size
  result.certData.versions = versions.length
  result.certData.finalVersions = finalVersions.length
  result.certData.taggedVersions = 0
  result.certData.taggedFinalVersions = 0

  for (let version of versions) {
    if (tagsHaveVersion(tags, version)) result.certData.taggedVersions++
  }

  for (let version of finalVersions) {
    if (tagsHaveVersion(tags, version)) result.certData.taggedFinalVersions++
  }

  return result
}

function tagsHaveVersion (tags, version) {
  if (tags.has(version)) return true
  if (tags.has(`v${version}`)) return true
  return false
}

// Logic like remote-git-tags, but fixed & better
function remoteGitTags (repoUrl) {
  return new Promise((resolve, reject) => {
    const tcp = net.connect({
      host: url.parse(repoUrl).host,
      port: 9418,
      lookup
    })

    const client = gitclient(repoUrl)
    const tags = new Map()

    client.refs.on('data', ref => {
      const name = ref.name

      if (/^refs\/tags/.test(name)) {
        // Strip off the indicator of dereferenced tags so we can
        // override the previous entry which points at the tag hash
        // and not the commit hash
        tags.set(name.split('/')[2].replace(/\^\{\}$/, ''), ref.hash)
      }
    })

    tcp.on('lookup', err => {
      if (err) reject(err)
    }).once('timeout', _ => {
      tcp.destroy(new Error('Connection timed out'))
    }).on('error', err => { reject(err) })

    client
      .pipe(transport(tcp))
      .on('error', err => { reject(err) })
      .pipe(client)
      .on('error', err => { reject(err) })
      .once('end', () => {
        resolve(tags)
      })
  })
}
