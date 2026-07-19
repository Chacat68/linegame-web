// js/systems/tutorial/TutorialSystem.js — 新手引导状态机
// 依赖：core/EventBus.js
// 导出：init, getStep, advance, skip, isActive, checkTrigger, STEPS

import * as EventBus from '../../core/EventBus.js';
import { TUTORIAL_CONFIG } from '../../data/constants.js';

// ---------------------------------------------------------------------------
// 教程步骤定义
// ---------------------------------------------------------------------------

/**
 * 每一步包含：
 * - id          : string      唯一标识
 * - phase       : number      所属阶段 (1-3)
 * - title       : string      步骤标题
 * - content     : string      引导说明
 * - highlight   : string|null CSS 选择器，需高亮的 UI 元素
 * - position    : string      提示框位置 'top'|'bottom'|'left'|'right'|'center'
 * - trigger     : string      自动推进的触发事件 ('click:xxx' / 'action:xxx' / 'manual')
 * - npcName     : string      NPC 名称
 * - npcIcon     : string      NPC 图标
 * - reward      : object|null 完成本步骤后的奖励 { credits?, exp?, msg? }
 * - canSkip     : boolean     是否允许在此步跳过
 */
export const STEPS = [
  // ==================== 阶段 1: 起步校准 ====================
  {
    id: 'welcome',
    phase: 1,
    title: '接入贸易主循环',
    content: '银河历 3045 年，你接管了一条濒临停摆的深空贸易航线。\n\n这段教程只做三件事：看清资金与货舱、完成一次买入-航行-卖出、知道后续该看哪里继续推进。',
    highlight: null,
    position: 'center',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: true,
  },
  {
    id: 'show_stats',
    phase: 1,
    title: '先看资金和位置',
    content: '顶部状态栏是每次决策前的仪表盘：信用积分决定能买多少货，当前位置决定当前市场价格，银河历天数会影响任务和事件节奏。\n\n开局资金足够试跑一轮低买高卖。',
    highlight: '#game-header',
    position: 'bottom',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },
  {
    id: 'show_ship',
    phase: 1,
    title: '确认货舱和燃料',
    content: '顶部资源仪表会持续显示飞船还能跑多远、还能装多少货。\n\n货舱决定交易规模，燃料决定能否起航；这两个数不够时，先别急着开下一段路线。',
    highlight: '#status-bar',
    position: 'top',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },

  // ==================== 阶段 2: 第一轮交易 ====================
  {
    id: 'explain_market',
    phase: 2,
    title: '打开市场终端',
    content: '点击底部导航的【市场】进入市场中心。\n\n先看商品价格和货舱余量：价格偏低时适合买入，货舱越空，能买的货物越多。',
    highlight: '.bottom-nav-btn[data-view="market"]',
    position: 'top',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: true,
  },
  {
    id: 'buy_goods',
    phase: 2,
    title: '买入低价货',
    content: '在【买卖货物】里选择一个价格偏低的商品，点击【买入】，核对系统建议的数量后确认。\n\n第一单建议只装半舱，既能看清利润，也会留出调整空间。',
    highlight: '#market-spot-pane',
    position: 'left',
    trigger: 'action:buy',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    helperAction: {
      id: 'recommend_first_trade',
      label: '推荐首单商品',
    },
    canSkip: true,
  },
  {
    id: 'travel_hint',
    phase: 2,
    title: '找一个卖货点',
    content: '货舱里有货后，回到星图，选择一个该商品价格更高的星球起航。\n\n星球详情会告诉你燃料是否足够、预计航程和能否出发；路线判断比盲目跳跃更重要。',
    highlight: '#map-3d-canvas',
    position: 'right',
    trigger: 'action:travel',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    helperAction: {
      id: 'recommend_sell_route',
      label: '推荐一个卖货点',
    },
    canSkip: true,
  },
  {
    id: 'sell_goods',
    phase: 2,
    title: '卖出并结算利润',
    content: '抵达后重新打开市场，找到货舱里已有的商品并点击【卖出】。\n\n完成卖出后，资金、货舱和利润会一起更新；这就是后续经营的基本节奏。',
    highlight: '#market-spot-pane',
    position: 'left',
    trigger: 'action:sell',
    npcName: '新星球管理员',
    npcIcon: '🧑‍💼',
    reward: null,
    canSkip: true,
  },

  // ==================== 阶段 3: 行动接管 ====================
  {
    id: 'fuel_safety',
    phase: 3,
    title: '燃料是安全线',
    content: '每次航行都会消耗燃料。燃料偏低时，市场终端会提供【补充燃料】操作；底部状态条会持续显示当前油量。\n\n把燃料当作安全线：能赚钱的路线，也要先能飞得到。',
    highlight: '#status-fuel-fill',
    position: 'left',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },
  {
    id: 'action_guide_handoff',
    phase: 3,
    title: '后续看当前行动',
    content: '教程到这里不再强制你点开所有系统。\n\n退出教程后，底部【当前行动】会接管下一步：先登记并结算刚完成的首轮交易，再根据货舱、燃料、任务和探索状态刷新建议。\n\n档案、机库、科技、派系和公司成长都会在需要时进入这条行动链。',
    highlight: null,
    position: 'center',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },
  {
    id: 'tutorial_complete',
    phase: 3,
    title: '接入完成',
    content: '你已经跑通了第一轮贸易：看状态、买低价货、选择卖货点、抵达后卖出。\n\n接下来按底部当前行动推进：接任务、补燃料、继续贸易、开始探索，都会统一从那里给出下一步。\n\n退出教程后会到账 100 信用积分启动补贴；贸易利润仍以卖出结算为准。目标不变：积累 50,000 信用积分，重振你的商业帝国。',
    highlight: null,
    position: 'center',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: { credits: 100, msg: '🎁 接入训练启动补贴：+100 信用积分！' },
    canSkip: false,
  },
];

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

