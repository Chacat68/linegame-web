// js/systems/quest/QuestSystem.js — 任务系统（按章节推进解锁）
// 依赖：data/quests.js, data/playerLevels.js, systems/faction/FactionSystem.js
// 导出：init, getAvailableQuests, getLockedQuests, getStarterRecommendations, getQuestTracker, acceptQuest, checkProgress,
//       getActiveQuests, completeQuest, getQuestPhaseProgress,
//       getCurrentQuestPhase, getCurrentQuestPhaseProgress,
//       getStoryRouteProfile, getQuestRewardSummary

import { QUESTS, QUEST_TYPES, QUEST_PHASES } from '../../data/quests.js';
import { FACTIONS }            from '../../data/factions.js';
import { getLevel }            from '../../data/playerLevels.js';
import * as Faction            from '../faction/FactionSystem.js';

const STARTER_RECOMMENDATION_ORDER = [
  'starter_first_trade',
  'starter_visit_2',
  'starter_earn_500',
  'starter_5_trades',
  'starter_deliver_medicine',
  'starter_deliver_food',
  'starter_explore_shadow',
];

const DEFAULT_TRACKER_LIMIT = 2;

const QUEST_FACTION_ID_ALIASES = {
  galactic_federation: 'federation',
  stellar_syndicate: 'syndicate',
  tech_commonwealth: 'technocracy',
};

const STORY_ROUTE_PROFILES = {
  steady: {
    id: 'steady',
    label: '稳健起步',
    rewardHint: '运输任务积分 +15%',
    recommendationOrder: [
      'starter_first_trade',
      'starter_visit_2',
      'starter_deliver_medicine',
      'starter_deliver_food',
      'starter_earn_500',
      'starter_5_trades',
      'starter_explore_shadow',
    ],
  },
  network: {
    id: 'network',
    label: '航线扩张',
    rewardHint: '探索/派系任务声望 +50%',
    recommendationOrder: [
      'starter_visit_2',
      'starter_first_trade',
      'starter_5_trades',
      'starter_earn_500',
      'starter_deliver_food',
      'starter_deliver_medicine',
      'starter_explore_shadow',
    ],
  },
  shadow: {
    id: 'shadow',
    label: '高风险探索',
    rewardHint: '探索/辛迪加任务积分 +20%',
    recommendationOrder: [
      'starter_visit_2',
      'starter_first_trade',
      'starter_explore_shadow',
      'starter_5_trades',
      'starter_earn_500',
      'starter_deliver_food',
      'starter_deliver_medicine',
    ],
  },
};

