// js/core/GameRuntimeGraph.js — 应用运行时节点所有权与惰性构造

function _assertNodeId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('Runtime Graph node id must be a non-empty string.');
  }
  return id.trim();
}

function _isPromiseLike(value) {
  return !!value && typeof value.then === 'function';
}

export function createGameRuntimeGraph(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    throw new TypeError('GameRuntimeGraph requires at least one node id.');
  }

  var records = Object.create(null);
  var orderedIds = [];
  nodeIds.forEach(function (candidate) {
    var id = _assertNodeId(candidate);
    if (records[id]) throw new Error('Duplicate Runtime Graph node: ' + id);
    records[id] = {
      state: 'idle',
      instance: null,
      error: null,
      attemptCount: 0,
      createCount: 0,
    };
    orderedIds.push(id);
  });

  var constructionStack = [];
  var generation = 1;

  function _record(id) {
    var normalized = _assertNodeId(id);
    if (!records[normalized]) throw new Error('Unknown Runtime Graph node: ' + normalized);
    return records[normalized];
  }

  function resolve(id, create) {
    var record = _record(id);
    if (record.state === 'ready') return record.instance;
    if (record.state === 'creating') {
      var cycle = constructionStack.concat([id]).join(' -> ');
      throw new Error('Circular Runtime Graph dependency: ' + cycle);
    }
    if (typeof create !== 'function') {
      throw new TypeError('Runtime Graph node ' + id + ' requires a synchronous factory.');
    }

    record.state = 'creating';
    record.error = null;
    record.attemptCount += 1;
    constructionStack.push(id);
    try {
      var instance = create(api);
      if (typeof instance === 'undefined' || _isPromiseLike(instance)) {
        throw new TypeError('Runtime Graph node ' + id + ' factory must return a synchronous instance.');
      }
      record.instance = instance;
      record.state = 'ready';
      record.createCount += 1;
      return instance;
    } catch (error) {
      record.instance = null;
      record.state = 'error';
      record.error = error;
      throw error;
    } finally {
      constructionStack.pop();
    }
  }

  function peek(id) {
    var record = _record(id);
    return record.state === 'ready' ? record.instance : null;
  }

  function clear() {
    var cleared = [];
    orderedIds.forEach(function (id) {
      var record = records[id];
      if (record.state === 'ready') cleared.push(id);
      record.state = 'idle';
      record.instance = null;
      record.error = null;
    });
    constructionStack = [];
    generation += 1;
    return cleared;
  }

  function getDiagnostics() {
    var nodes = {};
    orderedIds.forEach(function (id) {
      var record = records[id];
      nodes[id] = Object.freeze({
        state: record.state,
        attemptCount: record.attemptCount,
        createCount: record.createCount,
        error: record.error,
      });
    });
    return Object.freeze({
      generation: generation,
      constructing: Object.freeze(constructionStack.slice()),
      nodes: Object.freeze(nodes),
    });
  }

  var api = Object.freeze({
    resolve: resolve,
    peek: peek,
    clear: clear,
    getDiagnostics: getDiagnostics,
  });
  return api;
}
