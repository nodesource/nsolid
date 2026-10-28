'use strict'

const { cpus, loadavg, tmpdir } = require('os')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const { logger } = require('./util')
const Logger = logger.getLogger(__dirname, __filename)

class NcmAgent {
  constructor (context) {
    if (!NcmAgent.instance) {
      this.context = context
      this.queue = []
      this.pending = []
      this.parallel = this.computeParallel()
      this.isRunning = false
      this.retries = {}
      this.timeStart = Date.now()
      this.timeStop = null
      this.timeElapsed = null
      this.cacheDir = path.join(tmpdir(), 'nsolid')

      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir)
      }

      this.absoluteCacheDir = path.resolve(this.cacheDir)

      NcmAgent.instance = this
    }

    return NcmAgent.instance
  }

  computeParallel () {
    return Math.ceil(cpus().length / Math.round(Math.max(...loadavg(), 2)))
  }

  normalizePkgVer ({ name = '', version = '' }) {
    return name.replace(/[^\w\s]/gi, '') + version
  }

  enqueue (pkg) {
    const { callback, path: _path } = pkg
    const pkgVer = this.normalizePkgVer(pkg)
    if (this.pending.indexOf(pkgVer) >= 0) return

    fs.access(_path, err => {
      if (err) {
        callback(null, pkgVer, this.getPkgNameVer(pkg), false)
        return
      }

      this.pending.push(pkgVer)
      this.queue.push(pkg)

      if (this.isRunning) return
      this.runOnce()
    })
  }

  dequeue (parallel) {
    return this.queue.splice(0, parallel)
  }

  async runOnce () {
    if (this.isRunning) return
    this.isRunning = true
    this.parallel = this.computeParallel()

    let _queue = this.dequeue(this.parallel)
    Logger.info(`[NCM Workers] Starting ${this.parallel} workers`)
    this.startTimer()

    while (_queue.length) {
      await Promise.all(_queue.map(req => this.certify(req)))
      _queue = this.dequeue(this.parallel)
    }

    this.isRunning = false
    Logger.info('[NCM Workers] Finished:', this.stopTimer(), 'ms')
  }

  async certify (pkg) {
    const { callback, path: _path } = pkg
    const worker = new Promise(resolve => {
      const _args = [
        path.join(__dirname, 'parallel/ncm-agent.js'),
        _path,
        this.absoluteCacheDir
      ]
      const _opts = {
        stdio: 'ignore'
      }
      spawn('node', _args, _opts).on('exit', code => {
        let _retries = 0
        const pkgVer = this.normalizePkgVer(pkg)
        const cachePath = `${this.absoluteCacheDir}/${pkgVer}.json`
        if (code === 0) {
          try {
            callback(null, pkgVer, this.getPkgNameVer(pkg),
              require(cachePath))
          } catch (err) {
            this.retry(pkg, pkgVer, ++_retries)
          }
        } else {
          this.retry(pkg, pkgVer, ++_retries)
        }
        resolve(pkgVer)
      })
    })
    return await worker
  }

  retry (pkg, pkgVer, retries) {
    this.retries[pkgVer] = this.retries[pkgVer] || 0
    if (this.retries[pkgVer]++ > retries) return
    this.enqueue(pkg)
  }

  getPkgNameVer ({ name, version }) {
    return `${name}@${version}`
  }

  startTimer () {
    this.timeStart = new Date()
    return this.timeStart
  }

  stopTimer () {
    this.timeStop = new Date()
    this.timeElapsed = this.timeStop.getTime() - this.timeStart.getTime()
    return this.timeElapsed
  }
}

module.exports = context => new NcmAgent(context)
