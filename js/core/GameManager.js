// js/core/GameManager.js — 游戏主控制器
// 依赖：所有 systems/、ui/ 模块
// 导出：init
//
// 职责：持有唯一 _state，编排各子系统，处理所有玩家动作，
//       每次状态变更后调用 _updateUI 同步视图。

import * as EventBus   from './EventBus.js';
import * as Economy    from '../systems/economy/Economy.js';
import * as Trade      from '../systems/trade/TradeSystem.js';
import * as Commerce   from '../systems/commerce/CommerceFacade.js';
import * as RandomEvent from '../systems/event/RandomEvent.js';
import * as Faction    from '../systems/faction/FactionSystem.js';
import * as Research   from '../systems/research/ResearchSystem.js';
import * as Renderer3D from '../ui/Renderer3DAdvanced.js?v=20260406-routefix2';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
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
import * as TradeStationUI from '../ui/TradeStationUI.js';
import * as Fleet      from '../systems/fleet/FleetSystem.js?v=20260406-routefix2';
import * as Crew       from '../systems/fleet/CrewSystem.js';
import * as AutoTrade  from '../systems/trade/AutoTradeSystem.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as Futures from '../systems/finance/FuturesSystem.js';
import * as FleetUI    from '../ui/FleetUI.js';
import * as Save       from '../systems/save/SaveSystem.js';
import * as Quest      from '../systems/quest/QuestSystem.js';
import * as Achievement from '../systems/achievement/AchievementSystem.js';
import * as Tutorial   from '../systems/tutorial/TutorialSystem.js';
import * as TutorialUI from '../ui/TutorialUI.js';
import { INITIAL_STATE, DIFFICULTY_LEVELS } from '../data/constants.js';
import * as Victory from '../systems/victory/VictorySystem.js';
import { VICTORY_PATHS } from '../data/victoryConditions.js';
import { getLevel } from '../data/playerLevels.js';
import { SYSTEMS } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Settings from './SettingsManager.js';
import * as Progression from '../systems/progression/ProgressionSystem.js';
import * as Dispatch from './DispatchController.js?v=20260406-routefix2';

let _state     = null;
let _startTime = null;
let _settings  = { motionLevel: 'full' };
let _blackMarketMode = false; // 当前是否处于黑市交易模式

function _getMarketFinanceActions() {
  return {
    onTakeLoan: _handleTakeLoan,
    onRepayLoan: _handleRepayLoan,
    onBuyStock: _handleBuyStock,
    onSellStock: _handleSellStock,
    onInvestTradeStation: _handleInvestTradeStation,
    onPurchaseInsurance: _handlePurchaseInsurance,
    onSubmitInsuranceClaim: _handleSubmitInsuranceClaim,
    onBuildTradeStation: _handleBuildTradeStation,
    onUpgradeTradeStation: _handleUpgradeTradeStation,
    onHireTradeStationManager: _handleHireTradeStationManager,
    onSetTradeStationStrategy: _handleSetTradeStationStrategy,
    onFuturesLong: _handleFuturesLong,
    onFuturesShort: _handleFuturesShort,
    onFuturesClose: _handleFuturesClose,
  };
}

