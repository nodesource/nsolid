'use strict'

// accessor for ncm-api service

exports.create = create

function create (config) {
  config = Object.assign({}, config)

  const url = config.url
  if (url == null) throw new Error('config.url was null')

  return new NcmApi()
}

class NcmApi {
  constructor (config) {
    this.config = config
  }
}
