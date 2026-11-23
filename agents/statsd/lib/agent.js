'use strict';

const {
  ArrayIsArray,
  Number,
  NumberMAX_VALUE,
  RegExpPrototypeExec,
  RegExpPrototypeSymbolReplace,
} = primordials;
const { validateNumber, validateStringArray } = require('internal/validators');
const {
  codes: {
    ERR_INVALID_ARG_VALUE,
  },
} = require('internal/errors');

module.exports = ({ bucket,
                    config,
                    send,
                    status,
                    tags,
                    tcpIp,
                    udpIp }) => {
  function sanitize(value) {
    return RegExpPrototypeSymbolReplace(/[\r\n|:#,]/g, `${value}`, '-');
  }

  function validateMetricValue(value) {
    if (typeof value === 'string') {
      const match = RegExpPrototypeExec(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/, value);
      if (match === null) {
        throw new ERR_INVALID_ARG_VALUE('value', value, 'must be a numeric string');
      }
      value = Number(value);
    }
    validateNumber(value, 'value', -NumberMAX_VALUE, NumberMAX_VALUE);
  }

  const format = {
    bucket,
    tags,
    counter: function counter(name, value) {
      validateMetricValue(value);
      return `${bucket()}.${sanitize(name)}:${value}|c${tags()}`;
    },
    gauge: function gauge(name, value) {
      validateMetricValue(value);
      return `${bucket()}.${sanitize(name)}:${value}|g${tags()}`;
    },
    set: function set(name, value) {
      if (typeof value !== 'string') {
        validateNumber(value, 'value', -NumberMAX_VALUE, NumberMAX_VALUE);
      }
      return `${bucket()}.${sanitize(name)}:${sanitize(value)}|s${tags()}`;
    },
    timing: function timing(name, value) {
      validateMetricValue(value);
      return `${bucket()}.${sanitize(name)}:${value}|ms${tags()}`;
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
    tcpIp,
    udpIp,
    format,
  };
};
