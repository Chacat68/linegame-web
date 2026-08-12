// js/core/StateSession.js — 当前游戏状态与会话代数的唯一持有者
//
// 应用可以替换整个 state，但长期存活的回调不得把旧引用当成当前会话。
// token 将 state 引用与单调 revision 绑定，供延迟任务提交前校验。

export function createStateSession(initialState, options) {
  var config = options || {};
  var onSubscriberError = typeof config.onSubscriberError === 'function'
    ? config.onSubscriberError
    : function (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('StateSession subscriber failed:', error);
      }
    };
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
      try {
        subscriber(change);
      } catch (error) {
        // state/revision 已原子提交。单个投影订阅者失败不能阻断其余订阅者，
        // 更不能让调用方的 legacy bridge 停留在旧 state。
        try {
          onSubscriberError(error, change, subscriber);
        } catch (reportingError) {
          // 错误上报本身也不得破坏会话提交。
        }
      }
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
