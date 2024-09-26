'use strict'

// Provide a pool to handle a fixed-size set of objects.

exports.create = create

const SIZE_MAX = 1000
const SIZE_DEFAULT = 25

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

function create (name, options) {
  return new FixedSizePool(name, options)
}

class FixedSizePool {
  constructor (name, options) {
    options = Object.assign({}, options)

    this._nextId = 1
    this._name = name
    this._objectMap = new Map()

    // uses the setter to set this
    this.maxSize = options.maxSize || SIZE_DEFAULT
  }

  toString () {
    return `${this.constructor.name}{${this.name}}`
  }

  get name () { return this._name }
  get size () { return this._objectMap.size }
  get isEmpty () { return this.size === 0 }
  get available () { return this.maxSize - this.size }
  get isAvailable () { return this.available > 0 }
  get maxSize () { return this._maxSize }

  set maxSize (value) {
    if (typeof value !== 'number') {
      logger.warn(`${this} maxSize requested value not a number, ignored: ${value}`)
      return
    }

    if (value < 1) value = 1

    if (value > SIZE_MAX) {
      logger.warn(`${this} maxSize requested beyond max (${value}), so set to max: ${SIZE_MAX}`)
      value = SIZE_MAX
    }

    this._maxSize = value
  }

  get status () {
    let props = 'maxSize size available isAvailable'
    props = props
      .split(/\s+/)
      .map(prop => `${prop}: ${this[prop]}`)
      .join('; ')
    return `${this}: ${props}`
  }

  add (object) {
    if (!this.isAvailable) return null

    const id = this._nextId++
    this._objectMap.set(id, object)

    return id
  }

  get (id) {
    return this._objectMap.get(id)
  }

  getAll () {
    return Array.from(this._objectMap.entries())
      .map(([id, object]) => ({ id, object }))
  }

  delete (id) {
    const existed = this._objectMap.has(id)
    this._objectMap.delete(id)

    return existed
  }
}
