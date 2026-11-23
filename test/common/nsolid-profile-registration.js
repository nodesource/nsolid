'use strict';

const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');

module.exports = function profileRegistration(agent, type, defer) {
  if (defer) {
    internalBinding(`nsolid_${agent}_agent`).deferProfileRegistrationForTesting();
  }

  if (type === 'snapshot') {
    nsolid.snapshot();
    return;
  }

  nsolid[type]();
  nsolid[`${type}End`]();
};
