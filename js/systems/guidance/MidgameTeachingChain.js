// js/systems/guidance/MidgameTeachingChain.js — 中期专题教学链
//
// 目标：把科研→补给→新航线、建站→经营→批量管理、派遣→复核→优化
// 串成可追踪的专题路径，让玩家从"跟着指引做单步"升级到"理解系统间的因果关系"。
//
// 每条链由一到数个步骤组成，每个步骤对应一条已有的 guidance suggestion id。
// 当玩家进入某条链后，链内步骤会自动提权，直到整条链完成。
// 完成后记录到 state.midgameChains，不再重复弹出。

import { MIDGAME_CHAIN_STATE_DEFAULTS } from '../../data/constants.js';
import { getCompanyAccessState } from '../../data/companyAccess.js';

const FIRST_TRADE_QUEST_ID = 'starter_first_trade';

function _getCompletedResearchCount(state) {
  return state && Array.isArray(state.researchedTechs) ? state.researchedTechs.length : 0;
}

function _getTotalDispatchCycles(state) {
  return (state && Array.isArray(state.fleet) ? state.fleet : []).reduce(function (total, ship) {
    var cycles = ship && ship.operatingStats ? Number(ship.operatingStats.tradeCycles) : 0;
    return total + (Number.isFinite(cycles) ? Math.max(0, Math.floor(cycles)) : 0);
  }, 0);
}

function _hasCompletedQuest(state, questId) {
  return !!(state && Array.isArray(state.completedQuests) && state.completedQuests.indexOf(questId) !== -1);
}

// ---------------------------------------------------------------------------
// 链定义
// ---------------------------------------------------------------------------

export const TEACHING_CHAINS = Object.freeze({
  researchSupply: {
    id: 'research-supply',
    title: '科研经济',
    label: '科研 → 补给 → 新航线',
    description: '开启第一项研究，学会用派遣船只为科研持续补给，解锁新航线或价格优惠。',
    unlockCondition: function (state) {
      return !!(
        state &&
        ((state.currentResearch && state.currentResearch.techId) || _getCompletedResearchCount(state) > 0)
      );
    },
    steps: [
      'prefill-research-supply-dispatch',
    ],
    completionCondition: function (state) {
      return _getCompletedResearchCount(state) >= 2;
    },
    completionMessage: '🎓 你已掌握科研经济：启动研究 → 派遣补给 → 享受成果。新科技会持续解锁更优航线与价格优势。',
  },

  dispatchOps: {
    id: 'dispatch-ops',
    title: '自动跑商入门',
    label: '派遣 → 复核 → 优化',
    description: '配置第一条自动跑商路线，学会查看经营账本，理解货物毛利和实际盈亏的区别。',
    unlockCondition: function (state) {
      return !!(
        state &&
        Array.isArray(state.fleet) &&
        state.fleet.length > 0 &&
        _hasCompletedQuest(state, FIRST_TRADE_QUEST_ID)
      );
    },
    steps: [
      'prefill-profitable-dispatch',
    ],
    completionCondition: function (state, record) {
      var baseline = record && Number.isFinite(Number(record.baselineValue))
        ? Number(record.baselineValue)
        : 0;
      return _getTotalDispatchCycles(state) >= baseline + 3;
    },
    completionMessage: '📦 自动跑商已就绪：选择价差路线 → 派遣舰船 → 定期复核盈亏。后续可在机库查看每条路线的经营明细。',
  },

  tradeStationBasics: {
    id: 'trade-station-basics',
    title: '贸易站经营',
    label: '建站 → 经营 → 批量',
    description: '建设第一座贸易站，选择经营方式，理解每天预计回报与回本周期。',
    unlockCondition: function (state) {
      if (!state) return false;
      var access = getCompanyAccessState(state, 'tradeStationBuild');
      return !!(access && access.unlocked);
    },
    steps: [
      'build-trade-station',
      'upgrade-trade-station',
    ],
    completionCondition: function (state) {
      if (!state || !state.tradeStations || typeof state.tradeStations !== 'object') return false;
      return Object.keys(state.tradeStations).some(function (id) {
        var s = state.tradeStations[id];
        return s && (s.level || 0) >= 2;
      });
    },
    completionMessage: '🏗️ 贸易站经营已上手：选点建站 → 升级扩容 → 按行情选择经营方式。中后期可在商网总览批量管理多座站点。',
  },

  capitalRisk: {
    id: 'capital-risk',
    title: '资金管理',
    label: '贷款 → 还款 → 信用',
    description: '了解贷款机制：何时该借、如何还款、信用评级的影响。',
    unlockCondition: function (state) {
      if (!state) return false;
      var access = getCompanyAccessState(state, 'capitalLocal');
      var hasActiveLoan = Array.isArray(state.loans) && state.loans.some(function (loan) {
        return loan && loan.status === 'active' && Number(loan.balance || 0) > 0;
      });
      return !!(access && access.unlocked && hasActiveLoan);
    },
    steps: [
      'review-loan-obligation',
    ],
    completionCondition: function (state) {
      var loans = state && Array.isArray(state.loans) ? state.loans : [];
      var hasEverLoaned = loans.length > 0;
      var allClear = loans.every(function (l) {
        return !l || l.status === 'paid' || l.status === 'repaid' || (l.balance || 0) <= 0;
      });
      return hasEverLoaned && allClear;
    },
    completionMessage: '💰 资金管理已理解：贷款是杠杆而非必需——借得到、还得清、信用好，才是健康的资本策略。',
  },
});

