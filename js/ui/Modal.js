// js/ui/Modal.js — 交易确认模态框
// 依赖：systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：init, openTradeModal

import * as Economy     from '../systems/economy/Economy.js';
import { getTotalCargo } from '../systems/trade/TradeSystem.js';

let _onConfirm = null; // 注入的确认回调，由 GameManager 提供

/**
 * 初始化模态框按钮事件（只需调用一次）
 * @param {Function} onConfirmCb  (action:'buy'|'sell', goodId:string, qty:number) => void
 */
export function init(onConfirmCb) {
  _onConfirm = onConfirmCb;

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
    document.getElementById('trade-modal').classList.add('hidden');
  });
}

/**
 * 打开交易模态框
 * @param {'buy'|'sell'} action
 * @param {object}       good   商品定义对象
 * @param {object}       state  当前游戏状态（只读用于计算上限）
 */
export function openTradeModal(action, good, state) {
  const price  = action === 'buy'
    ? Economy.getBuyPrice(state.currentSystem, good.id, state)
    : Economy.getSellPrice(state.currentSystem, good.id, state);

  const maxQty = action === 'buy'
    ? Math.min(
        Math.floor(state.credits / price),
        state.maxCargo - getTotalCargo(state)
      )
    : (state.cargo[good.id] || 0);

  const safeMax = Math.max(0, maxQty);

  document.getElementById('modal-title').textContent =
    (action === 'buy' ? '💰 购买 ' : '💸 出售 ') + good.emoji + ' ' + good.name;
  document.getElementById('modal-desc').textContent =
    '单价: ' + price + ' 积分  ·  最多可' +
    (action === 'buy' ? '购买' : '出售') + ': ' + safeMax + ' 单位';

  const inp     = document.getElementById('modal-amount');
  inp.max       = safeMax;
  inp.value     = Math.max(0, Math.min(1, safeMax));
  inp.dataset.price = price;
  _refreshTotal();

  document.getElementById('modal-confirm').onclick = function () {
    const qty = parseInt(inp.value) || 0;
    if (qty > 0 && _onConfirm) _onConfirm(action, good.id, qty);
    document.getElementById('trade-modal').classList.add('hidden');
  };

  document.getElementById('trade-modal').classList.remove('hidden');
}

function _refreshTotal() {
  const inp   = document.getElementById('modal-amount');
  const qty   = parseInt(inp.value) || 0;
  const price = parseInt(inp.dataset.price) || 0;
  document.getElementById('modal-total').textContent = '总计: ' + (qty * price) + ' 积分';
}
