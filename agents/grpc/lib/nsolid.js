'use strict';

// Entrypoint for the embedded internal module
const bindings = internalBinding('nsolid_grpc_agent');
module.exports =
  require('internal/agents/grpc/lib/agent')(bindings);