const STORY_ROUTE_QUEST_EFFECTS = {
  steady: {
    expand_deliver_tech: {
      creditsMultiplier: 1.1,
      reputationBonus: 2,
      bonusText: '稳健起步：关键运输线额外整备',
      factionShifts: [{ factionId: 'technocracy', delta: 6 }],
    },
    expand_water_crisis: {
      creditsMultiplier: 1.1,
      reputationBonus: 4,
      bonusText: '稳健起步：危机补给合同溢价',
      factionShifts: [{ factionId: 'syndicate', delta: 4 }],
    },
    rise_deliver_weapons: {
      creditsMultiplier: 1.1,
      reputationBonus: 3,
      bonusText: '稳健起步：军需运输执行加成',
      factionShifts: [{ factionId: 'syndicate', delta: 6 }],
    },
    reign_arms_race: {
      creditsMultiplier: 1.15,
      reputationBonus: 5,
      bonusText: '稳健起步：军备调度额外结算',
      factionShifts: [{ factionId: 'syndicate', delta: 8 }],
    },
    reign_medicine_tour: {
      reputationBonus: 8,
      bonusText: '稳健起步：医疗补给线口碑提升',
      factionShifts: [
        { factionId: 'technocracy', delta: 10 },
        { factionId: 'federation', delta: 4 },
      ],
    },
    legend_ultimate_delivery: {
      creditsMultiplier: 1.15,
      reputationBonus: 10,
      bonusText: '稳健起步：终极联运获得额外履约奖',
      factionShifts: [
        { factionId: 'federation', delta: 6 },
        { factionId: 'technocracy', delta: 6 },
        { factionId: 'syndicate', delta: 4 },
      ],
    },
  },
  network: {
    expand_explore_5: {
      reputationBonus: 3,
      bonusText: '航线扩张：新航线信誉扩散',
    },
    rise_fed_trade: {
      reputationBonus: 5,
      bonusText: '航线扩张：联邦合同口碑加成',
      factionShifts: [{ factionId: 'federation', delta: 10 }],
    },
    rise_tech_research: {
      reputationBonus: 6,
      bonusText: '航线扩张：共同体合作加深',
      factionShifts: [{ factionId: 'technocracy', delta: 10 }],
    },
    rise_explore_10: {
      reputationBonus: 6,
      bonusText: '航线扩张：核心星图名望提升',
    },
    reign_fed_friendship: {
      reputationBonus: 10,
      bonusText: '航线扩张：联邦关系线额外推进',
      factionShifts: [{ factionId: 'federation', delta: 12 }],
    },
    reign_tech_ally: {
      reputationBonus: 10,
      bonusText: '航线扩张：共同体关系线额外推进',
      factionShifts: [{ factionId: 'technocracy', delta: 12 }],
    },
    reign_galaxy_jump: {
      reputationBonus: 8,
      bonusText: '航线扩张：跨星系知名度提升',
    },
    legend_all_factions: {
      reputationBonus: 15,
      bonusText: '航线扩张：银河外交网络回响',
      factionShifts: [
        { factionId: 'federation', delta: 8 },
        { factionId: 'technocracy', delta: 8 },
        { factionId: 'syndicate', delta: 8 },
      ],
    },
    legend_grand_tour: {
      creditsMultiplier: 1.05,
      reputationBonus: 10,
      bonusText: '航线扩张：壮游纪录扩大品牌溢价',
    },
  },
  shadow: {
    expand_profit_1000: {
      creditsMultiplier: 1.15,
      bonusText: '高风险探索：利润目标额外抽成',
    },
    rise_profit_5000: {
      creditsMultiplier: 1.15,
      bonusText: '高风险探索：高波动利润结算加成',
    },
    rise_crystal_minerals: {
      creditsMultiplier: 1.15,
      bonusText: '高风险探索：特货线路额外收益',
    },
    rise_survival: {
      creditsMultiplier: 1.1,
      reputationBonus: 5,
      bonusText: '高风险探索：极限航行名望与红利提升',
    },
    reign_syndicate_ally: {
      reputationBonus: 10,
      bonusText: '高风险探索：辛迪加线深度绑定',
      factionShifts: [
        { factionId: 'syndicate', delta: 12 },
        { factionId: 'federation', delta: -4 },
      ],
    },
    reign_profit_20000: {
      creditsMultiplier: 1.15,
      bonusText: '高风险探索：巨额利润线追加分成',
    },
    reign_luxury_circuit: {
      creditsMultiplier: 1.1,
      bonusText: '高风险探索：奢侈品巡回风险溢价',
    },
    reign_tech_monopoly: {
      creditsMultiplier: 1.15,
      bonusText: '高风险探索：科技套利窗口扩大',
    },
    legend_profit_50000: {
      creditsMultiplier: 1.15,
      bonusText: '高风险探索：终极利润线追加分成',
    },
    legend_galaxy_master: {
      creditsMultiplier: 1.1,
      reputationBonus: 10,
      bonusText: '高风险探索：银河之主路线放大收益',
      factionShifts: [{ factionId: 'syndicate', delta: 10 }],
    },
  },
};

/**
 * 初始化任务系统
 */
export function init(state) {
  if (!state.quests)          state.quests          = [];
  if (!state.completedQuests) state.completedQuests = [];
  if (!state.questPhase) {
    state.questPhase = _inferCurrentQuestPhase(state);
  } else {
    state.questPhase = Math.max(1, Math.min(QUEST_PHASES.length, state.questPhase));
  }
  _syncQuestPhase(state);
}

function _inferCurrentQuestPhase(state) {
  var completedIds = state.completedQuests || [];
  var inferred = 1;

  for (var i = 1; i <= QUEST_PHASES.length; i++) {
    var phaseQuests = QUESTS.filter(function (q) { return (q.phase || 1) === i; });
    if (phaseQuests.length === 0) {
      if (i < QUEST_PHASES.length) inferred = i + 1;
      continue;
    }

    var doneAll = phaseQuests.every(function (q) { return completedIds.includes(q.id); });
    if (doneAll && i < QUEST_PHASES.length) {
      inferred = i + 1;
      continue;
    }
    break;
  }

  var highestActive = 0;
  (state.quests || []).forEach(function (q) {
    highestActive = Math.max(highestActive, q.phase || 1);
  });

  return Math.max(inferred, highestActive, 1);
}

