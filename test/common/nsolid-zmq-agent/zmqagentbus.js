'use strict';

const { randomUUID } = require('node:crypto');
const util = require('node:util');
const debuglog = util.debuglog('test');
const EventEmitter = require('events').EventEmitter;
const base85 = require('base85');
const ZmqServer = require('./server');

const defaultProfileSettings = {
  duration: 5000, // milliseconds
  threadId: 0,
  metadata: {
    reason: 'unspecified',
  },
};

const defaultSnapshotSettings = {
  threadId: 0,
  metadata: {
    reason: 'unspecified',
  },
};

class ZmqAgentBus extends EventEmitter {
  constructor(serverConfig) {
    super();
    this.serverConfig = serverConfig;
    this.server = new ZmqServer(serverConfig);
  }


  // *********
  // Implement the AgentBus interface
  //

  /**
   * XPing an agent
   * This tells the agent to hangup and reconnect
   * @param {agentId} id the Agent id
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentXPingRequest(id, callback) {
    const args = { restart: true };
    const requestId = this._sendCB({ id: id, command: 'xping', args }, callback);
    debuglog('ZmqAgentBus:agentXPingRequest', requestId);
    return requestId;
  }

  /**
   * Ping an agent
   * @param {agentId} id the Agent id
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentPingRequest(id, callback) {
    const requestId = this._sendCB({ id: id, command: 'ping' }, callback);
    debuglog('ZmqAgentBus:agentPingRequest', requestId);
    return requestId;
  }

  /**
   * Broadcast a ping to all agents
   * @returns {string} requestId
   */
  broadcastPingRequest() {
    const requestId = this._send({ command: 'ping' });
    debuglog(`ZmqAgentBus:broadcastPingRequest ${requestId}`);
    // NB: this will only last until 2x timeout after the last reply
    // then it will be cleaned up
    this.on(`data:${requestId}`, (data) => {
      this.emit('agent-ping', null, data);
    });
    // NOTE: no error event because this is too niche and is only really
    // for testing and debugging
    return requestId;
  }
  // NB: No other commands are getting broadcast equivalents even though this zmq
  // protocol supports it. Just not useful enough. Use an Agent pool and a loop.

  /**
   * Request agent info from a connected agent
   * @param {agentId} id the Agent id
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentInfoRequest(id, callback) {
    const requestId = this._sendCB({ id: id, command: 'info' }, callback);
    debuglog('ZmqAgentBus:agentInfoRequest', requestId);
    return requestId;
  }

  /**
   * Request agent metrics from a connected agent
   * @param {agentId} id the Agent id
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentMetricsRequest(id, callback) {
    const requestId = this._sendCB({ id: id, command: 'metrics' }, callback);
    debuglog('ZmqAgentBus:agentMetricsRequest', requestId);
    return requestId;
  }

  /**
   * Request package list from a connected agent
   * @param {agentId} id the Agent id
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentPackagesRequest(id, callback) {
    const requestId = this._sendCB({ id: id, command: 'packages' }, callback);
    debuglog('ZmqAgentBus:agentPackagesRequest', requestId);
    return requestId;
  }

  /**
   * Request agent startup times object from a connected agent
   * @param {agentId} id the Agent id
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentStartupTimesRequest(id, callback) {
    const requestId = this._sendCB({ id: id, command: 'startup_times' }, callback);
    debuglog('ZmqAgentBus:agentStartupTimesRequest', requestId);
    return requestId;
  }

  // TODO tracing

  /**
   * Send reconfigure command to a connected agent
   * @param {agentId} id the Agent id
   * @param {object} config the configuration object
   * @param {Function} callback function(err, body)
   * @returns {string} requestId
   */
  agentReconfigureRequest(id, config, callback) {
    const requestId = this._sendCB({ id: id, command: 'reconfigure', args: config }, callback);
    debuglog('ZmqAgentBus:agentReconfigureRequest', requestId);
    return requestId;
  }

