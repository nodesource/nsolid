'use strict'

const COMMAND_TIMEOUT_SECONDS = 60 * 2

const worker = require('../../lib/worker')

exports.worker = worker.create({
  run,
  fileName: __filename,
  description: 'get module file require() paths, normalized to input dir',
  time: COMMAND_TIMEOUT_SECONDS * 1000,
  input: {
    dir: 'unpacked tarball directory'
  },
  output: {
    dir: 'unpacked tarball directory',
    files: 'files in the module\'s load path for AST parsing'
  }
})

const path = require('path')
const util = require('util')
const fs = require('fs')

const fsPromises = {
  readFile: util.promisify(fs.readFile)
}

const detective = require('detective')
const resolveModule = require('resolve')
const pathType = require('path-type')
const glob = require('fast-glob')

const nsUtil = require('../../util')
const logger = nsUtil.logger.getLogger(__filename)

async function run (context, input) {
  const { packageJson } = input
  const baseDir = path.join(input.dir, '/')

  logger.debug('Starting module resolution')

  // A set of relative paths which are Node.js module entry points or javascript bin files.
  let entryPoints = new Set()

  // Matches how Node.js resolves the entry point of a library.
  let hadMainFile = Boolean(packageJson.main)
  // Prefer the package.json "main" field.
  if (packageJson.main) {
    let resolved
    try {
      // Do full module resolution on the identifier specified in "main"
      // In particular, also treat it as if module resolution was the package's base directory.
      resolved = await resolveModuleAsync(input.dir, packageJson.main, true /* base dir resolution */)
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        logger.debug(`Failed to resolve main: ${input.dir}, ${packageJson.main}`)
        // If "main" failed to resolve, Node.js falls back to looking for the default.
        hadMainFile = false
      } else {
        throw err
      }
    }
    if (hadMainFile) {
      // Entry points are relative paths, so normalize it to the base module directory.
      const normalized = path.normalize(resolved.replace(baseDir, ''))
      entryPoints.add(normalized)
    }
  }
  // If no file was found or specified, fall back to the default.
  if (!hadMainFile) {
    // The default entry point is always "index.js".
    const indexPath = path.join(input.dir, 'index.js')
    const hasIndexJs = await pathType.file(indexPath)
    if (hasIndexJs) {
      entryPoints.add('index.js')
    }
  }

  // Check for /bin/ files and add them to our module load parsing, since they
  // are a common alternate entry point.
  if (packageJson.bin) {
    for (const binFile of Object.values(packageJson.bin)) {
      // Only add files that have the usual Node.js hashbang.
      const shouldAdd = await fileHasNodeHashbang(input.dir, binFile)
      if (shouldAdd) {
        entryPoints.add(path.normalize(binFile))
      }
    }
  }

  if (entryPoints.size === 0) {
    logger.debug(`No module entry points found`)
  }

  const inspectedEPs = util.inspect(entryPoints, { breakLength: Infinity })
  logger.debug(`resolution on entryPoints: ${inspectedEPs}`)

  const logTag = `${input.name} ${input.version}`

  // Collect the filepaths we want to run AST checks on.
  let filePaths = new Set(entryPoints)

  // Do load path gathering iteratively, not in parallel.
  // Avoids race conditions & unnecessary duplicate processing,
  // which could occur from multiple entry points.
  for (const fileName of entryPoints) {
    await getLocalRequiresFromFileRecursive({
      baseDir, dirName: '', fileName, filePaths, logTag
    })
  }

  if (filePaths.size === 0) {
    // Resolution failed or no entry points detected.
    // Try to glob JS that isn't tests or benchmarks.
    const globOpts = { cwd: input.dir, case: false }

    filePaths = await glob(
      [
        '**/*.js',
        '!**/test',
        '!**/tests',
        '!**/benchmark',
        '!**/benchmarks'
      ],
      globOpts
    )

    if (filePaths.length === 0) {
      // Still nothing, fall back to checking everything like eslint's `'.'`.
      filePaths = await glob('**/*.js', globOpts)
    }

    filePaths = new Set(filePaths) // to prevent surprises
  }

  // Might legitimately not find anything if there wasn't a specified entry point
  // (e.g. @types/... modules), so don't log an error.
  if (filePaths.size === 0 && entryPoints.size > 0) {
    logger.error(`${input.name} ${input.version} No files found during resolution`)
  }

  const inspectedFPaths = util.inspect(filePaths, { breakLength: Infinity })
  logger.debug(`filepaths: ${inspectedFPaths}`)

  return Object.assign({}, input, { files: Array.from(filePaths) })
}