let _currentIndex = 0;
let _active       = false;
let _completed    = false;  // 教程已全部完成
let _stateRef     = null;   // 对游戏状态的引用
let _pendingActions = Object.create(null);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function init(state) {
  _stateRef = state;
  _currentIndex = 0;
  _active = false;
  _completed = false;
  _pendingActions = Object.create(null);

  // 检查 localStorage —— 老玩家跳过
  if (localStorage.getItem(TUTORIAL_CONFIG.completionStorageKey) === '1') {
    _completed = true;
    return;
  }
}

/** 是否正在进行教程 */
export function isActive() {
  return _active && !_completed;
}

/** 教程是否已完成 */
export function isCompleted() {
  return _completed;
}

/** 开始教程 */
export function start() {
  if (_completed) return;
  _currentIndex = 0;
  _active = true;
  _pendingActions = Object.create(null);
  _showCurrentStep();
}

/** 获取当前步骤 */
export function getStep() {
  if (!_active || _completed) return null;
  return STEPS[_currentIndex] || null;
}

/** 获取当前步骤索引 */
export function getStepIndex() {
  return _currentIndex;
}

/** 获取总步骤数 */
export function getTotalSteps() {
  return STEPS.length;
}

/**
 * 推进到下一步（手动点击"下一步"时调用）
 */
export function advance() {
  if (!_active || _completed) return;
  _finishCurrentStep();
  _showCurrentStep();
}

/**
 * 检查是否触发了当前教程步骤（由 GameManager 在各种动作后调用）
 * @param {string} action  触发动作 'buy' | 'sell' | 'travel' | 'accept_quest' | 'complete_quest' | 'click:tab-xxx'
 */
export function checkTrigger(action) {
  if (!_active || _completed || !action) return;

  _pendingActions[action] = true;

  const current = STEPS[_currentIndex];
  if (!current) return;

  if (_getActionTrigger(current) === action) {
    _showCurrentStep();
  }
}

/**
 * 检查 tab 点击触发
 * @param {string} tabId  标签 ID，如 'tab-market'
 */
export function checkTabClick(tabId) {
  if (!_active || _completed) return;

  const current = STEPS[_currentIndex];
  if (!current) return;

  if (current.trigger === 'click:' + tabId) {
    advance();
  }
}

/** 跳过整个教程 */
export function skip() {
  _complete();
}

/** 重置教程（用于重新开始游戏时） */
export function reset() {
  _currentIndex = 0;
  _active = false;
  _completed = false;
  _pendingActions = Object.create(null);
  localStorage.removeItem(TUTORIAL_CONFIG.completionStorageKey);
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

function _showCurrentStep() {
  while (_active && !_completed) {
    if (_currentIndex >= STEPS.length) {
      _complete();
      return;
    }

    const current = STEPS[_currentIndex];
    const requiredAction = _getActionTrigger(current);

    if (requiredAction && _pendingActions[requiredAction]) {
      delete _pendingActions[requiredAction];
      _finishCurrentStep();
      continue;
    }

    EventBus.emit('tutorial:step', { step: current, index: _currentIndex, total: STEPS.length });
    return;
  }
}

function _finishCurrentStep() {
  const current = STEPS[_currentIndex];
  if (!current) return;

  if (current.reward && _stateRef) {
    if (current.reward.credits) {
      _stateRef.credits += current.reward.credits;
    }
    if (current.reward.msg) {
      EventBus.emit('log:message', { text: current.reward.msg, type: 'upgrade' });
    }
  }

  _currentIndex++;
}

function _getActionTrigger(step) {
  if (!step || typeof step.trigger !== 'string' || step.trigger.indexOf('action:') !== 0) {
    return '';
  }
  return step.trigger.slice('action:'.length);
}

function _complete() {
  _active = false;
  _completed = true;
  localStorage.setItem(TUTORIAL_CONFIG.completionStorageKey, '1');
  EventBus.emit('tutorial:complete', {});
  EventBus.emit('log:message', { text: '📖 新手教程已完成！你可以在重新开始游戏时再次体验教程。', type: 'info' });
}
