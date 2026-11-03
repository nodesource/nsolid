'use strict';

const { nsolid_consts } = internalBinding('nsolid_api');

// HttpMethod values from nsolid_metrics.h.
const kHttpMethodMap = {
  __proto__: null,
  GET: nsolid_consts.kHttpMethodGet,
  HEAD: nsolid_consts.kHttpMethodHead,
  POST: nsolid_consts.kHttpMethodPost,
  PUT: nsolid_consts.kHttpMethodPut,
  DELETE: nsolid_consts.kHttpMethodDelete,
  CONNECT: nsolid_consts.kHttpMethodConnect,
  OPTIONS: nsolid_consts.kHttpMethodOptions,
  TRACE: nsolid_consts.kHttpMethodTrace,
  PATCH: nsolid_consts.kHttpMethodPatch,
};
const kHttpMethodOther = nsolid_consts.kHttpMethodOther;

// HttpProtocolVersion values from nsolid_metrics.h.
const kHttpVersionMap = {
  '__proto__': null,
  '1.0': nsolid_consts.kHttpVersion10,
  '1.1': nsolid_consts.kHttpVersion11,
  '2': nsolid_consts.kHttpVersion2,
};
const kHttpVersion10 = nsolid_consts.kHttpVersion10;
const kHttpVersion11 = nsolid_consts.kHttpVersion11;
const kHttpVersion2 = nsolid_consts.kHttpVersion2;
const kHttpVersionOther = nsolid_consts.kHttpVersionOther;

// HttpUrlScheme values from nsolid_metrics.h.
const kHttpSchemeHttp = nsolid_consts.kHttpSchemeHttp;
const kHttpSchemeHttps = nsolid_consts.kHttpSchemeHttps;

module.exports = {
  kHttpMethodMap,
  kHttpMethodOther,
  kHttpVersionMap,
  kHttpVersion10,
  kHttpVersion11,
  kHttpVersion2,
  kHttpVersionOther,
  kHttpSchemeHttp,
  kHttpSchemeHttps,
};