// 教程完成回调引用（用于防止重复注册）
let _onTutorialComplete = null;

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init(difficulty) {
  Dispatch.stopActiveDispatch();   // 重启时停止派遣
  _state = _deepClone(INITIAL_STATE);
  _settings = Settings.loadSettings();

  // 应用难度设定
  var effectiveDifficulty = difficulty || _settings.difficulty || 'normal';
  var diff = DIFFICULTY_LEVELS[effectiveDifficulty] || DIFFICULTY_LEVELS['normal'];
  _state.difficulty = diff.id;
  _state.credits = diff.startCredits;
  RandomEvent.resetRuntimeState(_state);

  Economy.init();
  Fleet.init(_state);
  Faction.init(_state);
  Research.init(_state);
  Quest.init(_state);
  Achievement.init(_state);
  TradeStation.init(_state);
  Finance.init(_state);
  GalaxyData.init(_state); // Initialize galaxy data layer
  Renderer3D.init();
  Renderer3D.resetRuntimeState(_state.currentSystem);
  Settings.applySettings(_settings, Renderer3D);
  HUD.init();

  // 注入回调给各 UI 模块
  MapUI.init(_state, _handleTravel, _handleGalaxyJump);
  MapUI.initTabs(function (tabId) {
    Tutorial.checkTabClick(tabId);
  });

  // 3D视角默认启用，确保回调已绑定
  MapUI.init3DCallbacks(_state, _handleTravel, _handleGalaxyJump);


  // 注入市场刷新回调（让 MapUI 可以触发市场表格重绘）
  MapUI.setRefreshMarket(function (mode) {
    const sysId = MapUI.getMarketViewSystem(_state);
    var bmMode = _blackMarketMode ? 'black' : 'open';
    MarketUI.showDetail(sysId, bmMode);
    MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, sysId, bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
    _bindMarketModeButtons();
  });
  Modal.init(_handleTradeConfirm);

  // 重新绑定重启按钮（用 cloneNode 去掉旧 listener 避免叠加）
  var oldRestartBtn = document.getElementById('restart-btn');
  if (oldRestartBtn) {
    var newRestartBtn = oldRestartBtn.cloneNode(true);
    oldRestartBtn.parentNode.replaceChild(newRestartBtn, oldRestartBtn);
    newRestartBtn.addEventListener('click', function () {
      document.getElementById('gameover-modal').classList.add('hidden');
      Tutorial.reset();
      init();
    });
  }

  // 新手引导系统
  Tutorial.init(_state);
  TutorialUI.init(
    function () { Tutorial.advance(); _updateUI(); },
    function () { Tutorial.skip(); _updateUI(); }
  );

  // 教程完成后推荐首批任务并弹出公司重命名弹窗
  if (_onTutorialComplete) EventBus.off('tutorial:complete', _onTutorialComplete);
  _onTutorialComplete = function () {
    _recommendStarterQuests();
    setTimeout(_showCompanyRenameModal, 400);
  };
  EventBus.on('tutorial:complete', _onTutorialComplete);

  // 点击 header 公司名按鈕随时重命名
  var companyBtn = document.getElementById('company-name-display');
  if (companyBtn) {
    companyBtn.onclick = _showCompanyRenameModal;
  }

  Settings.initSettingsModal({
    settings: _settings,
    Renderer: Renderer3D,
    onDifficultyChanged: function (nextDifficulty) {
      if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
      _state.difficulty = nextDifficulty;
      _settings.difficulty = nextDifficulty;
      _updateUI();
    },
    onResetTutorial: function () {
      Tutorial.reset();
      Settings.hideSettingsModal();
      init();
    },
    onClearSaves: function () {
      for (var slotId = 0; slotId < 4; slotId++) Save.deleteSlot(slotId);
      EventBus.emit('log:message', { text: '🗑 本地存档已全部清空。', type: 'info' });
      _updateUI();
    },
  });

  _updateUI();
  _startGameLoop();

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
    text: '📋 新功能：【任务】标签接取任务赚取奖励，【成就】标签追踪成就进度，右上角【设置】可管理存档！',
    type: 'tip',
  });
}

function _recommendStarterQuests() {
  var recommendations = Quest.getStarterRecommendations(_state, 3);

  _updateUI();
  MapUI.activateTab('tab-quest');

  if (recommendations.length === 0) {
    EventBus.emit('log:message', {
      text: '📋 教程结束后可前往任务页查看当前章节任务，继续推进你的贸易生涯。',
      type: 'tip',
    });
    return;
  }

  EventBus.emit('log:message', {
    text: '📋 下一步建议：先去【任务】页接取 ' + recommendations.map(function (quest) { return '「' + quest.name + '」'; }).join('、') + '。',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '🧭 我已替你切到任务页，这几项任务都可以立刻开始，适合作为教程后的第一阶段目标。',
    type: 'info',
  });
}