function _syncQuestPhase(state) {
  var current = state.questPhase || 1;
  while (current < QUEST_PHASES.length) {
    var phaseQuests = QUESTS.filter(function (q) { return (q.phase || 1) === current; });
    if (phaseQuests.length === 0) {
      current += 1;
      continue;
    }
    var doneAll = phaseQuests.every(function (q) {
      return (state.completedQuests || []).includes(q.id);
    });
    if (!doneAll) break;
    current += 1;
  }
  state.questPhase = Math.max(1, Math.min(QUEST_PHASES.length, current));
}

function _isQuestDone(quest) {
  if (!quest || !quest.objectives || quest.objectives.length === 0) return false;
  return quest.objectives.every(function (obj) {
    return (obj.current || 0) >= (obj.amount || 1);
  });
}

export function getCurrentQuestPhase(state) {
  if (!state.questPhase) {
    state.questPhase = _inferCurrentQuestPhase(state);
  }
  return state.questPhase;
}

export function getCurrentQuestPhaseProgress(state) {
  var current = getCurrentQuestPhase(state);
  var phase = QUEST_PHASES[current - 1];
  var completedIds = state.completedQuests || [];
  var quests = QUESTS.filter(function (q) { return (q.phase || 1) === current; });
  var completed = quests.filter(function (q) { return completedIds.includes(q.id); }).length;
  return {
    currentPhase: current,
    phase: phase,
    total: quests.length,
    completed: completed,
    percent: quests.length > 0 ? Math.round(completed / quests.length * 100) : 100,
    isFinalPhase: current === QUEST_PHASES.length,
  };
}

/**
 * 检查单个任务是否满足所有解锁条件
 * @returns {{ unlocked: boolean, reasons: string[] }}
 */
function _checkUnlockConditions(quest, state) {
  const reasons = [];
  const playerLvl = getLevel(state.experience || 0).level;

  // 等级检查
  if (quest.minLevel > playerLvl) {
    reasons.push('需要等级 ' + quest.minLevel + '（当前 ' + playerLvl + '）');
  }

  // 前置任务检查
  if (quest.prerequisites && quest.prerequisites.length > 0) {
    const completedIds = state.completedQuests || [];
    const missing = quest.prerequisites.filter(function (preId) {
      return !completedIds.includes(preId);
    });
    if (missing.length > 0) {
      missing.forEach(function (preId) {
        var preQuest = QUESTS.find(function (q) { return q.id === preId; });
        var preName = preQuest ? preQuest.name : preId;
        reasons.push('需完成前置任务「' + preName + '」');
      });
    }
  }

  // 额外解锁条件
  var cond = quest.unlockConditions || {};

  if (cond.minTradeCount && (state.tradeCount || 0) < cond.minTradeCount) {
    reasons.push('需完成 ' + cond.minTradeCount + ' 次交易（当前 ' + (state.tradeCount || 0) + '）');
  }

  if (cond.minVisitedSystems && (state.visitedSystems || []).length < cond.minVisitedSystems) {
    reasons.push('需访问 ' + cond.minVisitedSystems + ' 个星球（当前 ' + (state.visitedSystems || []).length + '）');
  }

  if (cond.minReputation && (state.reputation || 0) < cond.minReputation) {
    reasons.push('需声望 ' + cond.minReputation + '（当前 ' + (state.reputation || 0) + '）');
  }

  if (cond.minTotalProfit && (state.totalProfit || 0) < cond.minTotalProfit) {
    reasons.push('需累计利润 ' + cond.minTotalProfit + '（当前 ' + (state.totalProfit || 0) + '）');
  }

  if (cond.requiredFactionRelation) {
    var requiredFactionId = _normalizeFactionId(cond.requiredFactionRelation.factionId);
    var rel = Faction.getRelation
      ? Faction.getRelation(state, requiredFactionId)
      : 0;
    if (rel < cond.requiredFactionRelation.minRelation) {
      reasons.push('需提升派系关系至 ' + cond.requiredFactionRelation.minRelation);
    }
  }

  return { unlocked: reasons.length === 0, reasons: reasons };
}

/**
 * 获取当前可接取的任务列表（已解锁，排除已完成和进行中的）
 */
export function getAvailableQuests(state) {
  var currentPhase = getCurrentQuestPhase(state);
  var activeIds   = state.quests.map(function (q) { return q.id; });
  var completedIds = state.completedQuests || [];

  return QUESTS.filter(function (quest) {
    if ((quest.phase || 1) !== currentPhase) return false;
    if (activeIds.includes(quest.id))    return false;
    if (completedIds.includes(quest.id)) return false;

    var result = _checkUnlockConditions(quest, state);
    return result.unlocked;
  });
}