// ---------------------------------------------------------------------------
// 状态管理
// ---------------------------------------------------------------------------

function _getDefaultRecord(chainId) {
  var defaults = MIDGAME_CHAIN_STATE_DEFAULTS && MIDGAME_CHAIN_STATE_DEFAULTS[chainId];
  if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) return defaults;
  return {
    active: false,
    completed: false,
    completedSteps: [],
    startedDay: null,
    baselineValue: null,
  };
}

function _createRecord(chainId) {
  var defaults = _getDefaultRecord(chainId);
  return Object.assign({}, defaults, {
    completedSteps: Array.isArray(defaults.completedSteps)
      ? defaults.completedSteps.slice()
      : [],
  });
}

function _normalizeRecord(chainId, record) {
  var defaults = _getDefaultRecord(chainId);
  var normalized = record && typeof record === 'object' && !Array.isArray(record)
    ? record
    : _createRecord(chainId);
  normalized.active = !!normalized.active;
  normalized.completed = !!normalized.completed;
  normalized.completedSteps = Array.isArray(normalized.completedSteps)
    ? normalized.completedSteps.filter(function (stepId) { return typeof stepId === 'string'; })
    : [];
  normalized.startedDay = normalized.startedDay != null && Number.isFinite(Number(normalized.startedDay))
    ? Math.max(1, Math.floor(Number(normalized.startedDay)))
    : defaults.startedDay;
  normalized.baselineValue = normalized.baselineValue != null && Number.isFinite(Number(normalized.baselineValue))
    ? Math.max(0, Number(normalized.baselineValue))
    : defaults.baselineValue;
  if (normalized.completed && normalized.active) normalized.active = false;
  return normalized;
}

export function init(state) {
  if (!state || typeof state !== 'object') return;
  if (!state.midgameChains || typeof state.midgameChains !== 'object' || Array.isArray(state.midgameChains)) {
    state.midgameChains = {};
  }
  Object.keys(TEACHING_CHAINS).forEach(function (key) {
    var chain = TEACHING_CHAINS[key];
    var chainId = chain.id;
    state.midgameChains[chainId] = _normalizeRecord(chainId, state.midgameChains[chainId]);
  });
}

// ---------------------------------------------------------------------------
// 内部辅助：chain id → chain 对象查找
// ---------------------------------------------------------------------------

var _chainById = null;
function _getChainById() {
  if (!_chainById) {
    _chainById = {};
    Object.keys(TEACHING_CHAINS).forEach(function (key) {
      var chain = TEACHING_CHAINS[key];
      _chainById[chain.id] = chain;
    });
  }
  return _chainById;
}

function _getChain(chainId) {
  return _getChainById()[chainId] || null;
}

function _hasAnyActiveChain(state) {
  if (!state || !state.midgameChains) return false;
  return Object.keys(state.midgameChains).some(function (chainId) {
    var record = state.midgameChains[chainId];
    return !!(record && record.active && !record.completed);
  });
}

function _areAllStepsDone(chain, record) {
  if (!chain || !record || !Array.isArray(record.completedSteps)) return false;
  return chain.steps.every(function (stepId) {
    return record.completedSteps.indexOf(stepId) !== -1;
  });
}

// ---------------------------------------------------------------------------
// 查询 API
// ---------------------------------------------------------------------------

