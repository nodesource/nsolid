'use strict';

module.exports = ({ heapProfile,
                    heapProfileEnd,
                    heapSampling,
                    heapSamplingEnd,
                    profile,
                    profileEnd,
                    snapshot,
                    start,
                    status,
                    stop }) => {

  return {
    ...require('internal/nsolid_assets')({
      heapProfile,
      heapProfileEnd,
      heapSampling,
      heapSamplingEnd,
      profile,
      profileEnd,
      snapshot,
    }),
    start,
    status,
    stop,
  };
};