// 设置管理已提取到 js/core/SettingsManager.js

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
  // 旅行前：如有待处理事件，强制弹出，阻止本次旅行
  if (EventUI.hasPendingEvent()) {
    EventUI.forcePendingEvent();
    EventBus.emit('log:message', { text: '⚠️ 请先处理当前事件再继续航行。', type: 'error' });
    return;
  }

  // 飞船飞行中不允许再次发起旅行，避免出现跳星球起飞
  if (Renderer3D.isActive() && Renderer3D.isShipFlying && Renderer3D.isShipFlying()) {
    EventBus.emit('log:message', { text: '🛰️ 飞船正在飞行中，请等待抵达后再发起下一次航行。', type: 'info' });
    return;
  }

  const previousSystem = _state.currentSystem;
  const previousDay = _state.day || 1;
  const result = Trade.travelTo(_state, systemId);
  _dispatch(result);

  if (result && result.ok) {
    // 3D 飞船飞行动画（传入当前飞船类型）
    if (Renderer3D.isActive() && previousSystem) {
      var activeShipForFlight = Fleet.getActiveShip(_state);
      var shipTypeId = activeShipForFlight ? activeShipForFlight.typeId : 'shuttle';
      Renderer3D.flyShipTo(previousSystem, systemId, null, shipTypeId, {
        shipIndex: _state.activeShipIndex || 0,
        routeRevision: activeShipForFlight && activeShipForFlight.route
          ? (activeShipForFlight.routeRevision || 0)
          : null,
      });
    }

    // 跨星系旅行后刷新地图按钮
    if (result.meta && result.meta.crossGalaxy) {
      MapUI.refreshGalaxyBtn(_state);
    }
    // 刷新市场位置信息
    MapUI.refreshMarketLocation(_state);

    // 走私检查（入港时）
    var smuggleResult = Economy.checkSmuggling(_state, _state.currentSystem);
    smuggleResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    if (smuggleResult.caught) {
      var activeShipAfterCheck = Fleet.getActiveShip(_state);
      if (activeShipAfterCheck && activeShipAfterCheck.route && activeShipAfterCheck.route.marketMode === 'black') {
        Fleet.cancelActiveDispatch(_state);
        Dispatch.stopActiveDispatch();
        EventBus.emit('log:message', { text: '⏹️ 黑市自动派遣因走私被查获而中止。', type: 'error' });
      }
    }
    if (!smuggleResult.caught && smuggleResult.msgs.length === 0) {
      // 携带违禁品且未被检查 → 记录走私成功
      var hasContraband = Object.keys(_state.cargo).some(function (gid) {
        var g = GOODS.find(function (x) { return x.id === gid; });
        return g && g.legality === 'illegal' && _state.cargo[gid] > 0;
      });
      if (hasContraband) Economy.recordSmugglingEvaded(_state);
    }

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
    var expResult = Progression.gainExperience(_state, 5);
    expResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });
    var compExpResult = Progression.gainCompanyExperience(_state, 2);
    compExpResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });
    _state.reputation = (_state.reputation || 0) + 1;

    var wageResult = Crew.payDailyWages(_state, Math.max(0, (_state.day || 1) - previousDay));
    wageResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

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
    var activeShip = Fleet.getActiveShip(_state);
    var activeShipStats = Fleet.getEffectiveShipStats(_state, activeShip);
    var totalAutoRepair = (_state.autoRepair || 0) + (activeShipStats.autoRepair || 0);
    if (totalAutoRepair > 0) {
      _state.shipHull = Math.min(_state.maxHull || 100, (_state.shipHull || 100) + totalAutoRepair);
    }

    // 随机事件触发（群星风格）——教程期间不触发
    // 使用非阻塞通知条代替立即弹窗，让玩家可以延后处理
    const event = Tutorial.isActive() ? null : RandomEvent.rollEvent(_state);
    if (event) {
      EventUI.showEventNotification(event, function (choiceIndex) {
        _handleEventChoice(choiceIndex);
      });
      EventBus.emit('log:message', { text: '📢 遭遇事件：' + event.title + '！查看底部通知处理。', type: 'info' });
    }

    // 自动存档
    Fleet.syncShipFromState(_state);

    // 船队派遣贸易结算（每天一次）
    const fleetResult = Fleet.tickFleetRoutes(_state);
    fleetResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    _state.galaxyStates = GalaxyData.getAllPlanetStates(); // 保存星系数据层状态
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

