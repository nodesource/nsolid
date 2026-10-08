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

let internal_span_id_ = 0;
function newInternalSpanId() {
  if (++internal_span_id_ === 0) {
    ++internal_span_id_;
  }

  return internal_span_id_;
}

module.exports = {
  newInternalSpanId,
  isTimeInput,
};
