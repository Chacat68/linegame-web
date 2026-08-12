// js/core/StateSession.js — 当前游戏状态与会话代数的唯一持有者
//
// 应用可以替换整个 state，但长期存活的回调不得把旧引用当成当前会话。
// token 将 state 引用与单调 revision 绑定，供延迟任务提交前校验。

export function createStateSession(initialState) {
  var state = initialState || null;
  var revision = 0;
  var subscribers = new Set();

  function getState() {
    return state;
  }

  function getRevision() {
    return revision;
  }

  function getToken() {
    return Object.freeze({ state: state, revision: revision });
  }

  function isCurrent(token) {
    return !!token && token.state === state && token.revision === revision;
  }

  function replace(nextState, metadata) {
    var previousState = state;
    var previousRevision = revision;
    state = nextState || null;
    revision += 1;
    var change = Object.freeze({
      type: 'session:replaced',
      reason: metadata && metadata.reason ? metadata.reason : 'replace',
      previousState: previousState,
      previousRevision: previousRevision,
      state: state,
      revision: revision,
    });
    subscribers.forEach(function (subscriber) {
      subscriber(change);
    });
    return change;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== 'function') return function () {};
    subscribers.add(subscriber);
    return function () {
      subscribers.delete(subscriber);
    };
  }

  return Object.freeze({
    getState: getState,
    getRevision: getRevision,
    getToken: getToken,
    isCurrent: isCurrent,
    replace: replace,
    subscribe: subscribe,
  });
}