/** 返回所有已解锁但尚未完成的链 */
export function getAvailableChains(state) {
  if (!state || !state.midgameChains) return [];
  if (_hasAnyActiveChain(state)) return [];
  var chains = _getChainById();
  return Object.keys(chains).filter(function (chainId) {
    var chain = chains[chainId];
    var record = state.midgameChains[chainId];
    if (!record || record.completed) return false;
    if (record.active) return false;
    return chain.unlockCondition(state);
  }).map(function (chainId) {
    return chains[chainId];
  });
}

/** 返回当前活跃的链，或 null */
export function getActiveChain(state) {
  if (!state || !state.midgameChains) return null;
  var activeId = Object.keys(state.midgameChains).find(function (chainId) {
    var record = state.midgameChains[chainId];
    return record && record.active && !record.completed;
  });
  if (!activeId) return null;
  var chain = _getChain(activeId);
  if (!chain) return null;
  var record = state.midgameChains[activeId];
  return {
    chain: chain,
    record: record,
    remainingSteps: chain.steps.filter(function (stepId) {
      return record.completedSteps.indexOf(stepId) === -1;
    }),
  };
}

/** 启动一条教学链 */
export function startChain(state, chainId) {
  if (!state || !state.midgameChains) return false;
  var chain = _getChain(chainId);
  var record = state.midgameChains[chainId];
  if (!chain || !record || record.completed || record.active) return false;
  if (!chain.unlockCondition(state) || _hasAnyActiveChain(state)) return false;
  record.active = true;
  record.startedDay = state.day || 1;
  record.baselineValue = chainId === 'dispatch-ops'
    ? _getTotalDispatchCycles(state)
    : _getDefaultRecord(chainId).baselineValue;
  return true;
}

/** 标记链内某步骤已完成，并检查整条链是否完成 */
export function completeChainStep(state, chainId, stepId) {
  if (!state || !state.midgameChains) return null;
  var record = state.midgameChains[chainId];
  if (!record || !record.active) return null;
  var chain = _getChain(chainId);
  if (!chain || chain.steps.indexOf(stepId) === -1) return null;
  if (record.completedSteps.indexOf(stepId) === -1) {
    record.completedSteps.push(stepId);
  }
  if (_areAllStepsDone(chain, record) && chain.completionCondition(state, record)) {
    record.active = false;
    record.completed = true;
    return {
      completed: true,
      chainId: chainId,
      message: chain.completionMessage,
    };
  }
  return { completed: false, chainId: chainId };
}

/** 检查活跃链是否已满足完成条件（用于非步骤触发的自然完成） */
export function checkChainCompletion(state) {
  if (!state || !state.midgameChains) return [];
  var completed = [];
  Object.keys(state.midgameChains).forEach(function (chainId) {
    var record = state.midgameChains[chainId];
    if (!record || !record.active || record.completed) return;
    var chain = _getChain(chainId);
    if (chain && _areAllStepsDone(chain, record) && chain.completionCondition(state, record)) {
      record.active = false;
      record.completed = true;
      completed.push({
        chainId: chainId,
        message: chain.completionMessage,
      });
    }
  });
  return completed;
}

/** 获取某条链中当前应优先的建议 ID 列表 */
export function getChainPrioritySuggestions(state) {
  var active = getActiveChain(state);
  if (!active) return [];
  return active.remainingSteps;
}

/** 检查某个 suggestion id 是否属于活跃链的下一步 */
export function isChainNextStep(state, suggestionId) {
  var active = getActiveChain(state);
  if (!active) return false;
  return active.remainingSteps.indexOf(suggestionId) === 0;
}

/** 检查某个 suggestion id 是否属于活跃链内 */
export function isInActiveChain(state, suggestionId) {
  var active = getActiveChain(state);
  if (!active) return false;
  return active.remainingSteps.indexOf(suggestionId) !== -1;
}

/** 返回教学链汇总，供 UI 展示 */
export function getChainSummary(state) {
  if (!state || !state.midgameChains) return { available: [], active: null, completed: [] };
  return {
    available: getAvailableChains(state),
    active: getActiveChain(state),
    completed: Object.keys(state.midgameChains).filter(function (id) {
      return state.midgameChains[id] && state.midgameChains[id].completed;
    }).map(function (id) {
      return _getChain(id);
    }).filter(Boolean),
  };
}
