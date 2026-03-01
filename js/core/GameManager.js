// js/core/GameManager.js — 游戏主控制器
// 依赖：所有 systems/、ui/ 模块
// 导出：init
//
// 职责：持有唯一 _state，编排各子系统，处理所有玩家动作，
//       每次状态变更后调用 _updateUI 同步视图。

import * as EventBus  from './EventBus.js';
import * as Economy   from '../systems/economy/Economy.js';
import * as Trade     from '../systems/trade/TradeSystem.js';
import * as Renderer  from '../ui/Renderer.js';
import * as HUD       from '../ui/HUD.js';
import * as MarketUI  from '../ui/MarketUI.js';
import * as ShipUI    from '../ui/ShipUI.js';
import * as MapUI     from '../ui/MapUI.js';
import * as Modal     from '../ui/Modal.js';
import { INITIAL_STATE, VICTORY_NET_WORTH } from '../data/constants.js';

let _state     = null;
let _startTime = null;

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init() {
  _state = _deepClone(INITIAL_STATE);

  Economy.init();
  Renderer.init();
  HUD.init();

  // 注入回调给各 UI 模块
  MapUI.init(_state, _handleTravel);
  MapUI.initTabs();
  Modal.init(_handleTradeConfirm);

  document.getElementById('restart-btn').addEventListener('click', function () {
    document.getElementById('gameover-modal').classList.add('hidden');
    init();
  });

  _updateUI();
  _startGameLoop();

  EventBus.emit('log:message', { text: '🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……', type: 'info' });
  EventBus.emit('log:message', {
    text: '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。目标：积累 ' +
          VICTORY_NET_WORTH.toLocaleString() + ' 信用积分，建立商业帝国！',
    type: 'tip',
  });
}

// ---------------------------------------------------------------------------
// 动作处理（所有状态变更入口）
// ---------------------------------------------------------------------------

function _dispatch(result) {
  // result = { ok, msgs, meta? }（TradeSystem 各函数的返回值）
  if (result && result.msgs) {
    result.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
  }
  _updateUI();
  if (result && result.ok) _checkVictory();
}

function _handleTravel(systemId) {
  const result = Trade.travelTo(_state, systemId);
  _dispatch(result);
}

function _handleTradeConfirm(action, goodId, quantity) {
  const result = action === 'buy'
    ? Trade.buyGood(_state, goodId, quantity)
    : Trade.sellGood(_state, goodId, quantity);
  _dispatch(result);
}

function _handleBuyUpgrade(upgradeId) {
  _dispatch(Trade.buyUpgrade(_state, upgradeId));
}

function _handleRefuel() {
  _dispatch(Trade.refuel(_state));
}

function _handleOpenBuy(good) {
  Modal.openTradeModal('buy', good, _state);
}

function _handleOpenSell(good) {
  Modal.openTradeModal('sell', good, _state);
}

// ---------------------------------------------------------------------------
// UI 全量刷新
// ---------------------------------------------------------------------------

function _updateUI() {
  const netWorth = Trade.getNetWorth(_state);
  HUD.updateStats(_state, netWorth);
  MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel);
  ShipUI.renderCargo(_state);
  ShipUI.renderUpgrades(_state, _handleBuyUpgrade);
  ShipUI.renderShipStats(_state);
}

// ---------------------------------------------------------------------------
// 胜利检测
// ---------------------------------------------------------------------------

function _checkVictory() {
  if (Trade.getNetWorth(_state) >= VICTORY_NET_WORTH) {
    document.getElementById('gameover-title').textContent   = '🎉 银河商业帝国建立！';
    document.getElementById('gameover-message').textContent =
      '恭喜！您在银河历第 ' + _state.day + ' 天建立了属于自己的商业帝国！\n' +
      '最终净资产：' + Math.floor(Trade.getNetWorth(_state)).toLocaleString() + ' 信用积分';
    document.getElementById('gameover-modal').classList.remove('hidden');
  }
}

// ---------------------------------------------------------------------------
// 游戏主循环
// ---------------------------------------------------------------------------

function _startGameLoop() {
  _startTime = performance.now();
  (function loop(ts) {
    const t = ts - _startTime;
    Renderer.renderStars(t);
    Renderer.renderMap(_state, t);
    requestAnimationFrame(loop);
  }(_startTime));
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
