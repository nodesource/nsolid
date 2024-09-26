'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

let i = 1e7;
while (i-- > 0) { /* empty */ }
const { blocked_for } = nsolid._getOnBlockedBody();
assert(blocked_for > 0);
assert(blocked_for < 1000); // It should be in the order of tens of ms