  /**
   * Send profile start to a connected agent
   * @param {agentId} id the Agent id
   * @param {object} profileSettings profile profile command settings object
   * @returns {string} requestId
   */
  agentProfileStart(id, profileSettings, callback) {
    const args = profileSettings === null ? profileSettings : { ...defaultProfileSettings, ...profileSettings };
    const requestId = this._sendCB({ id: id, command: 'profile', args }, callback);
    debuglog('ZmqAgentBus:agentProfileStart', requestId);
    return requestId;
  }

  // /**
  //  * Send profile stop to a connected agent
  //  * @param {agentId} id the Agent id
  //  * @returns {string} requestId
  //  */
  // agentProfileStop(id) {
  //   // TODO
  // }

  /**
   * Send heap snapshot command to a connected agent
   * @param {agentId} id the Agent id
   * @param {object} settings heap snapshot command settings object
   * @returns {string} requestId
   */
  agentSnapshotRequest(id, settings, callback) {
    const args = settings === null ? settings : { ...defaultSnapshotSettings, ...settings };
    const requestId = this._sendCB({ id: id, command: 'snapshot', args }, callback);
    debuglog('ZmqAgentBus:agentSnapshotRequest', requestId);
    return requestId;
  }

  // TODO send generic command to agent

  start(cb) {
    this.server.start(
      this._handleCommand.bind(this),
      this._handleMessage.bind(this),
      this._handleBulkMessage.bind(this),
      this._handleZapAuth.bind(this),
      cb,
    );
  }

  shutdown(cb) {
    this.server.shutdown(cb);
  }

  // ****************
  // Translate the AgentBus interface into ZeroMQ messages
  //

  _handshakeAgent(agentConfigTopicString, agentId) {
    // An agent connected and subscribed to configuration-<agentId>
    // it needs to be sent the rest of the configuration
    const payload = {
      config: { sockets: this.serverConfig },
    };
    debuglog('Sending handshake to agent', agentId);
    debuglog([agentConfigTopicString, JSON.stringify(payload)]);
    this._rawSend([agentConfigTopicString, JSON.stringify(payload)]);
    // Emit agent-connected event (soon)
    setImmediate(() => this.emit('agent-connected', agentId));
  }

  _handleZapAuth(version, reqId, domain, address, identity, mechanism, credentials) {
    const clientKey = base85.encode(credentials);
    if (mechanism.toString() !== 'CURVE') {
      this._unauthorize(version, reqId);
      debuglog(`[zap] ${clientKey} unauthorized: wrong mechanism '${mechanism}'`);
      return;
    }

    if (this.server.clientKeyPair.public === clientKey) {
      this._authorize(version, reqId);
      debuglog(`[zap] ${clientKey} authorized`);
    } else {
      this._unauthorize(version, reqId);
      debuglog(`[zap] ${clientKey} unauthorized`);
    }
  }


  _handleCommand(message) {
    const isSub = message[0];
    const subscription = message.slice(1).toString();

    // An incoming command on the command channel
    debuglog(`Handling agent ${isSub ? '' : 'UN'}subscription to ${message.toString('utf8')}`);
    // An XPUB message is a subscription.  The first byte in the buffer will be
    // 1 for subscribe and 0 for unsubscribe.  The remaining bytes are the
    // subscription string.
    if (isSub && /^configuration/.test(subscription)) {
      const matchedAgentId = subscription.match(/^configuration-(.*)/);
      if (matchedAgentId) {
        // An agent connected and subscribed to configuration-<agentId>
        // for its own agentId in order to receive non-broadcast configuration
        // messages

        // the agent does this upon startup, and usually only connects on one
        // channel because it is started with incomplete configuration and
        // is expecting a handshake reply with the rest of the configuration
        const agentId = matchedAgentId[1];
        this._handshakeAgent(subscription, agentId);
      }
    }
    // TODO other subscriptions types?
  }

