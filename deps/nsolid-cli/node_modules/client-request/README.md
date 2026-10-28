client-request
=====

[![NPM](https://nodei.co/npm/client-request.png)](https://nodei.co/npm/client-request/)

Sometimes you want to use a library that uses the (great!!) [request](http://npm.im/request) library but you can't have all those dependencies.

This library is a a very narrow subset of the common simpler uses of `request` that can be substituted for `request` without too much effort.

For the small subset of the `request` interface it implements, it is **super opinionated** and leaves any fancier features to you.

Just to be clear, this module **does not even try** to implement most of the features of `request`.

Things it does support from the `request` API:
* **Only** this call form: `var req = request(options, callback)`
* automatic selection of `http` or `https` based on the uri
* options.timeout
* options.json

If you want...
* `request.form` -- use [form-urlencoded](https://www.npmjs.com/package/form-urlencoded), a zero-deps form body encoder. (example below)
* `options.qs` -- use the core `querystring` library or [qs](http://npm.im/qs) and append the querystring to your url path prior to sending it to request
* anything else ... find a module and suggest it here!


```javascript
var request = require("client-request")

var options = {
  uri: "http://brycebaril.com",
  method: "POST",
  body: {blah: "some stuff"},
  timeout: 100,
  json: true
}

var req = request(options, function callback(err, response, body) {
  console.log(response.statusCode)
  if (body) {
    console.log(body)
  }
})

```

```javascript
var requestPromise = require("client-request/promise")

requestPromise(options).then(function (result) {
  if (result.response.statusCode === 201) {
    console.log(result.response.headers.location)
  } else {
    console.log(result.body)
  }
}).catch(err){
  console.log(err)
})
```

```javascript
var requestPromise = require("client-request/promise")

// ONLY in ES2016 and later, you can await a promise in an async function (generator)
async function(){
  try {
    let result = await requestPromise(options)
    console.log(result.response.headers.location)
  } catch (err) {
    console.log(err)
  }
}
```

WHY DID I MAKE THIS?
===

`request`
```
bryce@x1c:~/forks/request$ browserify --bare index.js -o bundle.js && wc -c bundle.js
741099 bundle.js
```

`client-request`
```
bryce@x1c:~/forks/client-request$ browserify --bare request.js -o bundle.js && wc -c bundle.js
6159 bundle.js
```

API
===

`var req = require("client-request")(options, callback)`
---

Perform a client request. Returned value is the core `http` request object.

The `callback` is executed with three arguments `callback(err, response, body)`
* err: any error when attempting to make the request, timeouts, or parse errors
* response: the core http Response object
* body: the `Buffer` returned by the server, or if `options.json` is used, the object the server's body deserializes into.

Options:
* `uri` -- a full uri, e.g. "https://example.com:9090/path?query=args"
* `method` -- GET, POST, PUT, etc. (Default GET)
* (generally similar to the core `http.request` options)
* `json` -- attempt to JSON.parse the response body and return the parsed object (or an error if it doesn't parse)
* `timeout` -- a timeout in ms for the client to abort the request
* `body` -- the raw body to send to the server (e.g. PUT or POST) -- if `body` is a string/buffer, it will send that, if `body` quacks like a stream, stream it, otherwise it will send it JSON serialized.
* `stream` -- if `true` callback will return raw `http.ServerResponse` stream. Stream error handling will be up to you.

Extensions
===

Forms
---

I suggest [form-urlencoded](https://www.npmjs.com/package/form-urlencoded) for your form needs.

Code with [request](http://npm.im/request):
```js
var request = require("request")

var form = {
  alice: "hi bob",
  bob: "hi alice"
}
var options = {
  uri: "https://mysite.example",
  form: form,
  method: "PUT",
}

var req = request(options, function callback(err, response) {
  // ...
})
```

Converted to use `client-request`:

```js
var request = require("request-client")
var encodeForm = require("form-urlencoded").encode

var form = {
  alice: "hi bob",
  bob: "hi alice"
}
var options = {
  uri: "https://mysite.example",
  body: encodeForm(form),
  method: "PUT",
  headers: {
    "content-type": "application/x-www-form-urlencoded"   // setting headers is up to *you*
  }
}

var req = request(options, function callback(err, response, body) {
  // ...
})
```

Querystrings
---

If it works for you, the core `querystring` module is a great way to avoid additional dependencies.

Code with request:
```js
var request = require("request")

var qs = {
  q: "what?",
  page: 99
}
var options = {
  uri: "https://mysite.example",
  qs: qs
}

var req = request(options, function callback(err, response, body) {
  // ...
})
```

```js
var request = require("request-client")
var encodeQuery = require("querystring").encode

var qs = {
  q: "what?",
  page: 99
}
var options = {
  uri: "https://mysite.example" + "?" + encodeQuery(qs)
}

var req = request(options, function callback(err, response, body) {
  // ...
})
```

LICENSE
=======

MIT
