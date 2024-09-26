'use strict';

// Entrypoint for the embedded internal module
const bindings = internalBinding('nsolid_statsd_agent');
module.exports =
  require('internal/agents/statsd/lib/agent')(bindings);
