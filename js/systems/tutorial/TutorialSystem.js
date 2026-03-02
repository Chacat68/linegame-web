// js/systems/tutorial/TutorialSystem.js — 新手引导状态机
// 依赖：core/EventBus.js
// 导出：init, getStep, advance, skip, isActive, checkTrigger, STEPS

import * as EventBus from '../../core/EventBus.js';

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
  // ==================== 阶段 1: 星际初航 ====================
  {
    id: 'welcome',
    phase: 1,
    title: '欢迎来到银河系',
    content: '银河历 3045 年，你意外继承了一家名为「星际信使贸易公司」的星际贸易公司，\n随同而来的还有一艘老旧货船——"星际信使 I 号"。\n\n你的目标：通过星际贸易积累财富，重振并扩张属于你的商业帝国！',
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
    title: '了解你的状态',
    content: '上方显示你的 【信用积分】（你的钱）、【净资产】 和 【银河历天数】。\n你现在有 1,000 信用积分，足够开始第一笔交易了。',
    highlight: '#player-stats',
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
    title: '你的飞船',
    content: '这里显示飞船的 【货舱】、【燃料】 和 【船体】 状态。\n货舱用来装货物，燃料在星际旅行时消耗，船体就是飞船耐久。',
    highlight: '#ship-mini',
    position: 'left',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },
  {
    id: 'show_map',
    phase: 1,
    title: '星际地图',
    content: '左边的星图显示了银河系中你可以前往的星球。\n不同颜色代表不同类型——农业、科技、矿业等。\n每种星球的商品价格差异很大，这就是你赚钱的关键！',
    highlight: '#map-section',
    position: 'right',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },

  // ==================== 阶段 2: 第一桶金 ====================
  {
    id: 'explain_market',
    phase: 2,
    title: '认识市场',
    content: '现在来学习赚钱！点击地图上方的 【🏪 市场】 按钮打开市场面板。\n你现在在 太阳主星（农业星球），注意看——食物和水资源价格很低（绿色数字），这就是买入的好时机！',
    highlight: '#market-view-btn',
    position: 'left',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: true,
  },
  {
    id: 'buy_goods',
    phase: 2,
    title: '买入商品',
    content: '点击食物那一行的 【买入】 按钮，在弹窗中调整数量，然后确认购买。\n尽量多买一些！记住贸易的黄金法则：低买高卖！',
    highlight: '#market-tbody',
    position: 'left',
    trigger: 'action:buy',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: true,
  },
  {
    id: 'travel_hint',
    phase: 2,
    title: '出发去卖货！',
    content: '太好了！货舱里装满了便宜的货物。\n现在在左边的星图上点击另一个星球（比如 【新北京站】 或 【战争前线】），到那里高价卖出！\n\n💡 提示：悬停在星球上可以看到燃料消耗。',
    highlight: '#map-canvas',
    position: 'right',
    trigger: 'action:travel',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: true,
  },
  {
    id: 'sell_goods',
    phase: 2,
    title: '卖出商品',
    content: '你到达了新的星球！点击市场中你货舱里商品的 【卖出】 按钮，赚取利润！\n注意观察价格差异——这就是你的利润来源。',
    highlight: '#market-tbody',
    position: 'left',
    trigger: 'action:sell',
    npcName: '新星球管理员',
    npcIcon: '🧑‍💼',
    reward: { credits: 200, msg: '🎁 首次交易奖励：+200 信用积分！' },
    canSkip: true,
  },

  // ==================== 阶段 3: 自由探索 ====================
  {
    id: 'show_tabs',
    phase: 3,
    title: '更多功能',
    content: '恭喜完成第一笔交易！游戏还有更多系统等你探索：\n📦 货舱 - 管理你的货物\n⚙️ 升级 - 强化飞船\n🔬 科技 - 研究新技术\n🏛️ 派系 - 外交关系\n📋 任务 - 接取任务赚奖励',
    highlight: '.tabs',
    position: 'left',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },
  {
    id: 'fuel_warning',
    phase: 3,
    title: '燃料管理',
    content: '每次星际旅行都消耗燃料。当燃料不足时，要在市场底部点击 【补充燃料】。\n⚠️ 燃料耗尽就无法旅行了！注意保持充足的燃料储备。',
    highlight: '#fuel-fill',
    position: 'left',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: null,
    canSkip: false,
  },
  {
    id: 'tutorial_complete',
    phase: 3,
    title: '教程完成！',
    content: '你已经掌握了星际贸易的基础！\n\n💡 赚钱秘诀：\n  · 在生产星球低价买入，到需求星球高价卖出\n  · 关注市场的 🔥（高需求）和 📦（高供给）标识\n  · 规划好航线，节省燃料\n\n目标：积累 50,000 信用积分，重振商业帝国！\n\n接下来，是时候为你继承的公司起一个新名字了……🚀',
    highlight: null,
    position: 'center',
    trigger: 'manual',
    npcName: '港口管理员 汤姆',
    npcIcon: '👨‍✈️',
    reward: { credits: 500, msg: '🎁 教程完成奖励：+500 信用积分！' },
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

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function init(state) {
  _stateRef = state;
  _currentIndex = 0;
  _active = false;
  _completed = false;

  // 检查 localStorage —— 老玩家跳过
  if (localStorage.getItem('tutorial_completed') === '1') {
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
  EventBus.emit('tutorial:step', { step: STEPS[_currentIndex], index: _currentIndex, total: STEPS.length });
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

  const current = STEPS[_currentIndex];

  // 发放本步骤奖励
  if (current.reward && _stateRef) {
    if (current.reward.credits) {
      _stateRef.credits += current.reward.credits;
    }
    if (current.reward.msg) {
      EventBus.emit('log:message', { text: current.reward.msg, type: 'upgrade' });
    }
  }

  _currentIndex++;

  if (_currentIndex >= STEPS.length) {
    _complete();
    return;
  }

  EventBus.emit('tutorial:step', { step: STEPS[_currentIndex], index: _currentIndex, total: STEPS.length });
}

/**
 * 检查是否触发了当前教程步骤（由 GameManager 在各种动作后调用）
 * @param {string} action  触发动作 'buy' | 'sell' | 'travel' | 'click:tab-xxx'
 */
export function checkTrigger(action) {
  if (!_active || _completed) return;

  const current = STEPS[_currentIndex];
  if (!current) return;

  if (current.trigger === 'action:' + action) {
    advance();
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
  localStorage.removeItem('tutorial_completed');
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

function _complete() {
  _active = false;
  _completed = true;
  localStorage.setItem('tutorial_completed', '1');
  EventBus.emit('tutorial:complete', {});
  EventBus.emit('log:message', { text: '📖 新手教程已完成！你可以在重新开始游戏时再次体验教程。', type: 'info' });
}