function _handleTradeConfirm(action, goodId, quantity, marketType) {
  // 统一通过 CommerceFacade 处理公开市场与黑市交易
  const effectiveMarket = marketType === 'black' ? 'black' : 'open';
  const result = action === 'buy'
    ? Commerce.buyGood(_state, goodId, quantity, effectiveMarket)
    : Commerce.sellGood(_state, goodId, quantity, effectiveMarket);
  _dispatch(result);

  if (result && result.ok) {
    Fleet.syncShipFromState(_state);
    var activeRoute = Fleet.getActiveShip(_state) ? Fleet.getActiveShip(_state).route : null;
    if (activeRoute && activeRoute.goodId === goodId) {
      if (action === 'buy') {
        activeRoute.lastBuyPrice = effectiveMarket === 'black'
          ? Economy.getBlackMarketBuyPrice(_state.currentSystem, goodId, _state)
          : Economy.getBuyPrice(_state.currentSystem, goodId, _state);
      } else if (action === 'sell') {
        activeRoute.lastBuyPrice = null;
      }
      activeRoute.lastPolicyMessage = null;
    }
    Tutorial.checkTrigger(action);

    const factionMsgs = Faction.onTrade(_state, _state.currentSystem, goodId, action, quantity);
    factionMsgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    _state.tradeCount = (_state.tradeCount || 0) + 1;

    // 经验值 & 声望（黑市交易经验更高）
    const isBlack = effectiveMarket === 'black';
    const expGain = Math.max(1, Math.ceil(quantity * (isBlack ? 3 : 2)));
    const repGain = Math.max(1, Math.ceil(quantity * 0.5));
    var tradeExpResult = Progression.gainExperience(_state, expGain);
    tradeExpResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });
    if (!isBlack) {
      const profit = (result.meta && typeof result.meta.profit === 'number') ? result.meta.profit : 0;
      const companyExpGain = action === 'sell'
        ? Math.max(2, Math.ceil(quantity * 0.8) + Math.ceil(Math.max(0, profit) / 120))
        : Math.max(1, Math.ceil(quantity * 0.8));
      var tradeCompExpResult = Progression.gainCompanyExperience(_state, companyExpGain);
      tradeCompExpResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });

      // 任务进度：仅公开市场交易触发任务检查
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
    }
    _state.reputation = (_state.reputation || 0) + repGain;

    _updateUI();
  }
}

function _handleRefuel() {
  _dispatch(Commerce.refuel(_state));
}

function _handleOpenBuy(good) {
  Modal.openTradeModal('buy', good, _state);
}

function _handleOpenSell(good) {
  Modal.openTradeModal('sell', good, _state);
}

// ---------------------------------------------------------------------------
// 黑市交易（UI 入口：打开确认弹窗）
// ---------------------------------------------------------------------------

function _handleBlackMarketBuy(good) {
  Modal.openTradeModal('buy', good, _state, 'black');
}

function _handleBlackMarketSell(good) {
  Modal.openTradeModal('sell', good, _state, 'black');
}

/**
 * 绑定市场模式切换按钮（公开市场 ↔ 黑市）
 * 在每次渲染 market detail 后调用
 */
