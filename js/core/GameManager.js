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
import * as Save       from '../systems/save/SaveSystem.js';
import * as Quest      from '../systems/quest/QuestSystem.js';
import * as Achievement from '../systems/achievement/AchievementSystem.js';
import * as Tutorial   from '../systems/tutorial/TutorialSystem.js';
import * as TutorialUI from '../ui/TutorialUI.js';
import { INITIAL_STATE, VICTORY_NET_WORTH } from '../data/constants.js';
import { getLevel, getRepRank, PLAYER_LEVELS } from '../data/playerLevels.js';

let _state     = null;
let _startTime = null;

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init() {
  _state = _deepClone(INITIAL_STATE);

  Economy.init();
  Faction.init(_state);
  Research.init(_state);
  Quest.init(_state);
  Achievement.init(_state);
  Renderer.init();
  HUD.init();

  // 注入回调给各 UI 模块
  MapUI.init(_state, _handleTravel);
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
    text: '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。目标：积累 ' +
          VICTORY_NET_WORTH.toLocaleString() + ' 信用积分，建立商业帝国！',
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
    // 新手引导：旅行触发
    Tutorial.checkTrigger('travel');
    // 旅行经验 + 声望
    _gainExperience(5);
    _state.reputation = (_state.reputation || 0) + 1;

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

    // 随机事件触发（群星风格）
    const event = RandomEvent.rollEvent(_state);
    if (event) {
      EventUI.showEvent(event, function (choiceIndex) {
        _handleEventChoice(choiceIndex);
      });
    }

    // 自动存档
    Save.saveGame(0, _state, { isAutosave: true });

    _updateUI();
  }
}

function _handleEventChoice(choiceIndex) {
  const result = RandomEvent.resolveChoice(_state, choiceIndex);
  _dispatch(result);
}

function _handleTradeConfirm(action, goodId, quantity) {
  const result = action === 'buy'
    ? Trade.buyGood(_state, goodId, quantity)
    : Trade.sellGood(_state, goodId, quantity);
  _dispatch(result);

  // 交易后更新派系关系
  if (result && result.ok) {
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
  const result = Save.saveGame(slotId, _state);
  EventBus.emit('log:message', { text: result.msg, type: result.ok ? 'info' : 'error' });
  _updateUI();
}

function _handleLoadGame(slotId) {
  const result = Save.loadGame(slotId);
  if (result.ok) {
    _state = result.state;
    // 重新初始化依赖状态的子系统
    Faction.init(_state);
    Research.init(_state);
    Quest.init(_state);
    Achievement.init(_state);
    Economy.init();
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
    EventBus.emit('log:message', {
      text: '🎉 升级！你现在是 ' + newLevel.icon + ' ' + newLevel.title + ' (Lv.' + newLevel.level + ')',
      type: 'upgrade',
    });
    // 应用升级奖励
    _applyLevelPerk(newLevel.level);
  }
}

function _applyLevelPerk(level) {
  switch (level) {
    case 3:  // 卖出价格 +3%
      _state.techSellBonus = (_state.techSellBonus || 0) + 0.03;
      EventBus.emit('log:message', { text: '✨ 等级奖励：卖出价格 +3%', type: 'info' });
      break;
    case 4:  // 货舱 +5
      _state.maxCargo += 5;
      EventBus.emit('log:message', { text: '✨ 等级奖励：货舱容量 +5', type: 'info' });
      break;
    case 5:  // 买入价格 -3%
      _state.techBuyDiscount = (_state.techBuyDiscount || 0) + 0.03;
      EventBus.emit('log:message', { text: '✨ 等级奖励：买入价格 -3%', type: 'info' });
      break;
    case 6:  // 燃料效率 +10%
      _state.fuelEfficiency *= 0.9;
      EventBus.emit('log:message', { text: '✨ 等级奖励：燃料效率 +10%', type: 'info' });
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
      _state.maxCargo += 10;
      EventBus.emit('log:message', { text: '✨ 等级奖励：货舱容量 +10', type: 'info' });
      break;
    case 9:  // 卖出价格 +5%
      _state.techSellBonus = (_state.techSellBonus || 0) + 0.05;
      EventBus.emit('log:message', { text: '✨ 等级奖励：卖出价格 +5%', type: 'info' });
      break;
    case 10: // 全属性提升
      _state.maxCargo += 10;
      _state.maxFuel += 20;
      _state.techBuyDiscount = (_state.techBuyDiscount || 0) + 0.05;
      _state.techSellBonus = (_state.techSellBonus || 0) + 0.05;
      EventBus.emit('log:message', { text: '✨ 银河商业帝皇加冕！全属性大幅提升！', type: 'upgrade' });
      break;
  }
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
  ResearchUI.render(_state, _handleStartResearch);
  FactionUI.render(_state);
  QuestUI.render(_state, _handleAcceptQuest, _handleAbandonQuest);
  AchievementUI.render(_state);
  SaveUI.render(_handleSaveGame, _handleLoadGame);
}

// ---------------------------------------------------------------------------
// 胜利检测
// ---------------------------------------------------------------------------

function _checkVictory() {
  if (Trade.getNetWorth(_state) >= VICTORY_NET_WORTH) {
    document.getElementById('gameover-title').textContent   = '🎉 银河商业帝国建立！';
    document.getElementById('gameover-message').textContent =
      '恭喜！您在银河历第 ' + _state.day + ' 天建立了属于自己的商业帝国！\n' +
      '最终净资产：' + Math.floor(Trade.getNetWorth(_state)).toLocaleString() + ' 信用积分\n' +
      '贸易次数：' + (_state.tradeCount || 0) + ' 次\n' +
      '已研究科技：' + (_state.researchedTechs || []).length + ' 项\n' +
      '完成任务：' + (_state.completedQuests || []).length + ' 个\n' +
      '解锁成就：' + (_state.achievements || []).length + ' 个\n' +
      '玩家等级：' + getLevel(_state.experience || 0).title;
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