async function getLocalRequiresFromFileRecursive (
  {
    baseDir, dirName, fileName, filePaths /* A Set */, logTag
  }) {
  const filePath = path.join(baseDir, dirName, fileName)
  const dirPath = path.join(baseDir, dirName)

  logger.debug(`recursively parsing ${filePath}`)

  let src
  try {
    src = await fsPromises.readFile(filePath, { encoding: 'utf8' })
  } catch (err) {
    // Presumably this means that no such file exists?
    return
  }

  const requires = detective(src) // AST parses require()'s from a source text.
  const filesToAdd = requires.filter(requiredStr => {
    // Exclude absolute paths since whatever the module is looking for
    // probably doesn't exist on the host system.

    // Also excludes bare module specifiers. We only want local files.
    return requiredStr.startsWith('./') || requiredStr.startsWith('../')
  })

  let resolutionFailures = 0
  for (const pathStr of filesToAdd) {
    let resolvedPath
    try {
      resolvedPath = await resolveModuleAsync(dirPath, pathStr)
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        // If we can't find or access a file, count & skip it.
        // It could just be a debug conditional (like express@4.0.0).
        resolutionFailures++

        logger.debug(`Failed to resolve '${pathStr}' from '${fileName}' within ${path.basename(baseDir)}/${dirName}`)

        logger.debug(`Failed resolution full filepath: ${filePath}`)
        continue
      } else {
        throw err
      }
    }

    const localizedPath = path.normalize(resolvedPath.replace(baseDir, ''))
    if (filePaths.has(localizedPath)) {
      // If we already have the file indexed, then skip.
      // Either it's just the result of circular deps,
      // or a repeated path from another entry point.
      continue
    }

    const parsedPath = path.parse(localizedPath)

    // These resolve in Node, but are meaningless or uninteresting to a javascript AST parser.
    if (parsedPath.ext === '.json' || parsedPath.ext === '.node') {
      logger.debug(`skipping file ${parsedPath.base} because extension was ${parsedPath.ext}`)
      continue
    }

    filePaths.add(localizedPath)

    await getLocalRequiresFromFileRecursive({
      baseDir, dirName: parsedPath.dir, fileName: parsedPath.base, filePaths, logTag
    })
  }

  if (resolutionFailures > 0 && resolutionFailures !== filesToAdd.length) {
    // If everything fails, bets are it is bundled code, e.g. from webpack or browserify.
    // But, if it didn't, there are better chances something may be wrong?
    logger.warn(`${logTag} ${resolutionFailures} resolution failures from '${fileName}'`)
  }
}

async function fileHasNodeHashbang (dirName, fileName) {
  const filePath = path.join(dirName, fileName)
  let file
  try {
    // XXX (Jeremiah): probably more efficent to match a buffer and not parse whole file.
    // XXX It's also more of a headache, but maybe we shouldn't even read the whole file.
    file = await fsPromises.readFile(filePath, { encoding: 'utf8' })
  } catch (err) {
    // Don't bother running AST parsing on it if we can't open it or something.
    return false
  }

  return file.startsWith('#!/usr/bin/env node')
}

function resolveModuleAsync (dirPath, fileName, dirPaths) {
  return new Promise((resolve, reject) => {
    const opts = { basedir: dirPath }
    if (dirPaths) {
      opts.paths = [ dirPath ]
    }
    resolveModule(fileName, opts, (err, path) => {
      if (err) return reject(err)
      resolve(path)
    })
  })
}
