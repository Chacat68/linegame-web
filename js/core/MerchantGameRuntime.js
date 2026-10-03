import * as Merchant from '../systems/merchant/MerchantSystem.js';
import * as MerchantUI from '../ui/MerchantUI.js';

export function prepareMerchantSessionState(state) {
  Merchant.init(state);
}

export function settleMerchantSessionState(state, now) { return Merchant.advance(state, now); }

// 真实时间经营不因切后台或打开设置而暂停；会话切换释放所有监听器。
export function createMerchantGameRuntime({ getState, save, render = MerchantUI.render, renderScene = MerchantUI.renderScene, now = Date.now, documentSource = globalThis.document, windowSource = globalThis.window }) {
  let active = false;
  let lastRender = 0;
  let lastSave = 0;
  let lastSaveFailed = false;

  function persist(state) {
    const result = save(state);
    lastSaveFailed = result?.ok === false;
    return result;
  }
  function tick(force = false) {
    const state = getState();
    const timestamp = now();
    if (!active || !state?.merchant || (!force && timestamp - lastRender < 500 && timestamp >= lastRender)) return;
    const away = documentSource?.hidden;
    Merchant.advance(state, timestamp);
    lastRender = timestamp;
    if (!away) render(state);
    if (force || timestamp - lastSave >= 15000) {
      persist(state);
      lastSave = timestamp;
    }
  }
  function flush() { tick(true); }
  function start() {
    if (active) return;
    active = true;
    lastRender = 0;
    lastSave = 0;
    documentSource?.addEventListener?.('visibilitychange', flush);
    windowSource?.addEventListener?.('pagehide', flush);
    tick(true);
  }
  function stop() {
    // 不在 stop 时写盘：清空存档/重开也经过这里，不能重新写回旧会话。
    active = false;
    documentSource?.removeEventListener?.('visibilitychange', flush);
    windowSource?.removeEventListener?.('pagehide', flush);
  }
  function execute(action, target) {
    const state = getState();
    if (!active || !state) return { ok: false, msg: '经营系统尚未就绪。' };
    const result = Merchant.command(state, action, target, now());
    if (result.ok) {
      persist(state);
      render(state);
      if (lastSaveFailed) return { ...result, msg: result.msg + ' 本地存档失败，请通过设置导出进度。' };
    }
    return result;
  }
  return Object.freeze({ start, stop, tick, execute, renderScene });
}
