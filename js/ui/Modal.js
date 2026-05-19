// js/ui/Modal.js — 交易确认模态框
// 依赖：systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：init, openTradeModal

import * as Economy     from '../systems/economy/Economy.js';
import { getTotalCargo } from '../systems/trade/TradeSystem.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js?v=20260505-surface4';

let _onConfirm = null; // 注入的确认回调，由 GameManager 提供
let _initialized = false;

/**
 * 初始化模态框按钮事件（只需调用一次）
 * @param {Function} onConfirmCb  (action:'buy'|'sell', goodId:string, qty:number) => void
 */
export function init(onConfirmCb) {
  _onConfirm = onConfirmCb;
  if (_initialized) return;
  _initialized = true;

  bindBlockingSurfaceDismiss('trade-modal');

  document.getElementById('modal-decrease').addEventListener('click', function () {
    const inp = document.getElementById('modal-amount');
    inp.value = Math.max(1, parseInt(inp.value) - 1);
    _refreshTotal();
  });

  document.getElementById('modal-increase').addEventListener('click', function () {
    const inp = document.getElementById('modal-amount');
    inp.value = Math.min(parseInt(inp.max), parseInt(inp.value) + 1);
    _refreshTotal();
  });

  document.getElementById('modal-all').addEventListener('click', function () {
    const inp = document.getElementById('modal-amount');
    inp.value = parseInt(inp.max) || 0;
    _refreshTotal();
  });

  document.getElementById('modal-amount').addEventListener('input', _refreshTotal);

  document.getElementById('modal-cancel').addEventListener('click', function () {
    hideBlockingSurface('trade-modal');
  });
}

/**
 * 打开交易模态框
 * @param {'buy'|'sell'} action
 * @param {object}       good       商品定义对象
 * @param {object}       state      当前游戏状态（只读用于计算上限）
 * @param {string}       [marketType] 'open' | 'black'（默认 'open'）
 * @param {object}       [options]
 * @param {number}       [options.initialQuantity] 打开时预填数量
 */
export function openTradeModal(action, good, state, marketType, options) {
  const opts = options || {};
  const isBlack = marketType === 'black';
  const price  = isBlack
    ? (action === 'buy'
      ? Economy.getBlackMarketBuyPrice(state.currentSystem, good.id, state)
      : Economy.getBlackMarketSellPrice(state.currentSystem, good.id, state))
    : (action === 'buy'
      ? Economy.getBuyPrice(state.currentSystem, good.id, state)
      : Economy.getSellPrice(state.currentSystem, good.id, state));

  const maxQty = action === 'buy'
    ? Math.min(
        Math.floor(state.credits / price),
        state.maxCargo - getTotalCargo(state)
      )
    : (state.cargo[good.id] || 0);

  const safeMax = Math.max(0, maxQty);

  document.getElementById('modal-title').textContent =
    (isBlack ? '🕶 ' : '') + (action === 'buy' ? '💰 购买 ' : '💸 出售 ') + good.emoji + ' ' + good.name;
  document.getElementById('modal-desc').textContent =
    (isBlack ? '[黑市] ' : '') + '单价: ' + price + ' 积分  ·  最多可' +
    (action === 'buy' ? '购买' : '出售') + ': ' + safeMax + ' 单位';

  const inp     = document.getElementById('modal-amount');
  inp.max       = safeMax;
  const initialQuantity = Number.isFinite(opts.initialQuantity)
    ? Math.floor(opts.initialQuantity)
    : 1;
  inp.value     = safeMax > 0 ? Math.max(1, Math.min(initialQuantity || 1, safeMax)) : 0;
  inp.dataset.price = price;
  inp.dataset.marketType = marketType || 'open';
  _refreshTotal();

  document.getElementById('modal-confirm').onclick = function () {
    const qty = parseInt(inp.value) || 0;
    hideBlockingSurface('trade-modal');
    if (qty > 0 && _onConfirm) _onConfirm(action, good.id, qty, inp.dataset.marketType);
  };

  showBlockingSurface('trade-modal');
}

function _refreshTotal() {
  const inp   = document.getElementById('modal-amount');
  const qty   = parseInt(inp.value) || 0;
  const price = parseInt(inp.dataset.price) || 0;
  document.getElementById('modal-total').textContent = '总计: ' + (qty * price) + ' 积分';
}
