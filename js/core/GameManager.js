// js/core/GameManager.js — 游戏主控制器
// 依赖：所有 systems/、ui/ 模块
// 导出：init
//
// 职责：持有唯一 _state，编排各子系统，处理所有玩家动作，
//       每次状态变更后调用 _updateUI 同步视图。

import * as EventBus   from './EventBus.js';
import * as Economy    from '../systems/economy/Economy.js';
import * as Trade      from '../systems/trade/TradeSystem.js';
import * as RandomEvent from '../systems/event/RandomEvent.js';
import * as Faction    from '../systems/faction/FactionSystem.js';
import * as Research   from '../systems/research/ResearchSystem.js';
import * as Renderer   from '../ui/Renderer.js';
import * as HUD        from '../ui/HUD.js';
import * as MarketUI   from '../ui/MarketUI.js';
import * as ShipUI     from '../ui/ShipUI.js';
import * as MapUI      from '../ui/MapUI.js';
import * as Modal      from '../ui/Modal.js';
import * as EventUI    from '../ui/EventUI.js';
import * as ResearchUI from '../ui/ResearchUI.js';
import * as FactionUI  from '../ui/FactionUI.js';
import * as SaveUI     from '../ui/SaveUI.js';
import * as QuestUI    from '../ui/QuestUI.js';
import * as AchievementUI from '../ui/AchievementUI.js';
import * as Fleet      from '../systems/fleet/FleetSystem.js';
import * as FleetUI    from '../ui/FleetUI.js';
import * as Save       from '../systems/save/SaveSystem.js';
import * as Quest      from '../systems/quest/QuestSystem.js';
import * as Achievement from '../systems/achievement/AchievementSystem.js';
import * as Tutorial   from '../systems/tutorial/TutorialSystem.js';
import * as TutorialUI from '../ui/TutorialUI.js';
import { INITIAL_STATE } from '../data/constants.js';
import * as Victory from '../systems/victory/VictorySystem.js';
import { VICTORY_PATHS } from '../data/victoryConditions.js';
import { getLevel, getRepRank, PLAYER_LEVELS } from '../data/playerLevels.js';
import { SYSTEMS } from '../data/systems.js';

let _state     = null;
let _startTime = null;

// 激活船只自动派遣
let _activeDispatchInterval = null;
const ACTIVE_DISPATCH_TICK_MS = 2000; // 派遣每步间隔（毫秒）

// 教程完成回调引用（用于防止重复注册）
let _onTutorialComplete = null;

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init() {
  _stopActiveDispatch();   // 重启时停止派遣
  _state = _deepClone(INITIAL_STATE);

  Economy.init();
  Fleet.init(_state);
  Faction.init(_state);
  Research.init(_state);
  Quest.init(_state);
  Achievement.init(_state);
  Renderer.init();
  HUD.init();

  // 注入回调给各 UI 模块
  MapUI.init(_state, _handleTravel, _handleGalaxyJump);
  MapUI.initTabs(function (tabId) {
    Tutorial.checkTabClick(tabId);
  });
  Modal.init(_handleTradeConfirm);

  document.getElementById('restart-btn').addEventListener('click', function () {
    document.getElementById('gameover-modal').classList.add('hidden');
    Tutorial.reset();
    init();
  });

  // 新手引导系统
  Tutorial.init(_state);
  TutorialUI.init(
    function () { Tutorial.advance(); _updateUI(); },
    function () { Tutorial.skip(); _updateUI(); }
  );

  // 教程完成后弹出公司重命名弹窗
  if (_onTutorialComplete) EventBus.off('tutorial:complete', _onTutorialComplete);
  _onTutorialComplete = function () { setTimeout(_showCompanyRenameModal, 400); };
  EventBus.on('tutorial:complete', _onTutorialComplete);

  // 点击 header 公司名按鈕随时重命名
  var companyBtn = document.getElementById('company-name-display');
  if (companyBtn) {
    companyBtn.onclick = _showCompanyRenameModal;
  }

  _updateUI();
  _startGameLoop();

  // 新手教程：首次游戏弹出选择弹窗
  if (!Tutorial.isCompleted()) {
    _showTutorialStartModal();
  } else {
    _showWelcomeMessages();
  }
}