/**
 * 获取尚未解锁但可见的任务（已锁定，展示解锁条件）
 * 只展示下一阶段或当前阶段中未解锁的任务，避免剧透过多
 */
export function getLockedQuests(state) {
  var currentPhase = getCurrentQuestPhase(state);
  var activeIds   = state.quests.map(function (q) { return q.id; });
  var completedIds = state.completedQuests || [];

  return QUESTS.filter(function (quest) {
    if (activeIds.includes(quest.id))    return false;
    if (completedIds.includes(quest.id)) return false;
    if ((quest.phase || 1) !== currentPhase) return false;

    var result = _checkUnlockConditions(quest, state);
    return !result.unlocked;
  }).map(function (quest) {
    var result = _checkUnlockConditions(quest, state);
    return {
      id: quest.id,
      name: quest.name,
      type: quest.type,
      phase: quest.phase || 1,
      description: quest.description,
      rewards: quest.rewards,
      timeLimit: quest.timeLimit,
      lockReasons: result.reasons,
    };
  });
}

export function getStarterRecommendations(state, limit) {
  var maxCount = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 3;
  var available = getAvailableQuests(state);
  var byId = Object.create(null);
  var picked = [];
  var routeProfile = getStoryRouteProfile(state);
  var recommendationOrder = routeProfile && Array.isArray(routeProfile.recommendationOrder)
    ? routeProfile.recommendationOrder
    : STARTER_RECOMMENDATION_ORDER;

  available.forEach(function (quest) {
    byId[quest.id] = quest;
  });

  recommendationOrder.forEach(function (questId) {
    if (picked.length >= maxCount) return;
    if (byId[questId]) picked.push(byId[questId]);
  });

  if (picked.length < maxCount) {
    available.forEach(function (quest) {
      if (picked.length >= maxCount) return;
      if (!picked.some(function (item) { return item.id === quest.id; })) {
        picked.push(quest);
      }
    });
  }

  return picked;
}

export function getStoryRouteProfile(state) {
  var decision = _getTutorialRouteDecision(state);
  var profile = decision ? STORY_ROUTE_PROFILES[decision] : null;
  if (!profile) return null;

  return {
    id: profile.id,
    label: profile.label,
    rewardHint: profile.rewardHint,
    recommendationOrder: profile.recommendationOrder.slice(),
  };
}

export function getQuestRewardSummary(state, quest) {
  var baseRewards = quest && quest.rewards ? quest.rewards : {};
  var summary = {
    credits: baseRewards.credits || 0,
    exp: baseRewards.exp || 0,
    reputation: baseRewards.reputation || 0,
    hasDecisionBonus: false,
    routeLabel: null,
    bonusText: '',
  };
  var profile = getStoryRouteProfile(state);
  var bonusTexts = [];
  var routeQuestEffect = profile && quest ? _getRouteQuestEffect(profile.id, quest.id) : null;

  if (!profile || !quest) return summary;

  summary.routeLabel = profile.label;

  if (profile.id === 'steady' && quest.type === 'delivery' && summary.credits > 0) {
    summary.credits = Math.round(summary.credits * 1.15);
    if (summary.credits !== (baseRewards.credits || 0)) {
      bonusTexts.push('稳健起步：运输任务积分 +15%');
    }
  }

  if (profile.id === 'network' && (quest.type === 'explore' || quest.type === 'faction') && summary.reputation > 0) {
    summary.reputation = Math.max(summary.reputation + 1, Math.round(summary.reputation * 1.5));
    if (summary.reputation !== (baseRewards.reputation || 0)) {
      bonusTexts.push('航线扩张：探索/派系任务声望 +50%');
    }
  }

  if (profile.id === 'shadow' && summary.credits > 0 && (quest.type === 'explore' || _questTouchesFaction(quest, 'syndicate'))) {
    summary.credits = Math.round(summary.credits * 1.2);
    if (summary.credits !== (baseRewards.credits || 0)) {
      bonusTexts.push('高风险探索：探索/辛迪加任务积分 +20%');
    }
  }

  if (routeQuestEffect) {
    if (routeQuestEffect.creditsMultiplier && summary.credits > 0) {
      summary.credits = Math.round(summary.credits * routeQuestEffect.creditsMultiplier);
    }
    if (routeQuestEffect.reputationBonus) {
      summary.reputation += routeQuestEffect.reputationBonus;
    }
    if (routeQuestEffect.reputationMultiplier && summary.reputation > 0) {
      summary.reputation = Math.round(summary.reputation * routeQuestEffect.reputationMultiplier);
    }
    if (routeQuestEffect.bonusText) {
      bonusTexts.push(routeQuestEffect.bonusText);
    }
  }

  summary.hasDecisionBonus = bonusTexts.length > 0;
  summary.bonusText = bonusTexts.join('；');
  return summary;
}