  _handleMessage(rawMessage) {
    // An incoming message on the data channel
    // debuglog(`Handling DATA message: ${rawMessage.toString('utf8').substr(0, 100)}...`)
    debuglog(`Handling DATA message: ${rawMessage.toString('utf8')}`);
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch (err) {
      // No requestId available on parse error, so no real channel to emit to?
      // this.emit(`error:${message.requestId}`, new Error('ZeroMQ data message parse error'))
      // TODO what to do here?
      console.log('ZeroMQ data message parse error');
      console.log(err);
      return;
    }

    message.command = message.command || '_';
    debuglog(`Handling message: command: ${message.command} requestId: ${message.requestId} agentId: ${message.agentId}`);

    fixTimeProperties(message);

    if (message.requestId == null) {
      debuglog(`broadcasting unsolicited <${message.command}> message from <${message.agentId || 'broadcast'}>`);
      this.emit(`agent-${message.command}`, message.agentId, message);
    }

    if (message.error) {
      const err = message.error.message || 'No command response from agent.';
      const e = new Error(err);
      e.code = message.error.code;
      this.emit(`error:${message.requestId}`, e);
      return;
    }

    this.emit(`data:${message.requestId}`, message);
    if (message.complete) {
      this.emit(`end:${message.requestId}`);
    }
  }

  _handleBulkMessage(rawMessage, data) {
    // An incoming data envelope on the bulk channel
    let envelope;
    try {
      envelope = JSON.parse(rawMessage);
    } catch (err) {
      debuglog('ZeroMQ bulk envelope parse error -- unable to extract requestId');
      console.log(err);
      this.emit(`error:${envelope.requestId}`, new Error('ZeroMQ bulk envelope parse error'));
      return;
    }
    // Example envelope:
    // {"agentId":"2b76be9d590a15008b4db11ff42221004d5eb8bf",
    //  "requestId": "8b4a8f82-5a31-4782-91bb-6f3ac65900f3",
    //  "command":"snapshot",
    //  "duration":514,
    //  "metadata":{"reason":"unspecified"},
    //  "complete":true,
    //  "threadId":0,
    // "version":4}
    envelope.bulkId = envelope.requestId;
    debuglog(`incoming BULK packet for ${envelope.command} ${envelope.requestId}`);
    this.emit('asset-data-packet', envelope.agentId, { metadata: envelope, packet: data });
    if (envelope.complete) {
      // Delay just a tad to give the asset a bit of time to breathe
      setImmediate(() => { this.emit('asset-received', envelope.agentId, envelope); });
    }
  }

  _rawSend(messageTuple = []) {
    if (messageTuple.length !== 2 ||
      typeof messageTuple[0] !== 'string' ||
      typeof messageTuple[1] !== 'string') {
      throw new Error('Invalid message to _rawSend');
    }
    this.server.command.socket.send(messageTuple);
  }

  _authorize(version, reqId) {
    this.server.zap.socket.send([
      version,
      reqId,
      Buffer.from('200', 'utf8'),
      Buffer.from('OK', 'utf8'),
      Buffer.alloc(0),
      Buffer.alloc(0),
    ]);
    this.emit('agent-authorized');
  }

  _unauthorize(version, reqId) {
    this.server.zap.socket.send([
      version,
      reqId,
      Buffer.from('400', 'utf8'),
      Buffer.alloc(0),
      Buffer.alloc(0),
      Buffer.alloc(0),
    ]);
    this.emit('agent-unauthorized');
  }