function _showWelcomeMessages() {
  EventBus.emit('log:message', { text: '🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……', type: 'info' });
  EventBus.emit('log:message', {
    text: '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。多条胜利路径等你探索——查看顶部进度了解详情！',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '🔬 新功能：查看【科技】标签研究群星科技，【派系】标签管理外交关系！',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '📋 新功能：【任务】标签接取任务赚取奖励，【成就】标签追踪成就进度，【存档】标签保存游戏！',
    type: 'tip',
  });
}

function _showTutorialStartModal() {
  const modal = document.getElementById('tutorial-start-modal');
  modal.classList.remove('hidden');

  document.getElementById('tut-start-yes').onclick = function () {
    modal.classList.add('hidden');
    Tutorial.start();
  };

  document.getElementById('tut-start-no').onclick = function () {
    modal.classList.add('hidden');
    Tutorial.skip();
    _showWelcomeMessages();
  };
}

function _showCompanyRenameModal() {
  const modal = document.getElementById('company-rename-modal');
  const input = document.getElementById('company-name-input');
  const errorEl = document.getElementById('company-name-error');

  // 预填当前公司名
  input.value = _state.companyName || '';
  errorEl.classList.add('hidden');
  modal.classList.remove('hidden');

  // 聚焦并全选
  setTimeout(function () { input.focus(); input.select(); }, 50);

  document.getElementById('company-rename-confirm').onclick = function () {
    const name = input.value.trim();
    if (!name) {
      errorEl.classList.remove('hidden');
      return;
    }
    _state.companyName = name;
    modal.classList.add('hidden');
    _updateUI();
    EventBus.emit('log:message', {
      text: '🏢 公司已正式更名为「' + name + '」！愿财富与你同行！',
      type: 'upgrade',
    });
  };

  document.getElementById('company-rename-skip').onclick = function () {
    modal.classList.add('hidden');
  };
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
  // 成就检查（每次状态变更后）
  const achResult = Achievement.checkAll(_state);
  achResult.msgs.forEach(function (m) {
    EventBus.emit('log:message', { text: m.text, type: m.type });
  });
  _updateUI();
  if (result && result.ok) _checkVictory();
}

function _handleTravel(systemId) {
  const result = Trade.travelTo(_state, systemId);
  _dispatch(result);

  if (result && result.ok) {
    // 跨星系旅行后刷新地图按钮
    if (result.meta && result.meta.crossGalaxy) {
      MapUI.refreshGalaxyBtn(_state);
    }
    // 刷新市场位置信息
    MapUI.refreshMarketLocation(_state);
    // 探索追踪：记录已访问的星球和星系
    if (!_state.visitedSystems) _state.visitedSystems = [];
    if (!_state.visitedGalaxies) _state.visitedGalaxies = [];
    if (_state.visitedSystems.indexOf(_state.currentSystem) === -1) {
      _state.visitedSystems.push(_state.currentSystem);
    }
    if (_state.visitedGalaxies.indexOf(_state.currentGalaxy) === -1) {
      _state.visitedGalaxies.push(_state.currentGalaxy);
    }
    // 新手引导：旅行触发
    Tutorial.checkTrigger('travel');
    // 旅行经验 + 声望
    _gainExperience(5);
    _state.reputation = (_state.reputation || 0) + 1;

    // 连续无伤天数追踪（旅行前记录船体值）
    var _hullBefore = _state.shipHull || 100;

    // 任务进度：旅行
    const travelFaction = Faction.getFactionForSystem(_state.currentSystem);
    const questResult = Quest.checkProgress(_state, {
      action: 'travel',
      systemId: _state.currentSystem,
      factionId: travelFaction ? travelFaction.id : null,
    });
    questResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    // 科技研究进度推进
    const researchResult = Research.advanceResearch(_state);
    if (researchResult.msgs.length > 0) {
      researchResult.msgs.forEach(function (m) {
        EventBus.emit('log:message', { text: m.text, type: m.type });
      });
    }

    // 自动修复（如果有科技）
    if (_state.autoRepair && _state.autoRepair > 0) {
      _state.shipHull = Math.min(_state.maxHull || 100, (_state.shipHull || 100) + _state.autoRepair);
    }

    // 随机事件触发（群星风格）——教程期间不触发
    const event = Tutorial.isActive() ? null : RandomEvent.rollEvent(_state);
    if (event) {
      EventUI.showEvent(event, function (choiceIndex) {
        _handleEventChoice(choiceIndex);
      });
    }

    // 自动存档
    Fleet.syncShipFromState(_state);

    // 船队派遣贸易结算（每天一次）
    const fleetResult = Fleet.tickFleetRoutes(_state);
    fleetResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    Save.saveGame(0, _state, { isAutosave: true });

    // 连续无伤天数追踪
    if ((_state.shipHull || 100) >= _hullBefore) {
      _state.daysWithoutDamage = (_state.daysWithoutDamage || 0) + 1;
    } else {
      _state.daysWithoutDamage = 0;
    }

    _updateUI();
  }
}

