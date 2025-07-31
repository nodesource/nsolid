'use strict';

// Entrypoint for the embedded internal module
const bindings = internalBinding('nsolid_zmq_agent');
module.exports =
  require('internal/agents/zmq/lib/agent')(bindings);
