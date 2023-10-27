'use strict';

const {
  ErrorPrototype,
  JSONParse,
  JSONStringify,
  ObjectGetOwnPropertyNames,
  ObjectGetPrototypeOf,
} = primordials;
const binding = internalBinding('nsolid_api');
const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_NSOLID_CUSTOM_COMMAND_ALREADY_RETURNED,
    ERR_NSOLID_CUSTOM_COMMAND_OUT_OF_MEMORY,
  },
} = require('internal/errors');
const { UV_EINVAL,
        UV_ENOENT } = internalBinding('uv');

module.exports = {
  registerCommandCallback,
};

const commandCallbacks = {};
let initialized = false;

function deloop(replacer) {
  if (!replacer) {
    replacer = (key, value) => value;
  }

  const seen = [];
  return function(key, value) {
    const pos = seen.indexOf(this);
    if (pos > -1) {
      seen.splice(pos + 1);
    } else {
      seen.push(this);
    }
    if (seen.indexOf(value) > -1) {
      value = '[Circular]';
    }

    return replacer.call(this, key, value);
  };
}

function customStringify(value, replacer, space) {
  return JSONStringify(value, deloop(replacer), space);
}

function init() {
  // Set up command callback in the runtime
  binding.onCustomCommand((req_id, command, value) => {
    const cb = commandCallbacks[command];
    // Return errors to notify the C++ layer that some kind of error has
    // happened so the data can be cleaned up.
    if (!cb)
      return UV_ENOENT;

    let parsedValue;
    try {
      parsedValue = JSONParse(value);
    } catch {
      return UV_EINVAL;
    }

    function response(req_id, value, is_return) {
      // Coalesce `undefined` to null
      if (value == null) {
        value = null;
      } else if (ObjectGetPrototypeOf(value) === ErrorPrototype) {
        // For errors create a new object with every property
        const newValue = {};
        ObjectGetOwnPropertyNames(value).forEach((name) => {
          newValue[name] = value[name];
        });

        newValue.message = value.message;
        newValue.stack = value.stack;
        value = newValue;
      }

      const ret = binding.customCommandResponse(req_id,
                                                customStringify(value),
                                                is_return);
      // This only fails with UV_ENOENT
      if (ret !== 0)
        throw new ERR_NSOLID_CUSTOM_COMMAND_ALREADY_RETURNED(command, req_id);
    }

    const request = {
      value: parsedValue,
      return: (userValue) => response(req_id, userValue, true),
      throw: (userValue) => response(req_id, userValue, false),
    };

    // Install a weak callback in the `request` object so proper cleanup can be
    // performed regardless whether the consumer uses the `request` object.
    if (binding.attachRequestToCustomCommand(request, req_id) !== 0) {
      // This only fails with UV_ENOMEM
      throw new ERR_NSOLID_CUSTOM_COMMAND_OUT_OF_MEMORY(command, req_id);
    }

    cb(request);

    return 0;
  });
}

function registerCommandCallback(command, cb) {
  if (typeof command !== 'string' || command === '')
    throw new ERR_INVALID_ARG_TYPE('command', 'not empty string', command);

  // Init on the first call to registerCommandCallback
  if (!initialized) {
    init();
    initialized = true;
  }

  // There can be only one callback per command: the last one.
  commandCallbacks[command] = cb;
}
