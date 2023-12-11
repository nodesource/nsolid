'use strict';

const util = require('node:util');
const debuglog = util.debuglog('test');
const zmqzap = require('zmq-zap');
const zap = new zmqzap.ZAP();
const ZMQBindSocket = require('./socket');
const zmq = require('zeromq');

zap.use(new zmqzap.CurveMechanism(function(data, callback) {
  // Authorize all ZeroMQ socket connections.
  callback(null, true);
}));

// Create a version of a function which will only be called once
function onlyCallOnce(fn) {
  let called = false;

  return function onlyCalledOnce() {
    if (called) return;
    called = true;

    return fn.apply(null, arguments);
  };
}

class ZmqServer {
  constructor(config) {
    debuglog('ZeroMQServer constructor with config', config);
    this.started = false;
    this.config = config;
    this.keyPair = zmq.curveKeypair();
  }

  start(commandHandler, dataHandler, bulkHandler, cb) {
    if (this.started) {
      return cb(new Error('ZeroMQ server already started'));
    }
    debuglog('launching ZeroMQ Agent server');
    debuglog(`ZeroMQ data channel url: ${this.config.dataBindAddr}`);
    debuglog(`ZeroMQ bulk channel url: ${this.config.bulkBindAddr}`);
    debuglog(`ZeroMQ command channel url: ${this.config.commandBindAddr}`);

    const reply = onlyCallOnce(cb);
    let boundCount = 0;
    const socksBound = (err) => {
      if (err) reply(err);
      if (++boundCount === 3) reply();
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

  shutdown() {
    if (!this.started) {
      return;
    }
    debuglog('Shutting down ZeroMQ');

    closeCatching('data', this.data);
    closeCatching('bulk', this.bulk);
    closeCatching('command', this.command);
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
