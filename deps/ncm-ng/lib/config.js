'use strict'

const ENV_VAR_PREFIX = 'NCM_WORKERS_'
const SSM_PREFIX = '/ncm-workers'

exports.init = init
exports.initStatic = initStatic
exports.get = get
exports.log = log
exports.getConfigKeys = getConfigKeys
exports.getStaticConfigKeys = getStaticConfigKeys
exports.isStaticConfigKey = isStaticConfigKey
exports.ENV_VAR_PREFIX = ENV_VAR_PREFIX
exports.SSM_PREFIX = SSM_PREFIX

const LOCAL_CONFIG = {
  TMP_PATH: null, // Use random-generated tmp dir by default.
  SLACK_WEBHOOK: '',
  NCM2_API_URL: 'file:',
  QUEUE_FLOW_P0: 'memory:flow-p0',
  QUEUE_FLOW_P1: 'memory:flow-p1',
  QUEUE_FLOW_P2: 'memory:flow-p2'
}

// config keys that are mostly static, don't need to be in SSM, but can be
// overridden via env vars
const STATIC_CONFIG = {
  NPM_FOLLOW_REGISTRY: 'https://replicate.npmjs.com/registry'
}

const CONFIG_KEYS = Object.keys(LOCAL_CONFIG)

const DeauthedKeys = new Set()

const URL = require('url')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

const defaultOptions = {
}

const Config = {}
let Loaded = false

function getConfigKeys () {
  return Object.keys(Object.assign({}, LOCAL_CONFIG, STATIC_CONFIG))
}

function isStaticConfigKey (key) {
  return Object.keys(STATIC_CONFIG).indexOf(key) !== -1
}

function getStaticConfigKeys () {
  return Object.keys(STATIC_CONFIG)
}

function initStatic (config) {
  // delete existing keys
  for (let key in Config) {
    delete Config[key]
  }

  // add new keys
  for (let key in config) {
    Config[key] = config[key]
  }

  // set loaded to true
  Loaded = true

  logger.debug(`config loaded via initStatic: ${JSON.stringify(Config)}`)
}

// load configuration
async function init (options) {
  options = Object.assign({}, defaultOptions, options)

  if (Loaded) return
  Loaded = true

  if (options == null) throw new Error('options must not be null')

  Config.env = 'local'
  Config.envName = 'local'
  Config.isDeployed = false
  Config.PORT = process.env.PORT || '3001'

  const params = {
    Path: root,
    MaxResults: 10,
    Recursive: true,
    WithDecryption: true
  }

  // set config from SSM params
  for (let paramKey of Object.keys(params)) {
    if (!paramKey.startsWith(SSM_PREFIX)) continue

    const match = paramKey.match(/^\/.*?\/(.*?)\/(.*)/)
    if (match == null) {
      logger.warn(`skipping unmmatched ssm key/val: ${paramKey}: ${params[paramKey]}`)
      continue
    }

    const env = match[1]
    const configKey = match[2]
    const configVal = params[paramKey]

    if (env !== Config.env) {
      logger.debug(`skipping different env ssm key/val: ${paramKey}: ${params[paramKey]}`)
      continue
    }

    Config[configKey] = configVal
  }

  // set config for local envs from env vars and defaults
  if (!Config.isDeployed) {
    getEnvDefaults(Config)
    getLocalDefaults(Config)
  }

  // ensure expected properties are available
  let someMissing = false
  for (let configKey of CONFIG_KEYS) {
    if (Config[configKey] == null && LOCAL_CONFIG[configKey] != null) {
      someMissing = true
      logger.error(`config key ${configKey} for env ${Config.env} not found`)
    }
  }

  if (someMissing) {
    throw new Error('missing some config keys: see previous messages')
  }

  // add the static data, allowing it to be overridden
  for (let key of Object.keys(STATIC_CONFIG)) {
    Config[key] = STATIC_CONFIG[key]

    const envVarName = `${ENV_VAR_PREFIX}${key}`
    const envVal = process.env[envVarName]
    if (envVal == null) continue

    Config[key] = envVal
  }

  // replace %PR_NUM% in values for dev envs
  if (Config.env === 'dev') {
    const devPR = nsUtil.getEnvDevPR()

    if (devPR == null) {
      logger.warn(`dev env should have a PR number, but does not seem to`)
    } else {
      for (let key of Object.keys(Config)) {
        const val = Config[key]

        if (typeof val !== 'string') continue
        if (val.indexOf('%PR_NUM%') === -1) continue

        Config[key] = val.replace(/%PR_NUM%/g, devPR)
      }
    }
  }
}

// get the current configuration
function get () {
  if (!Loaded) throw new Error('configuration not yet loaded')

  return Object.assign({}, Config)
}

// log the current configuration
function log () {
  if (!Loaded) return logger.warn('config not yet loaded')

  const sortedKeys = Object.keys(Config).sort()

  for (let key of sortedKeys) {
    let val = Config[key]
    if (DeauthedKeys.has(key)) val = loggableURL(val)

    logger.info(`config: ${key} - ${val}`)
  }
}

// get defaults from the environment
function getEnvDefaults (config) {
  for (let configKey of CONFIG_KEYS) {
    const envVarName = `${ENV_VAR_PREFIX}${configKey}`
    if (config[configKey] != null) continue
    if (process.env[envVarName] == null) continue
    config[configKey] = process.env[envVarName]
  }
}

// get defaults for local-ish environments
function getLocalDefaults (config) {
  for (let configKey of CONFIG_KEYS) {
    if (config[configKey] != null) continue
    config[configKey] = LOCAL_CONFIG[configKey]
  }
}

// return a URL with the auth replaced with USER:PASS
function loggableURL (url) {
  if (url == null) return url

  try {
    var urlParsed = URL.parse(url)
  } catch (err) {
    logger.warning(`unable to parse url: "${url}"`)
    return 'unparseable-url'
  }

  urlParsed.auth = 'USER:PASS'
  return URL.format(urlParsed)
}