function _bindMarketModeButtons() {
  var btns = document.querySelectorAll('.market-mode-btn:not(.disabled)');
  btns.forEach(function (btn) {
    // 用 cloneNode 替换旧节点，避免重复绑定 listener
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', function () {
      var mode = fresh.dataset.mode;
      _blackMarketMode = mode === 'black';
      // 重新渲染详情
      var sysId = MapUI.getMarketViewSystem(_state);
      var bmMode = _blackMarketMode ? 'black' : 'open';
      MarketUI.showDetail(sysId, bmMode);
      MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, sysId, bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
      _bindMarketModeButtons();
    });
  });
}

function _handleStartResearch(techId) {
  const result = Research.startResearch(_state, techId);
  _dispatch(result);
}

function _handleCancelQueuedResearch(techId) {
  const result = Research.cancelQueuedResearch(_state, techId);
  _dispatch(result);
}

function _handleMoveQueuedResearchUp(techId) {
  const result = Research.moveQueuedResearchUp(_state, techId);
  _dispatch(result);
}

function _handleMoveQueuedResearchDown(techId) {
  const result = Research.moveQueuedResearchDown(_state, techId);
  _dispatch(result);
}

function _handleClearResearchQueue() {
  const result = Research.clearResearchQueue(_state);
  _dispatch(result);
}

function _handleBuildTradeStation(systemId) {
  const result = Commerce.buildTradeStation(_state, systemId);
  _dispatch(result);
}

function _handleUpgradeTradeStation(systemId) {
  const result = Commerce.upgradeTradeStation(_state, systemId);
  _dispatch(result);
}

function _handleHireTradeStationManager(systemId, managerId) {
  const result = Commerce.hireTradeStationManager(_state, systemId, managerId);
  _dispatch(result);
}

function _handleSetTradeStationStrategy(systemId, strategyId) {
  const result = Commerce.setTradeStationStrategy(_state, systemId, strategyId);
  _dispatch(result);
}

function _handleTakeLoan(offerId) {
  const result = Commerce.takeLoan(_state, offerId);
  _dispatch(result);
}

function _handleRepayLoan(loanId) {
  const result = Commerce.repayLoan(_state, loanId);
  _dispatch(result);
}

function _handleBuyStock(stockId) {
  const result = Commerce.buyStock(_state, stockId);
  _dispatch(result);
}

function _handleSellStock(stockId) {
  const result = Commerce.sellStock(_state, stockId);
  _dispatch(result);
}

function _handleInvestTradeStation(systemId) {
  const result = Commerce.investInTradeStation(_state, systemId);
  _dispatch(result);
}

function _handlePurchaseInsurance(policyType) {
  const result = Commerce.purchaseInsurance(_state, policyType);
  _dispatch(result);
}

function _handleSubmitInsuranceClaim(policyType) {
  const result = Commerce.submitInsuranceClaim(_state, policyType);
  _dispatch(result);
}

function _handleFuturesLong(goodId) {
  const result = Commerce.openFuturesLong(_state, goodId);
  _dispatch(result);
}

function _handleFuturesShort(goodId) {
  const result = Commerce.openFuturesShort(_state, goodId);
  _dispatch(result);
}

function _handleFuturesClose(contractId) {
  const result = Commerce.closeFutures(_state, contractId);
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
  _state.economyCycle = Economy.getCycleState();
  _state.galaxyStates = GalaxyData.getAllPlanetStates(); // 保存星系数据层状态
  const result = Save.saveGame(slotId, _state);
  EventBus.emit('log:message', { text: result.msg, type: result.ok ? 'info' : 'error' });
  _updateUI();
}

