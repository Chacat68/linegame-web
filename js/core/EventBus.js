// js/core/EventBus.js — 全局事件总线（Pub/Sub）
// 依赖：无
// 导出：on, off, emit
//
// 约定事件名格式：domain:action，例如：
//   'log:message'          { text, type }
//   'trade:buy'            { systemId, goodId, quantity, totalCost }
//   'trade:sell'           { systemId, goodId, quantity, totalEarned, profit }
//   'travel:arrived'       { fromId, toId, fuelCost, day }
//   'ship:upgraded'        { upgradeId }
//   'state:changed'        {}   (通知 UI 全量刷新)

const _listeners = Object.create(null);

/**
 * 订阅事件
 * @param {string}   event
 * @param {Function} fn
 */
export function on(event, fn) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
}

/**
 * 取消订阅
 * @param {string}   event
 * @param {Function} fn
 */
export function off(event, fn) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
}

/**
 * 发布事件
 * @param {string} event
 * @param {*}      data
 */
export function emit(event, data) {
  if (!_listeners[event]) return;
  _listeners[event].forEach(function (fn) {
    try { fn(data); } catch (e) { console.error('[EventBus] handler error for "' + event + '":', e); }
  });
}