function _handleEventChoice(choiceIndex) {
  const result = RandomEvent.resolveChoice(_state, choiceIndex);
  _dispatch(result);
}

/**
 * 跨星系跳转（点击其他星系星球时触发）
 */
function _handleGalaxyJump(systemId) {
  // 直接调用 travelTo，它会自动处理跨星系逻辑
  _handleTravel(systemId);
}

function _handleTradeConfirm(action, goodId, quantity) {
  const result = action === 'buy'
    ? Trade.buyGood(_state, goodId, quantity)
    : Trade.sellGood(_state, goodId, quantity);
  _dispatch(result);

  // 交易后更新派系关系
  if (result && result.ok) {
    // 同步船只状态
    Fleet.syncShipFromState(_state);
    // 新手引导：交易触发
    Tutorial.checkTrigger(action);

    const factionMsgs = Faction.onTrade(_state, _state.currentSystem, goodId, action, quantity);
    factionMsgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    _state.tradeCount = (_state.tradeCount || 0) + 1;

    // 经验值 & 声望
    const expGain = Math.max(1, Math.ceil(quantity * 2));
    const repGain = Math.max(1, Math.ceil(quantity * 0.5));
    _gainExperience(expGain);
    _state.reputation = (_state.reputation || 0) + repGain;

    // 任务进度：交易
    const tradeFaction = Faction.getFactionForSystem(_state.currentSystem);
    const tradeQuestResult = Quest.checkProgress(_state, {
      action: action,
      goodId: goodId,
      quantity: quantity,
      systemId: _state.currentSystem,
      factionId: tradeFaction ? tradeFaction.id : null,
      totalEarned: action === 'sell' ? (Economy.getSellPrice(_state.currentSystem, goodId, _state) * quantity) : 0,
    });
    tradeQuestResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    _updateUI();
  }
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

function _handleStartResearch(techId) {
  const result = Research.startResearch(_state, techId);
  _dispatch(result);
}

function _handleAcceptQuest(questId) {
  const result = Quest.acceptQuest(_state, questId);
  _dispatch(result);
}

function _handleAbandonQuest(questId) {
  const result = Quest.abandonQuest(_state, questId);
  _dispatch(result);
}

function _handleSaveGame(slotId) {
  Fleet.syncShipFromState(_state); // 保存前同步船只状态
  const result = Save.saveGame(slotId, _state);
  EventBus.emit('log:message', { text: result.msg, type: result.ok ? 'info' : 'error' });
  _updateUI();
}

function _handleLoadGame(slotId) {
  const result = Save.loadGame(slotId);
  if (result.ok) {
    _state = result.state;
    // 兼容旧存档：补充星系字段
    if (!_state.currentGalaxy) _state.currentGalaxy = 'milky_way';
    if (!_state.viewingGalaxy) _state.viewingGalaxy = _state.currentGalaxy;
    if (!_state.mapView) _state.mapView = 'planets';
    // 兼容旧存档：补充玩家等级
    if (!_state.playerLevel) {
      _state.playerLevel = getLevel(_state.experience || 0).level;
    }
    // 重新初始化依赖状态的子系统
    Fleet.init(_state);
    Faction.init(_state);
    Research.init(_state);
    Quest.init(_state);
    Achievement.init(_state);
    Economy.init();
    MapUI.refreshGalaxyBtn(_state);
    // 恢复派遣状态
    _stopActiveDispatch();
    if (Fleet.isActiveDispatched(_state)) {
      _startActiveDispatch();
    }
    _updateUI();
    EventBus.emit('log:message', { text: result.msg, type: 'info' });
  } else {
    EventBus.emit('log:message', { text: result.msg, type: 'error' });
  }
}

/**
 * 增加经验并检查升级
 */
function _gainExperience(amount) {
  const oldLevel = getLevel(_state.experience || 0);
  _state.experience = (_state.experience || 0) + amount;
  const newLevel = getLevel(_state.experience);

  if (newLevel.level > oldLevel.level) {
    _state.playerLevel = newLevel.level;
    EventBus.emit('log:message', {
      text: '🎉 升级！你现在是 ' + newLevel.icon + ' ' + newLevel.title + ' (Lv.' + newLevel.level + ')',
      type: 'upgrade',
    });
    // 应用升级奖励
    _applyLevelPerk(newLevel.level);
    // 提示新解锁的星球
    _announceNewRoutes(oldLevel.level, newLevel.level);
  }
}

function _applyLevelPerk(level) {
  switch (level) {
    case 3:  // 卖出价格 +3%
      _state.techSellBonus = (_state.techSellBonus || 0) + 0.03;
      EventBus.emit('log:message', { text: '✨ 等级奖励：卖出价格 +3%', type: 'info' });
      break;
    case 4:  // 货舱 +5
      {
        const ship4 = Fleet.getActiveShip(_state);
        if (ship4) ship4.maxCargo = Math.min(ship4.maxCargoCap, ship4.maxCargo + 5);
        Fleet.syncStateFromShip(_state);
      }
      EventBus.emit('log:message', { text: '✨ 等级奖励：当前船只货舱容量 +5', type: 'info' });
      break;
    case 5:  // 买入价格 -3%
      _state.techBuyDiscount = (_state.techBuyDiscount || 0) + 0.03;
      EventBus.emit('log:message', { text: '✨ 等级奖励：买入价格 -3%', type: 'info' });
      break;
    case 6:  // 燃料效率 +10%
      {
        const ship6 = Fleet.getActiveShip(_state);
        if (ship6) ship6.fuelEff = Math.max(ship6.minFuelEff, ship6.fuelEff * 0.9);
        Fleet.syncStateFromShip(_state);
      }
      EventBus.emit('log:message', { text: '✨ 等级奖励：当前船只燃料效率 +10%', type: 'info' });
      break;
    case 7:  // 所有派系好感 +10
      if (_state.factionRelations) {
        Object.keys(_state.factionRelations).forEach(function (fid) {
          _state.factionRelations[fid] = Math.min(100, _state.factionRelations[fid] + 10);
        });
      }
      EventBus.emit('log:message', { text: '✨ 等级奖励：所有派系好感 +10', type: 'info' });
      break;
    case 8:  // 货舱 +10
      {
        const ship8 = Fleet.getActiveShip(_state);
        if (ship8) ship8.maxCargo = Math.min(ship8.maxCargoCap, ship8.maxCargo + 10);
        Fleet.syncStateFromShip(_state);
      }
      EventBus.emit('log:message', { text: '✨ 等级奖励：当前船只货舱容量 +10', type: 'info' });
      break;
    case 9:  // 卖出价格 +5%
      _state.techSellBonus = (_state.techSellBonus || 0) + 0.05;
      EventBus.emit('log:message', { text: '✨ 等级奖励：卖出价格 +5%', type: 'info' });
      break;
    case 10: // 全属性提升
      {
        const ship10 = Fleet.getActiveShip(_state);
        if (ship10) {
          ship10.maxCargo = Math.min(ship10.maxCargoCap, ship10.maxCargo + 10);
          ship10.maxFuel  = Math.min(ship10.maxFuelCap, ship10.maxFuel + 20);
        }
        Fleet.syncStateFromShip(_state);
      }
      _state.techBuyDiscount = (_state.techBuyDiscount || 0) + 0.05;
      _state.techSellBonus = (_state.techSellBonus || 0) + 0.05;
      EventBus.emit('log:message', { text: '✨ 银河商业帝皇加冕！当前船只全属性大幅提升！', type: 'upgrade' });
      break;
  }
}

/**
 * 升级时通知玩家新解锁的星球/航线
 */
function _announceNewRoutes(oldLvl, newLvl) {
  const newPlanets = SYSTEMS.filter(function (s) {
    const ml = s.minLevel || 1;
    return ml > oldLvl && ml <= newLvl;
  });
  if (newPlanets.length > 0) {
    const names = newPlanets.slice(0, 5).map(function (s) { return s.name; }).join('、');
    const extra = newPlanets.length > 5 ? ' 等 ' + newPlanets.length + ' 颗星球' : '';
    EventBus.emit('log:message', {
      text: '🗺️ 新航线开放！解锁了 ' + names + extra + '！',
      type: 'info',
    });
  }
}

// ---------------------------------------------------------------------------
// 船队管理
// ---------------------------------------------------------------------------

function _handleBuyShip(shipTypeId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.buyShip(_state, shipTypeId);
  _dispatch(result);
}

function _handleSwitchShip(shipIndex) {
  // 切换前停止激活船只的自动派遣
  _stopActiveDispatch();
  Fleet.syncShipFromState(_state);
  const result = Fleet.switchShip(_state, shipIndex);
  _dispatch(result);
  // 如果新激活的船只已有路线，重新启动派遣
  if (result && result.ok && Fleet.isActiveDispatched(_state)) {
    _startActiveDispatch();
  }
}

function _handleUpgradeShip(shipIndex, upgradeId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.upgradeShip(_state, upgradeId, shipIndex);
  _dispatch(result);
}

function _handleAssignRoute(shipIndex, buySystemId, sellSystemId, goodId) {
  Fleet.syncShipFromState(_state);
  var isActive = shipIndex === (_state.activeShipIndex || 0);
  const result = Fleet.assignRoute(_state, shipIndex, buySystemId, sellSystemId, goodId);
  _dispatch(result);
  // 如果是激活船只被派遣，启动自动派遣定时器
  if (result && result.ok && isActive) {
    _startActiveDispatch();
  }
}

function _handleCancelRoute(shipIndex) {
  var isActive = shipIndex === (_state.activeShipIndex || 0);
  const result = Fleet.cancelRoute(_state, shipIndex);
  _dispatch(result);
  // 如果是激活船只被召回，停止定时器
  if (isActive) {
    _stopActiveDispatch();
  }
}

function _handleBuySlot() {
  const result = Fleet.buySlot(_state);
  _dispatch(result);
}

// ---------------------------------------------------------------------------
// 激活船只自动派遣（替代原来的全局自动贸易）
// ---------------------------------------------------------------------------

function _startActiveDispatch() {
  _stopActiveDispatch();
  _activeDispatchInterval = setInterval(_runActiveDispatchTick, ACTIVE_DISPATCH_TICK_MS);
  _updateActiveDispatchUI();
  EventBus.emit('log:message', { text: '📡 激活船只已派遣！每 2 秒执行一次操作。', type: 'info' });
}

function _stopActiveDispatch() {
  if (_activeDispatchInterval) {
    clearInterval(_activeDispatchInterval);
    _activeDispatchInterval = null;
  }
  _updateActiveDispatchUI();
}

function _runActiveDispatchTick() {
  // 有弹窗时暂停
  if (!document.getElementById('event-modal').classList.contains('hidden'))    return;
  if (!document.getElementById('gameover-modal').classList.contains('hidden')) { _stopActiveDispatch(); return; }

  // 检查激活船只是否仍在派遣中
  if (!Fleet.isActiveDispatched(_state)) {
    _stopActiveDispatch();
    return;
  }

  var result = Fleet.tickActiveShipDispatch(_state);

  // 处理日志
  result.msgs.forEach(function (m) {
    EventBus.emit('log:message', { text: m.text, type: m.type });
  });

  // 需要旅行
  if (result.needTravel) {
    // 先补燃料
    var fuelCost = Economy.getFuelCost(_state.currentSystem, result.needTravel, _state.fuelEfficiency);
    if (_state.fuel < fuelCost) {
      var refuelResult = Trade.refuel(_state);
      _dispatch(refuelResult);
      if (_state.fuel < fuelCost) {
        EventBus.emit('log:message', { text: '📡 派遣船只燃料不足，已召回。', type: 'error' });
        Fleet.cancelActiveDispatch(_state);
        _stopActiveDispatch();
        _updateUI();
        return;
      }
    }
    _handleTravel(result.needTravel);
    return;
  }

  // 需要买入
  if (result.needBuy) {
    var route = result.needBuy;
    var cargoKeys = Object.keys(_state.cargo).filter(function (k) { return (_state.cargo[k] || 0) > 0 && k === route.goodId; });
    // 买入商品
    var buyPrice = Economy.getBuyPrice(route.buySystemId, route.goodId, _state);
    var cargoUsed = Object.values(_state.cargo).reduce(function (s, q) { return s + q; }, 0);
    var space = _state.maxCargo - cargoUsed;
    var canAfford = Math.floor(_state.credits / buyPrice);
    var qty = Math.min(space, canAfford);
    if (qty > 0) {
      _handleTradeConfirm('buy', route.goodId, qty);
    }
    // 转入前往卖出地状态
    var ship = Fleet.getActiveShip(_state);
    if (ship && ship.route) ship.route.status = 'traveling_sell';
    _updateUI();
    return;
  }

  // 需要卖出
  if (result.needSell) {
    var routeS = result.needSell;
    var sellQty = _state.cargo[routeS.goodId] || 0;
    if (sellQty > 0) {
      _handleTradeConfirm('sell', routeS.goodId, sellQty);
    }
    // 循环：重新前往买入地
    var shipS = Fleet.getActiveShip(_state);
    if (shipS && shipS.route) shipS.route.status = 'traveling_buy';
    _updateUI();
    return;
  }
}

function _updateActiveDispatchUI() {
  var ctrlDiv = document.getElementById('auto-trade-controls');
  if (!ctrlDiv) return;
  if (_activeDispatchInterval) {
    ctrlDiv.classList.remove('hidden');
    ctrlDiv.innerHTML = '<span class="dispatch-active-indicator">📡 激活船只派遣中…</span>';
  } else {
    ctrlDiv.classList.add('hidden');
    ctrlDiv.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// UI 全量刷新
// ---------------------------------------------------------------------------

function _updateUI() {
  const netWorth = Trade.getNetWorth(_state);
  HUD.updateStats(_state, netWorth);
  HUD.updateCompanyName(_state);
  MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel);
  ShipUI.renderShipStats(_state);
  ResearchUI.render(_state, _handleStartResearch);
  FactionUI.render(_state);
  QuestUI.render(_state, _handleAcceptQuest, _handleAbandonQuest);
  AchievementUI.render(_state);
  FleetUI.render(_state, _handleBuyShip, _handleSwitchShip, _handleUpgradeShip, _handleAssignRoute, _handleCancelRoute, _handleBuySlot);
  FleetUI.renderShop(_state, _handleBuyShip);
  SaveUI.render(_handleSaveGame, _handleLoadGame);
  _updateActiveDispatchUI();
}

// ---------------------------------------------------------------------------
// 胜利检测
// ---------------------------------------------------------------------------

function _checkVictory() {
  const result = Victory.checkVictory(_state);
  if (!result.won) return;

  const path = result.path;
  const allProgress = Victory.getProgress(_state);

  // 标题
  document.getElementById('gameover-title').textContent = path.victoryTitle;

  // 构建详细信息
  let msg = path.victoryMessage + '\n\n';
  msg += '银河历第 ' + _state.day + ' 天达成 · ';
  msg += '玩家等级：' + getLevel(_state.experience || 0).title + '\n\n';

  // 统计数据
  msg += '━━━━━ 游戏统计 ━━━━━\n';
  msg += '净资产：' + Math.floor(Trade.getNetWorth(_state)).toLocaleString() + ' 信用积分\n';
  msg += '贸易次数：' + (_state.tradeCount || 0) + ' 次\n';
  msg += '已研究科技：' + (_state.researchedTechs || []).length + ' / 16 项\n';
  msg += '完成任务：' + (_state.completedQuests || []).length + ' 个\n';
  msg += '解锁成就：' + (_state.achievements || []).length + ' 个\n';
  msg += '已探索星球：' + (_state.visitedSystems || []).length + ' 颗\n';
  msg += '已探索星系：' + (_state.visitedGalaxies || []).length + ' / 8 个\n\n';

  // 各路径进度
  msg += '━━━━━ 胜利路径 ━━━━━\n';
  allProgress.forEach(function (p) {
    const status = p.completed ? '✅' : (Math.floor(p.progress * 100) + '%');
    msg += p.icon + ' ' + p.name + '：' + status + '\n';
  });

  document.getElementById('gameover-message').textContent = msg;
  document.getElementById('gameover-modal').classList.remove('hidden');
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
