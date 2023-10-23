'use strict';

const path = require('path');
const jsdoc2md = require('jsdoc-to-markdown');

const jsonparsed = jsdoc2md.getTemplateDataSync({
  files: [ path.join(__dirname, '/../lib/nsolid.js'),
           path.join(__dirname, '/../doc/nsolid/nsolid.jsdoc'),
           path.join(__dirname, '/../agents/zmq/lib/agent.js') ],
});

jsonparsed.sort((a, b) => {
  if (a.kind === 'module') {
    if (b.kind !== 'module') {
      return -1;
    }
  } else if (b.kind === 'module') {
    return 1;
  }

  if (a.kind === 'typedef') {
    if (b.kind !== 'typedef') {
      return -1;
    }
  } else if (b.kind === 'typedef') {
    return 1;
  }

  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
});

console.log(jsdoc2md.renderSync({ data: jsonparsed }));