export function getQuestTracker(state, limit) {
  var maxCount = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : DEFAULT_TRACKER_LIMIT;
  var active = getActiveQuests(state).slice().sort(function (left, right) {
    return _compareTrackedQuestPriority(left, right, state);
  });

  if (active.length > 0) {
    return {
      mode: 'active',
      items: active.slice(0, maxCount).map(function (quest) {
        return _createTrackerItem(quest, state, 'active');
      }),
    };
  }

  var recommended = getStarterRecommendations(state, maxCount);
  if (recommended.length > 0) {
    return {
      mode: 'recommended',
      items: recommended.map(function (quest) {
        return _createTrackerItem(quest, state, 'recommended');
      }),
    };
  }

  var available = getAvailableQuests(state).slice(0, maxCount);
  if (available.length > 0) {
    return {
      mode: 'available',
      items: available.map(function (quest) {
        return _createTrackerItem(quest, state, 'available');
      }),
    };
  }

  return { mode: 'empty', items: [] };
}

/**
 * 获取各阶段的完成进度
 */
export function getQuestPhaseProgress(state) {
  var completedIds = state.completedQuests || [];
  return QUEST_PHASES.map(function (phase, idx) {
    var phaseNum = idx + 1;
    var phaseQuests = QUESTS.filter(function (q) { return (q.phase || 1) === phaseNum; });
    var completed = phaseQuests.filter(function (q) { return completedIds.includes(q.id); });
    return {
      phase: phase,
      total: phaseQuests.length,
      completed: completed.length,
      percent: phaseQuests.length > 0 ? Math.round(completed.length / phaseQuests.length * 100) : 0,
    };
  });
}

/**
 * 接取任务
 * @param {object} state
 * @param {string} questId
 * @returns {{ ok, msgs }}
 */
export function acceptQuest(state, questId) {
  const template = QUESTS.find(function (q) { return q.id === questId; });
  if (!template) return { ok: false, msgs: [{ text: '任务不存在。', type: 'error' }] };
  var phaseBefore = getCurrentQuestPhase(state);

  if ((template.phase || 1) !== getCurrentQuestPhase(state)) {
    return { ok: false, msgs: [{ text: '该任务尚未解锁当前章节。', type: 'error' }] };
  }

  if (state.quests.length >= 5) {
    return { ok: false, msgs: [{ text: '❌ 最多同时进行 5 个任务！', type: 'error' }] };
  }

  // 深拷贝任务实例
  const quest = JSON.parse(JSON.stringify(template));
  quest.startDay = state.day;

  // 立即同步一次与当前位置相关的目标，避免“已到达目标星球但未结算”
  if (quest.objectives && quest.objectives.length > 0) {
    quest.objectives.forEach(function (obj) {
      if (obj.type === 'visit_system' && state.currentSystem === obj.targetSystem) {
        obj.current = 1;
      }

      if (obj.type === 'visit_systems') {
        if (!obj.visited) obj.visited = [];
        var knownVisited = state.visitedSystems || [];
        knownVisited.forEach(function (systemId) {
          if (!obj.visited.includes(systemId)) obj.visited.push(systemId);
        });
        obj.current = Math.min(obj.amount || 1, obj.visited.length);
      }
    });
  }

  const typeInfo = QUEST_TYPES[quest.type] || {};

  // 若接取时目标已满足（例如“前往某星球”且当前已在目标地），立即完成
  if (_isQuestDone(quest)) {
    var immediateRewards = _applyQuestRewards(state, quest);
    if (!state.completedQuests.includes(quest.id)) {
      state.completedQuests.push(quest.id);
    }
    _syncQuestPhase(state);
    var phaseAfterImmediate = state.questPhase || 1;
    var immediatePhase = phaseAfterImmediate > phaseBefore ? QUEST_PHASES[phaseAfterImmediate - 1] : null;

    return {
      ok: true,
      completedImmediately: true,
      completedQuest: JSON.parse(JSON.stringify(quest)),
      rewardSummary: immediateRewards,
      phaseAdvanced: phaseAfterImmediate > phaseBefore,
      newPhase: immediatePhase,
      msgs: [{
        text: (typeInfo.icon || '📋') + ' 任务「' + quest.name + '」已立即完成！奖励：💰' +
              immediateRewards.credits + ' 积分, ⭐' + immediateRewards.exp + ' 经验, 🏅' + immediateRewards.reputation + ' 声望' +
              (immediateRewards.hasDecisionBonus ? ' · 🧭 ' + immediateRewards.bonusText : ''),
        type: 'upgrade',
      }],
    };
  }

  state.quests.push(quest);

  return {
    ok: true,
    quest: JSON.parse(JSON.stringify(quest)),
    msgs: [{
      text: (typeInfo.icon || '📋') + ' 接取任务「' + quest.name + '」！',
      type: 'upgrade',
    }],
  };
}

