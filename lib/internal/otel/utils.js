'use strict';

const { ArrayIsArray,
        Date } = primordials;

function isTimeInputHrTime(value) {
  return (ArrayIsArray(value) &&
         value.length === 2 &&
         typeof value[0] === 'number' &&
         typeof value[1] === 'number');
}
/**
 * check if input value is a correct types.TimeInput
 * @param value
 */

function isTimeInput(value) {
  return (isTimeInputHrTime(value) ||
          typeof value === 'number' ||
          value instanceof Date);
}

module.exports = {
  isTimeInput,
};
