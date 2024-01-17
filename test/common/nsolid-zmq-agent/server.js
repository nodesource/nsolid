'use strict';

const http = require('node:http');
const util = require('node:util');
const debuglog = util.debuglog('test');
const zmq = require('zeromq');
const ZMQBindSocket = require('./socket');

// Create a version of a function which will only be called once
function onlyCallOnce(fn) {
  let called = false;

  return function onlyCalledOnce() {
    if (called) return;
    called = true;

    return fn.apply(null, arguments);
  };
}

function isValidToken(token) {
  return true;
}

function startAuthServer(cb) {
  const keyPair = zmq.curveKeypair();
  const server = http.createServer((req, res) => {
    // Check that the request is valid by checking the NSOLID-SAAS-TOKEN header
    // and return a 200 ok with the key pairs. Otherwise return a 500 error.
    const token = req.headers['nsolid-saas-token'];
    if (isValidToken(token)) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
      });

      res.end(JSON.stringify({
        pub: keyPair.public,
        priv: keyPair.secret,
      }));
    } else {
      const body = JSON.stringify({
        message: 'Server Error',
        code: 500,
      });

      res.writeHead(500, {
        'Content-Length': body.length,
        'Content-Type': 'application/json',
      });

      res.end(body);
    }
  });

  server.listen(0, () => {
    cb(server, keyPair);
  });
}

class ZmqServer {
  constructor(config) {
    debuglog('ZeroMQServer constructor with config', config);
    this.started = false;
    this.config = config;
    this.authServer = null;
    this.keyPair = zmq.curveKeypair();
    this.clientKeyPair = null;
  }

  start(commandHandler, dataHandler, bulkHandler, authHandler, cb) {
    if (this.started) {
      return cb(new Error('ZeroMQ server already started'));
    }
    debuglog('launching ZeroMQ Agent server');
    debuglog(`ZeroMQ data channel url: ${this.config.dataBindAddr}`);
    debuglog(`ZeroMQ bulk channel url: ${this.config.bulkBindAddr}`);
    debuglog(`ZeroMQ command channel url: ${this.config.commandBindAddr}`);

    if (this.config.saas) {
      debuglog('starting ZAP auth handler');
      this.zap = new ZMQBindSocket({
        name: 'zap',
        type: 'rep',
        bindUrl: 'inproc://zeromq.zap.01',
        bindCb: (err) => {
          if (err) return cb(err);
          startAuthServer((server, clientKeyPair) => {
            this.authServer = server;
            this.clientKeyPair = clientKeyPair;
            this.#doStart(commandHandler, dataHandler, bulkHandler, cb);
          });
        },
        messageHandler: authHandler,
      });
    } else {
      this.#doStart(commandHandler, dataHandler, bulkHandler, cb);
    }
  }

  // TODO debounce these over a small time window?
  send(message) {
    if (message.id) {
      this.sendToAgent(message);
    } else {
      this.broadcast(message);
    }
  }

  sendToAgent(message) {
    if (!this.command.socket) {
      debuglog('Message could not be sent after socket closed', message);
    }

    debuglog('sending agent command message', message);
    const id = message.id;
    message = JSON.stringify(message);
    this.command.socket.send([`id:${id}`, message]);
  }

  broadcast(message) {
    if (!this.command.socket) {
      debuglog('Message could not be sent after socket closed', message);
    }

    debuglog('sending broadcast command message', message);
    message = JSON.stringify(message);
    this.command.socket.send(['broadcast', message]);
  }

  shutdown(cb) {
    if (!this.started) {
      return cb();
    }
    debuglog('Shutting down ZeroMQ');

    if (this.zap) {
      closeCatching('zap', this.zap);
    }

    closeCatching('data', this.data);
    closeCatching('bulk', this.bulk);
    closeCatching('command', this.command);

    if (this.authServer) {
      this.authServer.close(cb);
    } else {
      cb();
    }
  }

  #doStart(commandHandler, dataHandler, bulkHandler, cb) {
    const reply = onlyCallOnce(cb);
    let boundCount = 0;
    const socksBound = (err) => {
      if (err) reply(err);
      if (++boundCount === 3) reply(null, this.authServer);
    };

    this.data = new ZMQBindSocket({
      name: 'data',
      bindUrl: this.config.dataBindAddr,
      privateKey: this.keyPair.secret,
      hwm: this.config.HWM,
      type: 'pull',
      bindCb: socksBound,
      messageHandler: dataHandler,
      server: this,
    });

    this.bulk = new ZMQBindSocket({
      name: 'bulk',
      bindUrl: this.config.bulkBindAddr,
      privateKey: this.keyPair.secret,
      hwm: this.config.bulkHWM,
      type: 'pull',
      bindCb: socksBound,
      messageHandler: bulkHandler,
      server: this,
    });

    this.command = new ZMQBindSocket({
      name: 'command',
      bindUrl: this.config.commandBindAddr,
      privateKey: this.keyPair.secret,
      hwm: this.config.HWM,
      type: 'xpub',
      bindCb: socksBound,
      messageHandler: commandHandler,
      server: this,
    });

    this.started = true;
  }
}

function closeCatching(name, socket) {
  try {
    socket.close();
  } catch (err) {
    console.info(err, `error closing zmq socket ${name}`);
  }
}

module.exports = ZmqServer;
