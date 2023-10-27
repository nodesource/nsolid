'use strict';

const { ArrayIsArray } = primordials;
const { validateStringArray } = require('internal/validators');

module.exports = ({ bucket,
                    config,
                    send,
                    status,
                    start,
                    stop,
                    tags,
                    tcpIp,
                    udpIp }) => {
  const format = {
    bucket,
    tags,
    counter: function counter(name, value) {
      return `${bucket()}.${name}:${value}|c${tags()}`;
    },
    gauge: function gauge(name, value) {
      return `${bucket()}.${name}:${value}|g${tags()}`;
    },
    set: function set(name, value) {
      return `${bucket()}.${name}:${value}|s${tags()}`;
    },
    timing: function timing(name, value) {
      return `${bucket()}.${name}:${value}|ms${tags()}`;
    },
  };

  function sendRaw(str) {
    if (typeof str !== 'string') {
      validateStringArray(str, 'str');
    }

    if (status() !== 'ready') {
      return -1;
    }

    if (udpIp()) {
      // Split up chunks into lines to handle UDP MTU case.
      return send(ArrayIsArray(str) ? str : str.split(/\r?\n/g));
    }

    if (tcpIp()) {
      return send(ArrayIsArray(str) ? str : [ str ]);
    }

    return -1;
  }

  return {
    config,
    sendRaw,
    counter: function counter(name, value) {
      sendRaw(format.counter(name, value));
    },
    gauge: function gauge(name, value) {
      sendRaw(format.gauge(name, value));
    },
    set: function set(name, value) {
      sendRaw(format.set(name, value));
    },
    timing: function timing(name, value) {
      sendRaw(format.timing(name, value));
    },
    status,
    start,
    stop,
    tcpIp,
    udpIp,
    format,
  };
};
