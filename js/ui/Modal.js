// js/ui/Modal.js — 交易确认模态框
// 依赖：systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：init, openTradeModal

import * as Economy     from '../systems/economy/Economy.js';
import { getTotalCargo } from '../systems/trade/TradeSystem.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';

let _onConfirm = null; // 注入的确认回调，由 GameManager 提供
let _initialized = false;
let _activeTradePreview = null;

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
    _stepTradeAmount(-1);
  });

  document.getElementById('modal-increase').addEventListener('click', function () {
    _stepTradeAmount(1);
  });

  document.getElementById('modal-all').addEventListener('click', function () {
    const inp = document.getElementById('modal-amount');
    inp.value = parseInt(inp.max) || 0;
    _refreshTotal();
  });

  document.getElementById('modal-amount').addEventListener('input', _refreshTotal);
  document.getElementById('modal-amount').addEventListener('keydown', function (event) {
    if (!event || event.key !== 'Enter') return;
    const confirmBtn = document.getElementById('modal-confirm');
    if (!confirmBtn || confirmBtn.disabled || typeof confirmBtn.onclick !== 'function') return;
    event.preventDefault();
    confirmBtn.onclick();
  });

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
  const modal = document.getElementById('trade-modal');
  if (modal && modal.dataset) {
    modal.dataset.tradeAction = action;
    modal.dataset.marketType = marketType || 'open';
  }

  document.getElementById('modal-title').textContent =
    (isBlack ? '🕶 ' : '') + (action === 'buy' ? '💰 购买 ' : '💸 出售 ') + good.emoji + ' ' + good.name;
  document.getElementById('modal-desc').textContent =
    (isBlack ? '黑市成交会按当前节点价格即时结算。' : '成交会按当前节点公开价格即时结算。') +
    ' 请核对数量、货舱和资金变化。';
  _setText('modal-kicker', isBlack ? '黑市交易' : '公开市场');
  _setText('modal-unit-price', price.toLocaleString() + ' 积分');
  _setText('modal-max-qty', safeMax.toLocaleString() + ' 单位');
  _setText('modal-market-type', isBlack ? '黑市' : '公开');

  const inp     = document.getElementById('modal-amount');
  inp.max       = safeMax;
  const initialQuantity = Number.isFinite(opts.initialQuantity)
    ? Math.floor(opts.initialQuantity)
    : 1;
  inp.value     = safeMax > 0 ? Math.max(1, Math.min(initialQuantity || 1, safeMax)) : 0;
  inp.dataset.price = price;
  inp.dataset.marketType = marketType || 'open';
  inp.setAttribute('aria-label', (action === 'buy' ? '购买' : '出售') + good.name + '的数量');
  inp.setAttribute('aria-valuemax', String(safeMax));
  _activeTradePreview = {
    action: action,
    price: price,
    cargoBefore: getTotalCargo(state),
    maxCargo: state.maxCargo || 0,
    credits: state.credits || 0,
  };
  _setText('modal-cargo-before', _formatCargo(_activeTradePreview.cargoBefore, _activeTradePreview.maxCargo));
  const confirmBtn = document.getElementById('modal-confirm');
  const allBtn = document.getElementById('modal-all');
  const actionLabel = action === 'buy' ? '确认购买' : '确认出售';
  if (confirmBtn) {
    confirmBtn.textContent = actionLabel;
    confirmBtn.setAttribute('aria-label', actionLabel + good.name);
  }
  if (allBtn) {
    allBtn.textContent = action === 'buy' ? '全部买入' : '全部卖出';
    allBtn.disabled = safeMax <= 0;
    allBtn.setAttribute('aria-disabled', safeMax > 0 ? 'false' : 'true');
  }
  _refreshTotal();

  confirmBtn.onclick = function () {
    const qty = parseInt(inp.value) || 0;
    hideBlockingSurface('trade-modal');
    if (qty > 0 && _onConfirm) _onConfirm(action, good.id, qty, inp.dataset.marketType);
  };

  showBlockingSurface('trade-modal', { focusSelector: '#modal-amount' });
}

function _refreshTotal() {
  const inp   = document.getElementById('modal-amount');
  const qty   = parseInt(inp.value) || 0;
  const price = parseInt(inp.dataset.price) || 0;
  const maxQty = parseInt(inp.max) || 0;
  const totalEl = document.getElementById('modal-total');
  const confirmBtn = document.getElementById('modal-confirm');
  const isValid = qty > 0 && qty <= maxQty;
  var statusText = '';

  if (isValid) statusText = '总计: ' + (qty * price).toLocaleString() + ' 积分';
  else if (maxQty <= 0) statusText = '当前没有可成交数量';
  else if (qty <= 0) statusText = '交易数量至少为 1';
  else statusText = '交易数量超过当前上限 ' + maxQty.toLocaleString();

  if (totalEl) {
    totalEl.textContent = statusText;
    if (totalEl.dataset) totalEl.dataset.tradeState = isValid ? 'ready' : 'blocked';
  }

  if (typeof inp.setAttribute === 'function') {
    inp.setAttribute('aria-invalid', isValid ? 'false' : 'true');
    inp.setAttribute('aria-valuetext', isValid ? (qty + ' 单位，可成交') : statusText);
  }

  if (confirmBtn) {
    confirmBtn.disabled = !isValid;
    if (typeof confirmBtn.setAttribute === 'function') {
      confirmBtn.setAttribute('aria-disabled', isValid ? 'false' : 'true');
    }
  }

  _refreshTradeImpact(qty, price, isValid);
}

function _stepTradeAmount(delta) {
  const inp = document.getElementById('modal-amount');
  if (!inp) return;

  const maxQty = Math.max(0, parseInt(inp.max) || 0);
  const parsedValue = parseInt(inp.value);
  const currentValue = Number.isFinite(parsedValue)
    ? parsedValue
    : (delta > 0 ? 0 : 1);
  const nextValue = maxQty > 0
    ? Math.max(1, Math.min(maxQty, currentValue + delta))
    : 0;

  inp.value = nextValue;
  _refreshTotal();
}

function _refreshTradeImpact(qty, price, isValid) {
  if (!_activeTradePreview) return;

  const summaryEl = document.getElementById('trade-impact-summary');
  const cargoBefore = _activeTradePreview.cargoBefore;
  const maxCargo = _activeTradePreview.maxCargo;
  const cargoAfter = isValid
    ? (_activeTradePreview.action === 'buy'
      ? Math.min(maxCargo, cargoBefore + qty)
      : Math.max(0, cargoBefore - qty))
    : cargoBefore;
  const creditDelta = isValid
    ? ((_activeTradePreview.action === 'buy' ? '-' : '+') + (qty * price).toLocaleString() + ' 积分')
    : '不可成交';

  _setText('modal-cargo-before', _formatCargo(cargoBefore, maxCargo));
  _setText('modal-cargo-after', isValid ? _formatCargo(cargoAfter, maxCargo) : '不可成交');
  _setText('modal-credit-delta', creditDelta);

  if (summaryEl && summaryEl.dataset) {
    summaryEl.dataset.tradeValid = isValid ? 'true' : 'false';
  }
}

function _setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function _formatCargo(value, maxCargo) {
  return Math.max(0, value || 0).toLocaleString() + ' / ' + Math.max(0, maxCargo || 0).toLocaleString();
}
