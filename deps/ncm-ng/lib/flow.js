'use strict'

exports.create = create
exports.getFlowNamed = getFlowNamed
exports.getAllFlows = getAllFlows
exports.buildSteps = buildSteps // for testing

const joi = require('joi')
const nsUtil = require('../util')

const validateSchema = require('./validate-schema')
const propertyMatcher = require('./property-matcher')

const logger = nsUtil.logger.getLogger(__filename)

// create a new Flow instance
function create (spec) {
  // validations throw errors; fine as these should fail fast; eg. catastrophic
  validateSchema(`flow spec ${spec.name}`, spec, specSchema)
  const steps = buildSteps(spec)
  validateInputOutput(spec.name, steps)

  const flow = new Flow(spec, steps)
  addFlowNamed(flow.name, flow)
  return flow
}

// models a flow as a d3 tree and map of worker.name => d3 node
class Flow {
  constructor (spec, steps) {
    this.name = spec.name
    this.description = spec.description
    this.config = spec.config
    this.inProcess = spec.inProcess
    this.steps = steps
    this.stepsMap = buildStepsMap(this.name, steps)
  }

  getStep (name) {
    return this.stepsMap.get(name)
  }

  async run (context, input) {
    logger.info('TBD!')
  }
}

// models the steps of a flow, as a tree
class Step {
  constructor (action) {
    this._action = action
    this._children = []
  }

  get action () { return this._action }
  get children () { return this._children }

  addChild (child) {
    this._children.push(child)
  }
}

// build the tree of steps
function buildSteps (spec) {
  if (!Array.isArray(spec.steps)) throw new Error('expecting steps to be an array')

  const root = new Step()
  buildStepsTree(root, spec.steps)
  return root
}

function buildStepsTree (parent, steps) {
  if (!Array.isArray(steps)) throw new Error('invalid structure')

  for (let stepAction of steps) {
    if (isParallel(stepAction)) {
      const pStepsList = stepAction.parallel
      for (let pSteps of pStepsList) {
        buildStepsTree(parent, pSteps)
      }
    } else {
      const step = new Step(stepAction)
      parent.addChild(step)
      parent = step
    }
  }
}

// build a map of worker-name -> step
function buildStepsMap (flowName, steps, map) {
  if (map == null) map = new Map()

  for (let child of steps.children) {
    const stepName = child.action.name

    if (map.has(stepName)) {
      throw new Error(`duplicate worker in flow ${flowName}: ${stepName}; use worker.cloneWithSuffix('foo') to make unique`)
    }

    map.set(stepName, child)
    buildStepsMap(flowName, child, map)
  }

  return map
}

function isParallel (object) {
  if (object == null) return false
  if (!Array.isArray(object.parallel)) return false
  return true
}

// validate input/output matches for workers in steps
function validateInputOutput (flowName, steps) {
  for (let child of steps.children) {
    validateWorkerParentInputOutput(flowName, child)
  }
}

function validateWorkerParentInputOutput (flowName, parent) {
  for (let child of parent.children) {
    validateWorkerInputOutput(flowName, parent.action, child.action)
  }
}

// validate data beween workers is consistent
function validateWorkerInputOutput (flowName, workerFrom, workerTo) {
  const fromName = workerFrom.name
  const toName = workerTo.name

  const errPrefix = `flow ${flowName}, from ${fromName} to ${toName}`
  if (workerFrom.outputSchema == null) {
    throw new Error(`${errPrefix} not valid as worker ${fromName} has no output`)
  }

  const missing = propertyMatcher.match(workerTo.inputSchema, workerFrom.outputSchema)
  if (missing.length > 0) {
    throw new Error(`${errPrefix} is missing properties ${missing.join(', ')}`)
  }
}

// maintain a map of all flows, name => flow
const AllFlows = new Map()

function addFlowNamed (name, flow) {
  AllFlows.set(name, flow)
}

function getFlowNamed (name) {
  return AllFlows.get(name)
}

function getAllFlows () {
  return Array.from(AllFlows.values())
}

// joi schema for the flow spec
const specSchema = joi.object().keys({
  name: joi.string().required(),
  description: joi.string().required(),
  config: joi.object().optional(),
  inProcess: joi.boolean(),
  steps: joi.any().required(),
  nextFlows: joi.array().items().optional(),
  nextFlowsInProcess: joi.array().items().optional()
})

exports.type = Flow
