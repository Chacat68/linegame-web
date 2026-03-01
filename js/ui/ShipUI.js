// js/ui/ShipUI.js — 船队概览状态栏渲染
// 依赖：data/goods.js, systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：renderShipStats

import { GOODS }         from '../data/goods.js';
import * as Economy      from '../systems/economy/Economy.js';
import { getTotalCargo } from '../systems/trade/TradeSystem.js';

/**
 * 渲染船队概览状态栏（船只数量、派遣数、总利润、贸易次数）
 */
export function renderShipStats(state) {
  const fleet = state.fleet || [];
  const dispatchCount = fleet.filter(function (s) { return !!s.route; }).length;
  const totalProfit = state.totalProfit || 0;
  const tradeCount = state.tradeCount || 0;

  var el;
  el = document.getElementById('ov-ship-count');
  if (el) el.textContent = fleet.length;

  el = document.getElementById('ov-dispatch-count');
  if (el) el.textContent = dispatchCount;

  el = document.getElementById('ov-total-profit');
  if (el) el.textContent = Math.floor(totalProfit).toLocaleString();

  el = document.getElementById('ov-trade-count');
  if (el) el.textContent = tradeCount;
}