/**
 * 放弃任务
 */
export function abandonQuest(state, questId) {
  state.quests = state.quests.filter(function (q) { return q.id !== questId; });
  return { ok: true, msgs: [{ text: '❌ 已放弃任务。', type: 'info' }] };
}

/**
 * 检查所有活跃任务的进度（在交易/旅行后调用）
 * @param {object} state
 * @param {object} context  { action, goodId, quantity, systemId, factionId }
 * @returns {{ completedQuests: Array, msgs: Array }}
 */
export function checkProgress(state, context) {
  const msgs = [];
  const completed = [];
  var phaseBefore = getCurrentQuestPhase(state);

  state.quests.forEach(function (quest) {
    // 检查是否超时
    if (quest.timeLimit > 0 && state.day - quest.startDay >= quest.timeLimit) {
      msgs.push({
        text: '⏰ 任务「' + quest.name + '」已超时失败！',
        type: 'error',
      });
      completed.push({ id: quest.id, failed: true, quest: JSON.parse(JSON.stringify(quest)) });
      return;
    }

    let allDone = true;
    if (!quest.objectives || quest.objectives.length === 0) {
      allDone = false;
    } else {
      quest.objectives.forEach(function (obj) {
        _updateObjective(obj, context, state);
        if (obj.current < (obj.amount || 1)) allDone = false;
      });
    }

    if (allDone) {
      completed.push({ id: quest.id, failed: false, quest: JSON.parse(JSON.stringify(quest)) });
    }
  });

  // 处理完成/失败
  completed.forEach(function (c) {
    const quest = state.quests.find(function (q) { return q.id === c.id; });
    if (!quest) return;

    if (!c.failed) {
      // 发放奖励
      var rewardSummary = _applyQuestRewards(state, quest);
      state.completedQuests.push(quest.id);
      c.rewardSummary = JSON.parse(JSON.stringify(rewardSummary));

      const typeInfo = QUEST_TYPES[quest.type] || {};
      msgs.push({
        text: '🎉 任务完成「' + quest.name + '」！奖励：💰' +
              rewardSummary.credits + ' 积分, ⭐' + rewardSummary.exp + ' 经验, 🏅' + rewardSummary.reputation + ' 声望' +
              (rewardSummary.hasDecisionBonus ? ' · 🧭 ' + rewardSummary.bonusText : ''),
        type: 'upgrade',
      });

      _applyQuestDecisionEffects(state, quest, msgs);
    }

    // 从活跃列表移除
    state.quests = state.quests.filter(function (q) { return q.id !== c.id; });
  });

  _syncQuestPhase(state);
  var phaseAfter = state.questPhase || 1;
  if (phaseAfter > phaseBefore) {
    var p = QUEST_PHASES[phaseAfter - 1];
    if (p) {
      msgs.push({
        text: '🎬 恭喜你进入' + p.name + '！新的章节任务与胜利条件已解锁。',
        type: 'upgrade',
      });
    }
  }

  return {
    completedQuests: completed,
    msgs: msgs,
    phaseAdvanced: phaseAfter > phaseBefore,
    newPhase: phaseAfter > phaseBefore ? QUEST_PHASES[phaseAfter - 1] : null,
  };
}

/**
 * 获取当前活跃任务列表
 */
export function getActiveQuests(state) {
  return state.quests || [];
}

