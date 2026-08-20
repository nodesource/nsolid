'use strict';

const util = require('node:util');
const debuglog = util.debuglog('test');
const zmq = require('zeromq');

class ZMQBindSocket {
  constructor(params) {
    this.bindUrl = params.bindUrl;
    this.name = params.name;
    this.type = params.type;
    this.bindCb = params.bindCb;
    this.messageHandler = params.messageHandler;
    this.server = params.server;

    if (!/:\/\//.test(this.bindUrl)) {
      this.bindUrl = 'tcp://' + this.bindUrl;
    }

    if (/^(sub|push)$/.test(this.type)) {
      console.error(`Use ZMQRemoteSocket for ${this.type} sockets (${params.bindUrl || params.remoteUrl})`);
      throw new Error('let\'s crash');
    }

    this.socket = zmq.socket(params.type);

    this.socket.monitor(500, 0);
    if (params.hwm) {
      this.socket.setsockopt(zmq.ZMQ_SNDHWM, params.hwm);
    }
    this.socket.setsockopt(zmq.ZMQ_IPV6, 1);
    this.socket.setsockopt(zmq.ZMQ_BACKLOG, 2048);

    // Make every subscription fire a message even if it's redundant.  Without
    // this, agents trying to get configuration at the same time will fail.
    if (this.type === 'xpub') {
      this.socket.setsockopt(zmq.ZMQ_XPUB_VERBOSE, 1);
    }

    if (params.privateKey) {
      this.socket.curve_server = 1;
      this.socket.curve_secretkey = params.privateKey;
    }

    this.socket.on('bind', () => {
      debuglog(`${this.type} socket bound to ${this.bindUrl}`);
      if (this.bindCb) {
        this.bindCb();
      }
    });
    this.socket.on('bind_error', (event, endpoint, ex) => this.exitOnError(ex || event));

    this.socket.on('message', this.messageHandler);
    this.socket.bind(this.bindUrl);

    this.socket.on('accept', () => debuglog(`${this.type} socket accepted a remote connection to ${this.bindUrl}`));
  }

  exitOnError(err) {
    if (!(err instanceof Error)) err = new Error(`zmq bind error: ${err}`);
    console.error(err, `Couldn't bind ${this.type} channel socket to ${this.bindUrl}`);
    if (this.bindCb) {
      this.bindCb(err);
    } else {
      throw new Error('let\'s crash');
    }
  }

  close() {
    // Already closed
    if (!this.socket) return;

    this.socket.setsockopt(zmq.ZMQ_LINGER, 0);
    // If we bound to a wildcard, ZMQ doesn't actually allow you to unbind from
    // that same string, so you must ask it for what it believes the bind
    // address is.  Who even knows why.
    const unbindUrl = this.socket.getsockopt(zmq.ZMQ_LAST_ENDPOINT);
    this.socket.unbind(unbindUrl, (err) => {
      if (err) {
        console.error(`Error while unbinding ZMQ socket: ${err.stack}`);
      }
      this.socket.removeAllListeners();
      this.socket.unmonitor();
      this.socket.close();
      this.socket = null;
    });
  }
}

module.exports = ZMQBindSocket;
