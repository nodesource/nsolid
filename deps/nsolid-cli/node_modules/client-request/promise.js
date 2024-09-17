const request = require('./request')

module.exports = requestPromise

function requestPromise (opts) {
  return new Promise(function wrapped (resolve, reject) {
    request(opts, function (err, response, body) {
      if (err) {
        reject(err)
      } else if (response.statusCode >= 400) {
        err = new Error('Status code ' + response.statusCode)
        err.response = response
        err.body = body
        reject(err)
      } else {
        var result = {
          body: body,
          response: response
        }
        resolve(result)
      }
    })
  })
}