function _createTrackerItem(quest, state, mode) {
  var primaryObjective = _getPrimaryObjective(quest);
  var progressPercent = _getQuestProgressPercent(quest);
  var remainingDays = quest.timeLimit > 0 && typeof quest.startDay === 'number'
    ? Math.max(0, quest.timeLimit - ((state.day || 1) - quest.startDay))
    : null;

  return {
    id: quest.id,
    name: quest.name,
    type: quest.type,
    phase: quest.phase || 1,
    mode: mode,
    progressPercent: progressPercent,
    progressText: _getObjectiveProgressText(primaryObjective),
    statusText: _getTrackerStatusText(mode, remainingDays),
    primaryObjective: primaryObjective ? JSON.parse(JSON.stringify(primaryObjective)) : null,
    rewardSummary: getQuestRewardSummary(state, quest),
  };
}

function _getPrimaryObjective(quest) {
  if (!quest || !Array.isArray(quest.objectives) || quest.objectives.length === 0) return null;

  for (var i = 0; i < quest.objectives.length; i++) {
    var objective = quest.objectives[i];
    if ((objective.current || 0) < (objective.amount || 1)) {
      return objective;
    }
  }

  return quest.objectives[0];
}

function _getQuestProgressPercent(quest) {
  if (!quest || !Array.isArray(quest.objectives) || quest.objectives.length === 0) return 0;

  var totalPercent = quest.objectives.reduce(function (sum, objective) {
    var amount = objective.amount || 1;
    var current = objective.current || 0;
    return sum + Math.min(1, current / Math.max(1, amount));
  }, 0);

  return Math.round(totalPercent / quest.objectives.length * 100);
}

function _getObjectiveProgressText(objective) {
  if (!objective) return '';
  return (objective.current || 0) + '/' + (objective.amount || 1);
}

function _getTrackerStatusText(mode, remainingDays) {
  if (mode === 'active') {
    if (typeof remainingDays === 'number') return '剩余 ' + remainingDays + ' 天';
    return '进行中';
  }
  if (mode === 'recommended') return '推荐接取';
  return '可接取';
}

function _getTutorialRouteDecision(state) {
  return state && state.storyDecisions ? state.storyDecisions.tutorial_postlude : null;
}

function _applyQuestRewards(state, quest) {
  var rewardSummary = getQuestRewardSummary(state, quest);
  state.credits = (state.credits || 0) + rewardSummary.credits;
  state.experience = (state.experience || 0) + rewardSummary.exp;
  state.reputation = (state.reputation || 0) + rewardSummary.reputation;
  return rewardSummary;
}

function _applyQuestDecisionEffects(state, quest, msgs) {
  if (!quest) return;

  _applyRouteQuestFactionEffects(state, quest, msgs);

  if (quest.id !== 'rise_syndicate_sell') return;

  var decision = state.storyDecisions && state.storyDecisions.quest_accept_rise_syndicate_sell;
  if (decision === 'profit') {
    _pushFactionShift(state, 'syndicate', 12, msgs);
    _pushFactionShift(state, 'federation', -4, msgs);
    msgs.push({
      text: '🕶️ 利润优先的表态让辛迪加更看重你，但联邦也因此提高了警惕。',
      type: 'info',
    });
    return;
  }

  if (decision === 'cautious') {
    _pushFactionShift(state, 'syndicate', 8, msgs);
    msgs.push({
      text: '🕶️ 谨慎试探的做法让辛迪加把你视为更可靠的长期合作对象。',
      type: 'info',
    });
  }
}

function _pushFactionShift(state, factionId, delta, msgs) {
  if (!delta) return;

  var meta = FACTIONS.find(function (faction) { return faction.id === factionId; });
  var result = Faction.changeRelation(state, factionId, delta);

  msgs.push({
    text: (meta ? meta.icon : '🏛️') + ' ' + (meta ? meta.name : factionId) + ' 关系 ' + (delta > 0 ? '+' + delta : String(delta)),
    type: delta > 0 ? 'sell' : 'info',
  });

  if (result && Array.isArray(result.msgs) && result.msgs.length > 0) {
    Array.prototype.push.apply(msgs, result.msgs);
  }
}

function _applyRouteQuestFactionEffects(state, quest, msgs) {
  var profile = getStoryRouteProfile(state);
  var effect = profile ? _getRouteQuestEffect(profile.id, quest.id) : null;
  if (!effect || !Array.isArray(effect.factionShifts) || effect.factionShifts.length === 0) return;

  effect.factionShifts.forEach(function (entry) {
    if (!entry || !entry.factionId || !entry.delta) return;
    _pushFactionShift(state, entry.factionId, entry.delta, msgs);
  });
}

