'use strict';

const {
  ArrayIsArray,
  JSONStringify,
  ObjectKeys,
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
} = primordials;
const { storeModuleInfo } = internalBinding('nsolid_api');
const { relative: relativePath, sep } = require('path');
const debug = require('internal/util/debuglog').debuglog('nsolid');

// The arrays in packagePaths and packageList are the same. They are just
// referenced in different ways to make looking for them easier.
const packagePaths = {};
const packageList = [];

module.exports = {
  addPackage,
  addPackageChildPath,
  updatePackage,
  packageList,
  packagePaths,
};

function genPackageInfo(path, json, required = false) {
  // Construct first main package.json info object.
  const info_obj = {
    path,
    name: json.name || 'undefined',
    version: json.version,
    main: json.main,
    dependencies: [],
    required,
  };
  // Only add the nsolid field if it exists
  if (json.nsolid && ObjectKeys(json.nsolid).length > 0)
    info_obj.nsolid = json.nsolid;
  // Then add additional dependency fields.
  if (json.dependencies)
    info_obj.dependencies.push(...ObjectKeys(json.dependencies));
  if (json.optionalDependencies)
    info_obj.dependencies.push(...ObjectKeys(json.optionalDependencies));
  if (json.bundledDependencies)
    info_obj.dependencies.push(...ObjectKeys(json.bundledDependencies));
  // Now filter out any possible duplicates.
  info_obj.dependencies =
    info_obj.dependencies.filter((e, i, a) => a.indexOf(e) === i);
  return info_obj;
}


function addPackage(path, json, required = false) {
  path = fixPath(path, false);
  let info = packagePaths[path];

  if (!json.name) {
    debug('module at %s does not have a name', path);
  }
  if (info && required === false) {
    return info;
  }

  if (!info) {
    info = genPackageInfo(path, json, required);
    packagePaths[path] = info;
    packageList.push(info);
    storeModuleInfo(info.path, JSONStringify(info));
  } else if (!info.required && required) {
    // Set whether the module has been called via require().
    info.required = required;
    storeModuleInfo(info.path, JSONStringify(info));
  }
  return info;
}


function addPackageChildPath(parentPath, childPath) {
  parentPath = fixPath(parentPath, true);
  childPath = relativePath(parentPath, fixPath(childPath, true));
  const pkg = packagePaths[parentPath];
  if (!pkg) {
    return debug('parent %s has not been added to packagePaths', parentPath);
  }
  if (!ArrayIsArray(pkg.children)) {
    pkg.children = [];
  }
  if (!pkg.children.includes(childPath)) {
    pkg.children.push(childPath);
    storeModuleInfo(pkg.path, JSONStringify(pkg));
  }
}


function updatePackage(info) {
  storeModuleInfo(info.path, JSONStringify(info));
}


function fixPath(path, isPackageJSON) {
  if (typeof path !== 'string' || path.length <= 1)
    return '';
  if (isPackageJSON)
    return StringPrototypeSlice(path, 0, StringPrototypeLastIndexOf(path, sep));

  const lastPathChar = path.charAt(path.length - 1);
  return (lastPathChar === '\\' || lastPathChar === '/') ?
    path.slice(0, -1) : path;
}