  /**
   * Send a command to an N|Solid Agent over ZeroMQ.
   * @params {object} message
   * @params {string} message.id - The ID of the agent.
   * @params {string} message.command - The command type.
   * @params {string} message.requestId - The request ID to use to associate
   * responses.
   * @params {object} [message.args] - Optional key-value pairs to send as
   * arguments to the command.
   * @params {object} [message.filter] - Optional key-value pairs for the
   * agent to filter on to determine whether or not to process the message.
   */
  _send(message) {
    const defaults = { requestId: randomUUID(), version: 4 };
    message = { ...defaults, ...message };
    debuglog(`Sending command message: ${message.requestId}`);
    const self = this;

    const timeout = this.serverConfig.commandTimeoutMilliseconds || 10000;

    if (!message.command) {
      // Can't have any listeners till this method returns the requestId,
      // so emit the error later
      setImmediate(() => {
        this.emit(`error:${message.requestId}`, new Error('Command required.'));
      });
      return message.requestId;
    }

    const start = Date.now();
    debuglog(`ZmqAgentBus: dispatching ${message.command} to ${message.id || 'broadcast'}`);
    this.server.send(message);

    const cancelTimer = setTimeout(() => {
      const { id, requestId, command, filter, version } = message;
      const cancelMessage = { id, requestId, command, filter, version, cancel: true };

      this.server.send(cancelMessage);

      this.emit(`error:${message.requestId}`, new Error('Command timeout.'));
      debuglog(`Sending cancel command for ${message.command} to ${message.id || 'broadcast'} with requestId ${message.requestId}.`);
      debuglog(`Command timeout (${timeout} ms) for ${message.command} to ${message.id || 'broadcast'} with requestId ${message.requestId}.`);
    }, timeout);
    cancelTimer.unref(); // Don't prevent shutdown

    // whenever we receive data, defer the cleanup timer and prevent the cancel timer
    this.on(`data:${message.requestId}`, () => {
      debuglog(`Command ${message.command} to ${message.id || 'broadcast'} with requestId ${message.requestId} finished after ${Date.now() - start} ms`);
      clearTimeout(cancelTimer);
      deferCleanup();
    });
    // If we receive an error, prevent the cancel timer
    this.once(`error:${message.requestId}`, (err) => {
      debuglog(`Command ${message.command} to ${message.id || 'broadcast'} with requestId ${message.requestId} errored after ${Date.now() - start} ms -- ${err}`);
      clearTimeout(cancelTimer);
    });

    let cleanupTimer = null;

    function deferCleanup() {
      if (cleanupTimer !== null)
        clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(cleanup, timeout * 2);
      cleanupTimer.unref(); // Don't prevent shutdown
      return cleanupTimer;
    }

    // Automatically cleanup after timeout * 2, but allow deferral
    cleanupTimer = deferCleanup();

    // This will also clean up any listeners added elsewhere
    function cleanup() {
      debuglog(`Cleaning up listeners for zmq request: ${message.requestId}.`);
      self.removeAllListeners(`data:${message.requestId}`);
      self.removeAllListeners(`error:${message.requestId}`);
    }

    return message.requestId;
  }

  /**
   * Like send(message) but using a callback instead of events.
   * The callback is optional.
   *
   * This method can only be used with messages that respond with a single
   * data response, so SHOULD NOT be used with broadcast commands or commands
   * that send more than a single data response.
   */
  _sendCB(message, cb) {
    const requestId = this._send(message);

    this.once(`data:${requestId}`, (data) => finishUp(null, data));
    this.once(`error:${requestId}`, (err) => finishUp(err));

    function finishUp(err, data) {
      if (cb == null) return;
      if (err) cb(err);
      else cb(null, data);
      // Reset cb to null to prevent double callback
      // this could only happen if data and error both come back simultaneously
      debuglog('ZmqAgentBus: _sendCB callback called');
      cb = null;
    }

    return requestId;
  }
}

// Convert agents `time: {seconds: nanoseconds:}` into usable things.
// Note both `time` properties are strings, and nanoseconds is left-zero-padded.
function fixTimeProperties(object) {
  // Leave early unless a number of constraints hold
  if (object.recorded == null) return;

  const recorded = object.recorded;
  if (recorded.seconds == null) return;
  if (recorded.nanoseconds == null) return;

  // Get the numeric values of the properties
  const seconds = parseInt(recorded.seconds, 10);
  const nanoseconds = parseInt(recorded.nanoseconds, 10);

  // Final chance to give up
  if (!Number.isInteger(seconds) || !Number.isInteger(nanoseconds)) return;

  object.time = Math.round(seconds * 1000 + nanoseconds / 1000000);
  object.timeNS = `${recorded.seconds}${('000000000' + recorded.nanoseconds).slice(-9)}`;
}

module.exports = ZmqAgentBus;