function _getRouteQuestEffect(routeId, questId) {
  if (!routeId || !questId) return null;
  var routeEffects = STORY_ROUTE_QUEST_EFFECTS[routeId];
  if (!routeEffects) return null;
  return routeEffects[questId] || null;
}

function _normalizeFactionId(factionId) {
  if (!factionId) return factionId;
  return QUEST_FACTION_ID_ALIASES[factionId] || factionId;
}

function _questTouchesFaction(quest, factionId) {
  if (!quest) return false;
  if (_normalizeFactionId(quest.factionId) === factionId) return true;
  if (!Array.isArray(quest.objectives)) return false;

  return quest.objectives.some(function (objective) {
    if (!objective) return false;
    if (_normalizeFactionId(objective.factionId) === factionId) return true;
    if (!objective.targetSystem) return false;

    var owner = Faction.getFactionForSystem(objective.targetSystem);
    return !!(owner && owner.id === factionId);
  });
}

function _compareTrackedQuestPriority(left, right, state) {
  var leftTimed = left.timeLimit > 0;
  var rightTimed = right.timeLimit > 0;

  if (leftTimed !== rightTimed) return leftTimed ? -1 : 1;

  if (leftTimed && rightTimed) {
    var currentDay = state.day || 1;
    var leftRemaining = Math.max(0, left.timeLimit - (currentDay - (left.startDay || currentDay)));
    var rightRemaining = Math.max(0, right.timeLimit - (currentDay - (right.startDay || currentDay)));
    if (leftRemaining !== rightRemaining) return leftRemaining - rightRemaining;
  }

  return _getQuestProgressPercent(right) - _getQuestProgressPercent(left);
}

// ---------------------------------------------------------------------------
// 私有：更新单个目标进度
// ---------------------------------------------------------------------------
function _updateObjective(obj, ctx, state) {
  switch (obj.type) {
    case 'deliver':
      // 在目标星系卖出指定商品
      if (ctx.action === 'sell' && ctx.goodId === obj.goodId &&
          ctx.systemId === obj.targetSystem) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'buy_at':
      // 在指定星系买入指定商品
      if (ctx.action === 'buy' && ctx.goodId === obj.goodId &&
          ctx.systemId === obj.targetSystem) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'earn_profit':
      if (ctx.action === 'sell') {
        obj.current = Math.min(obj.amount, obj.current + (ctx.totalEarned || 0));
      }
      break;

    case 'trade_count':
      if (ctx.action === 'buy' || ctx.action === 'sell') {
        obj.current = Math.min(obj.amount, obj.current + 1);
      }
      break;

    case 'trade_good':
      if ((ctx.action === 'buy' || ctx.action === 'sell') && ctx.goodId === obj.goodId) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'visit_systems':
      if (ctx.action === 'travel') {
        if (!obj.visited) obj.visited = [];
        if (!obj.visited.includes(ctx.systemId)) {
          obj.visited.push(ctx.systemId);
          obj.current = obj.visited.length;
        }
      }
      break;

    case 'visit_system':
      // 兼容：旅行事件触发，或玩家当前就在目标星球
      if ((ctx.action === 'travel' && ctx.systemId === obj.targetSystem) ||
          state.currentSystem === obj.targetSystem) {
        obj.current = 1;
      }
      break;

    case 'faction_trade':
      if ((ctx.action === 'buy' || ctx.action === 'sell') && ctx.factionId === _normalizeFactionId(obj.factionId)) {
        obj.current = Math.min(obj.amount, obj.current + 1);
      }
      break;

    case 'sell_in_faction':
      if (ctx.action === 'sell' && ctx.factionId === _normalizeFactionId(obj.factionId) && ctx.goodId === obj.goodId) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'sell_at':
      // 在指定星系卖出指定商品
      if (ctx.action === 'sell' && ctx.goodId === obj.goodId &&
          ctx.systemId === obj.targetSystem) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'faction_relation':
      // 派系关系检查（每次触发时从 state 读取实际关系值）
      var normalizedFactionId = _normalizeFactionId(obj.factionId);
      if (state.factionRelations && state.factionRelations[normalizedFactionId] != null) {
        obj.current = state.factionRelations[normalizedFactionId];
      }
      break;

    case 'survive_days':
      // 生存天数（每次旅行触发）
      if (ctx.action === 'travel') {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      }
      break;

    case 'galaxy_jump':
      // 跨星系跃迁
      if (ctx.action === 'galaxy_jump') {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      }
      break;
  }
}