function _handleLoadGame(slotId) {
  const result = Save.loadGame(slotId);
  if (result.ok) {
    Settings.hideSettingsModal();
    _state = result.state;
    RandomEvent.syncRuntimeState(_state);
    _settings.difficulty = _state.difficulty;
    Settings.saveSettings(_settings);
    // 重新初始化依赖状态的子系统
    Fleet.init(_state);
    Faction.init(_state);
    Research.init(_state);
    Quest.init(_state);
    Achievement.init(_state);
    TradeStation.init(_state);
    Finance.init(_state);
    GalaxyData.init(_state); // 重新初始化星系数据层
    if (_state.galaxyStates && Object.keys(_state.galaxyStates).length > 0) {
      GalaxyData.restorePlanetStates(_state.galaxyStates); // 恢复星系状态
    }
    Economy.init();
    Economy.setCycleState(_state.economyCycle);
    Renderer3D.resetRuntimeState(_state.currentSystem);
    MapUI.refreshGalaxyBtn(_state);
    // 恢复派遣状态
    Dispatch.stopActiveDispatch();
    if (Fleet.isActiveDispatched(_state)) {
      Dispatch.startActiveDispatch(_boundDispatchTick);
    }
    _updateUI();
    EventBus.emit('log:message', { text: result.msg, type: 'info' });
  } else {
    EventBus.emit('log:message', { text: result.msg, type: 'error' });
  }
}

// 等级进阶逻辑已提取到 js/systems/progression/ProgressionSystem.js

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
  Dispatch.stopActiveDispatch();
  Fleet.syncShipFromState(_state);
  const result = Fleet.switchShip(_state, shipIndex);
  if (result && result.ok) {
    _state.lastSwitchedShipIndex = shipIndex;
    _state.lastShipSwitchAt = Date.now();
  }
  _dispatch(result);
  // 如果新激活的船只已有路线，重新启动派遣
  if (result && result.ok && Fleet.isActiveDispatched(_state)) {
    Dispatch.startActiveDispatch(_boundDispatchTick);
  }
}

function _handleUpgradeShip(shipIndex, upgradeId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.upgradeShip(_state, upgradeId, shipIndex);
  _dispatch(result);
}

function _handleAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
  Fleet.syncShipFromState(_state);
  var isActive = shipIndex === (_state.activeShipIndex || 0);
  const result = Fleet.assignRoute(_state, shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
  if (result && result.ok && isActive && Renderer3D.cancelShipFlight) {
    Renderer3D.cancelShipFlight();
  }
  _dispatch(result);
  // 如果是激活船只被派遣，启动自动派遣定时器
  if (result && result.ok && isActive) {
    Dispatch.startActiveDispatch(_boundDispatchTick);
  }
}

function _handleCancelRoute(shipIndex) {
  var isActive = shipIndex === (_state.activeShipIndex || 0);
  const result = Fleet.cancelRoute(_state, shipIndex);
  if (result && result.ok && isActive && Renderer3D.cancelShipFlight) {
    Renderer3D.cancelShipFlight();
  }
  _dispatch(result);
  // 如果是激活船只被召回，停止定时器
  if (isActive) {
    Dispatch.stopActiveDispatch();
  }
}

function _handleBuySlot() {
  const result = Fleet.buySlot(_state);
  _dispatch(result);
}

function _handleSellShip(shipIndex) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.sellShip(_state, shipIndex);
  _dispatch(result);
}

function _handleInstallMod(shipIndex, modId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.installMod(_state, modId, shipIndex);
  _dispatch(result);
}

function _handleUninstallMod(shipIndex, modId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.uninstallMod(_state, modId, shipIndex);
  _dispatch(result);
}

function _handleRecruitCrew(offerId) {
  const result = Crew.recruitCrew(_state, offerId, _state.currentSystem);
  _dispatch(result);
}

