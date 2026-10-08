'use strict'

exports.postInfo = postInfo
exports.postError = postError

// see: https://get.slack.help/hc/en-us/articles/202288908-how-can-i-add-formatting-to-my-messages-#lists
exports.BULLET = '•'

const Config = require('./config')
const clientRequest = require('./client-request')

const nsUtil = require('../util')
const logger = nsUtil.logger.getLogger(__filename)

async function postInfo (title, text) {
  return postMessage('info', title, text)
}

async function postError (title, text) {
  return postMessage('error', title, text)
}

async function postMessage (type, title, text = '') {
  const config = Config.get()

  if (config.SLACK_WEBHOOK === '') {
    logger.debug(`slack webhook not configured; woulda posted ${type} message with title: ${JSON.stringify(title)}`)
    return
  }

  let color = '#F0E040'
  if (type === 'error') color = '#FF0000'

  title = sanitize(title)
  text = sanitize(text)

  const body = {
    username: `ncm-workers ${nsUtil.getEnvName()}`,
    icon_emoji: ':female-construction-worker:',
    attachments: [
      {
        color,
        title: title,
        fallback: title,
        fields: [
          {
            value: text,
            short: false
          }
        ]
      }
    ]
  }

  const requestOptions = {
    method: 'POST',
    uri: config.SLACK_WEBHOOK,
    body: JSON.stringify(body),
    timeout: 30 * 1000
  }

  try {
    await clientRequest(requestOptions)
  } catch (err) {
    if (err.statusCode !== 404) { // when webhook is disabled, status = 404
      logger.error(`error sending slack notification: ${err.message}`)
    }
  }
}

// see: https://api.slack.com/docs/message-formatting
function sanitize (string) {
  return string
    .replace('&', '&amp;')
    .replace('<', '&lt;')
    .replace('>', '&gt;')
}