function _handleAssignCrew(shipIndex, crewId) {
  const result = Crew.assignCrewToShip(_state, crewId, shipIndex);
  if (result && result.ok && shipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

function _handleUnassignCrew(shipIndex, crewId) {
  const result = Crew.unassignCrewFromShip(_state, crewId, shipIndex);
  if (result && result.ok && shipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

function _handleDismissCrew(crewId) {
  var existingCrew = Crew.getCrewById(_state, crewId);
  var affectedShipIndex = existingCrew ? existingCrew.assignedShipIndex : null;
  const result = Crew.dismissCrew(_state, crewId);
  if (result && result.ok && affectedShipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

// ---------------------------------------------------------------------------
// 激活船只自动派遣 — 逻辑已提取到 js/core/DispatchController.js
// GameManager 仅保留 tick 回调的胶水逻辑
// ---------------------------------------------------------------------------

function _boundDispatchTick() {
  var tickResult = Dispatch.runActiveDispatchTick(_state, {
    isModalVisible: function (id) {
      var el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    },
  });

  // 处理日志
  tickResult.msgs.forEach(function (m) {
    EventBus.emit('log:message', { text: m.text, type: m.type });
  });

  switch (tickResult.action) {
    case 'stopped':
      Dispatch.stopActiveDispatch();
      _updateUI();
      break;
    case 'travel_need_refuel': {
      var refuelResult = Trade.refuel(_state);
      _dispatch(refuelResult);
      if (_state.fuel < tickResult.payload.fuelCost) {
        EventBus.emit('log:message', { text: '📡 派遣船只燃料不足，已召回。', type: 'error' });
        Fleet.cancelActiveDispatch(_state);
        Dispatch.stopActiveDispatch();
        _updateUI();
      } else {
        _handleTravel(tickResult.payload.systemId);
      }
      break;
    }
    case 'travel':
      _handleTravel(tickResult.payload.systemId);
      break;
    case 'buy':
      _handleTradeConfirm('buy', tickResult.payload.goodId, tickResult.payload.quantity, tickResult.payload.marketType);
      // 转入前往卖出地状态
      var shipB = Fleet.getActiveShip(_state);
      if (shipB && shipB.route) shipB.route.status = 'traveling_sell';
      _updateUI();
      break;
    case 'sell':
      _handleTradeConfirm('sell', tickResult.payload.goodId, tickResult.payload.quantity, tickResult.payload.marketType);
      // 循环：重新前往买入地
      var shipS = Fleet.getActiveShip(_state);
      if (shipS && shipS.route) shipS.route.status = 'traveling_buy';
      _updateUI();
      break;
    // 'noop' — do nothing
  }
}

// ---------------------------------------------------------------------------
// UI 全量刷新
// ---------------------------------------------------------------------------

function _updateUI() {
  const netWorth = Trade.getNetWorth(_state);
  HUD.updateStats(_state, netWorth);
  HUD.updateCompanyName(_state);
  // 市场：根据当前模式刷新
  if (MapUI.isMarketOpen()) {
    var bmMode = _blackMarketMode ? 'black' : 'open';
    MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, MapUI.getMarketViewSystem(_state), bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
    _bindMarketModeButtons();
  }
  ShipUI.renderShipStats(_state);
  ResearchUI.render(
    _state,
    _handleStartResearch,
    _handleCancelQueuedResearch,
    _handleMoveQueuedResearchUp,
    _handleMoveQueuedResearchDown,
    _handleClearResearchQueue
  );
  FactionUI.render(_state);
  QuestUI.render(_state, _handleAcceptQuest, _handleAbandonQuest);
  AchievementUI.render(_state);
  FleetUI.render(_state, _handleBuyShip, _handleSwitchShip, _handleUpgradeShip, _handleAssignRoute, _handleCancelRoute, _handleBuySlot, _handleSellShip, _handleInstallMod, _handleUninstallMod, _handleRecruitCrew, _handleAssignCrew, _handleUnassignCrew, _handleDismissCrew);
  FleetUI.renderShop(_state, _handleBuyShip);
  SaveUI.render(_handleSaveGame, _handleLoadGame);
  Renderer3D.invalidateScene();
  MapUI.refreshPlanetDetail(_state);
  Dispatch.updateActiveDispatchUI();


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
    const mapView = MapUI.getMapView ? MapUI.getMapView() : 'planets';
    const galaxyId = MapUI.getCurrentGalaxyId ? MapUI.getCurrentGalaxyId() : 'milky_way';
    Renderer3D.render(_state, mapView, galaxyId);
    requestAnimationFrame(loop);
  }(_startTime));
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
