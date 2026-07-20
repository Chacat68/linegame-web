// js/systems/quest/QuestSystem.js — 任务系统（按章节推进解锁）
// 依赖：data/quests.js, data/playerLevels.js, systems/faction/FactionSystem.js
// 导出：init, getAvailableQuests, getLockedQuests, getStarterRecommendations, getQuestTracker, getQuestRoutePreview, acceptQuest, checkProgress,
//       getActiveQuests, completeQuest, getQuestPhaseProgress,
//       getCurrentQuestPhase, getCurrentQuestPhaseProgress,
//       getStoryRouteProfile, getQuestRewardSummary

import { QUESTS, QUEST_TYPES, QUEST_PHASES } from '../../data/quests.js';
import { FACTIONS }            from '../../data/factions.js';
import { ECONOMY_CONFIG }      from '../../data/constants.js';
import { getLevel }            from '../../data/playerLevels.js';
import { SYSTEMS, GALAXY_JUMP_DAYS, findSystem, findGalaxy, getSystemAccessState } from '../../data/systems.js';
import * as Economy            from '../economy/Economy.js';
import * as Faction            from '../faction/FactionSystem.js';
import * as Exploration        from '../galaxy/ExplorationSystem.js';
import * as Progression        from '../progression/ProgressionSystem.js';

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
const DEFAULT_ROUTE_PREVIEW_LIMIT = 3;

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
      bonusText: '高风险探索：科技商品价差扩大',
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
  state.quests.forEach(function (quest) {
    if (!quest || !Array.isArray(quest.objectives)) return;
    if (quest.id === 'starter_deliver_medicine') {
      var redesignedTemplate = QUESTS.find(function (template) {
        return template.id === 'starter_deliver_medicine';
      });
      var previousProgress = quest.objectives[0] ? Number(quest.objectives[0].current || 0) : 0;
      if (redesignedTemplate) {
        quest.name = redesignedTemplate.name;
        quest.description = redesignedTemplate.description;
        quest.objectives = JSON.parse(JSON.stringify(redesignedTemplate.objectives));
        quest.objectives[0].current = Math.min(quest.objectives[0].amount || 1, previousProgress);
        quest.sequentialObjectives = redesignedTemplate.sequentialObjectives === true;
        quest.rewards = JSON.parse(JSON.stringify(redesignedTemplate.rewards));
        quest.timeLimit = redesignedTemplate.timeLimit;
      }
    }
    quest.objectives = quest.objectives.filter(function (objective) {
      return objective && objective.type !== 'scan_systems' && objective.type !== 'land_systems';
    });
  });
  if (!state.questPhase) {
    state.questPhase = _inferCurrentQuestPhase(state);
  } else {
    state.questPhase = Math.max(1, Math.min(QUEST_PHASES.length, state.questPhase));
  }
  _syncQuestPhase(state);
}

function _inferCurrentQuestPhase(state) {
  var inferred = 1;

  for (var i = 1; i <= QUEST_PHASES.length; i++) {
    var completion = _getPhaseCompletionState(state, i);
    if (completion.isComplete && i < QUEST_PHASES.length) {
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
    var completion = _getPhaseCompletionState(state, current);
    if (!completion.isComplete) break;
    current += 1;
  }
  state.questPhase = Math.max(1, Math.min(QUEST_PHASES.length, current));
}

function _getPhaseCompletionState(state, phaseNumber) {
  var phase = QUEST_PHASES[phaseNumber - 1] || {};
  var completedIds = state.completedQuests || [];
  var phaseQuests = QUESTS.filter(function (quest) {
    return (quest.phase || 1) === phaseNumber;
  });
  var coreQuestIds = Array.isArray(phase.coreQuestIds) ? phase.coreQuestIds : [];
  var coreCompleted = coreQuestIds.filter(function (questId) {
    return completedIds.includes(questId);
  }).length;
  var optionalQuests = phaseQuests.filter(function (quest) {
    return !coreQuestIds.includes(quest.id);
  });
  var optionalCompleted = optionalQuests.filter(function (quest) {
    return completedIds.includes(quest.id);
  }).length;
  var optionalRequired = Math.min(optionalQuests.length, Math.max(0, phase.optionalRequired || 0));
  var completedForAdvance = coreCompleted + Math.min(optionalCompleted, optionalRequired);
  var requiredForAdvance = coreQuestIds.length + optionalRequired;

  return {
    phase: phase,
    phaseQuests: phaseQuests,
    coreQuestIds: coreQuestIds,
    coreTotal: coreQuestIds.length,
    coreCompleted: coreCompleted,
    optionalTotal: optionalQuests.length,
    optionalRequired: optionalRequired,
    optionalCompleted: optionalCompleted,
    completedForAdvance: completedForAdvance,
    requiredForAdvance: requiredForAdvance,
    allCompleted: phaseQuests.filter(function (quest) { return completedIds.includes(quest.id); }).length,
    isComplete: requiredForAdvance === 0 ||
      (coreCompleted >= coreQuestIds.length && optionalCompleted >= optionalRequired),
  };
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
  var completion = _getPhaseCompletionState(state, current);
  return {
    currentPhase: current,
    phase: completion.phase,
    total: completion.requiredForAdvance,
    completed: completion.completedForAdvance,
    allTotal: completion.phaseQuests.length,
    allCompleted: completion.allCompleted,
    coreTotal: completion.coreTotal,
    coreCompleted: completion.coreCompleted,
    optionalTotal: completion.optionalTotal,
    optionalRequired: completion.optionalRequired,
    optionalCompleted: completion.optionalCompleted,
    percent: completion.requiredForAdvance > 0
      ? Math.round(completion.completedForAdvance / completion.requiredForAdvance * 100)
      : 100,
    isComplete: completion.isComplete,
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
    if ((quest.phase || 1) > currentPhase) return false;
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
    if ((quest.phase || 1) > currentPhase) return false;

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

export function getQuestRoutePreview(state, quest, limit) {
  var maxCount = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : DEFAULT_ROUTE_PREVIEW_LIMIT;
  if (!state || !quest) {
    return { mode: 'empty', summaryText: '', items: [] };
  }

  var descriptors = _collectQuestRouteTargets(state, quest, maxCount);
  var items = descriptors.map(function (descriptor) {
    return _createRoutePreviewItem(state, descriptor);
  }).filter(Boolean);

  if (items.length === 0 && state.currentSystem) {
    var fallbackItem = _createRoutePreviewItem(state, {
      systemId: state.currentSystem,
      purposeLabel: '当前可推进',
      note: '这项任务不依赖固定星球，接取后可以直接在当前经营循环中开始累计进度。',
      isPrimary: true,
    });
    if (fallbackItem) items.push(fallbackItem);
  }

  return {
    mode: items.length > 0 && items.every(function (item) { return item.isCurrentSystem; }) ? 'local' : 'route',
    summaryText: _getQuestRoutePreviewSummary(items),
    items: items,
  };
}

function _collectQuestRouteTargets(state, quest, maxCount) {
  var descriptors = [];
  var seen = Object.create(null);
  var primaryObjective = _getPrimaryObjective(quest);

  if (primaryObjective) {
    _appendObjectiveRouteTargets(descriptors, seen, state, quest, primaryObjective, maxCount, true);
  }

  if (Array.isArray(quest.objectives)) {
    quest.objectives.forEach(function (objective) {
      if (descriptors.length >= maxCount || objective === primaryObjective) return;
      _appendObjectiveRouteTargets(descriptors, seen, state, quest, objective, maxCount, false);
    });
  }

  if (descriptors.length === 0) {
    _appendCurrentRouteTarget(descriptors, seen, state, primaryObjective);
  }

  return descriptors.slice(0, maxCount);
}

function _appendObjectiveRouteTargets(descriptors, seen, state, quest, objective, maxCount, isPrimary) {
  if (!objective || descriptors.length >= maxCount) return;

  if (objective.targetSystem) {
    _pushRouteTarget(descriptors, seen, objective.targetSystem, {
      purposeLabel: _getObjectiveRoutePurpose(objective),
      note: _getObjectiveRouteNote(objective),
      isPrimary: isPrimary,
    });
    return;
  }

  switch (objective.type) {
    case 'visit_systems':
      _appendVisitRouteTargets(descriptors, seen, state, maxCount, isPrimary);
      return;
    case 'faction_trade':
    case 'sell_in_faction':
    case 'faction_relation':
      _appendFactionRouteTargets(descriptors, seen, state, objective, quest, maxCount, isPrimary);
      return;
    case 'galaxy_jump':
      _appendGalaxyJumpRouteTargets(descriptors, seen, state, maxCount, isPrimary);
      return;
    default:
      if (isPrimary) _appendCurrentRouteTarget(descriptors, seen, state, objective);
  }
}

function _appendVisitRouteTargets(descriptors, seen, state, maxCount, isPrimary) {
  var visited = Array.isArray(state && state.visitedSystems) ? state.visitedSystems : [];
  var candidates = SYSTEMS.filter(function (system) {
    return system && system.id !== state.currentSystem && visited.indexOf(system.id) === -1;
  });

  _appendSortedRouteTargets(descriptors, seen, state, candidates, maxCount, {
    purposeLabel: '造访候选',
    note: '优先选择尚未造访且更近的星球，抵达即可累计探索进度。',
    isPrimary: isPrimary,
  });

  if (descriptors.length === 0) {
    _appendCurrentRouteTarget(descriptors, seen, state, { type: 'visit_systems' });
  }
}

function _appendFactionRouteTargets(descriptors, seen, state, objective, quest, maxCount, isPrimary) {
  var factionId = _normalizeFactionId((objective && objective.factionId) || (quest && quest.factionId));
  var factionMeta = factionId ? FACTIONS.find(function (faction) { return faction.id === factionId; }) : null;
  var candidates = SYSTEMS.filter(function (system) {
    var owner = Faction.getFactionForSystem(system.id);
    return !!(owner && owner.id === factionId);
  });

  _appendSortedRouteTargets(descriptors, seen, state, candidates, maxCount, {
    purposeLabel: factionMeta ? factionMeta.name : _getObjectiveRoutePurpose(objective),
    note: _getObjectiveRouteNote(objective),
    isPrimary: isPrimary,
  });

  if (descriptors.length === 0) {
    _appendCurrentRouteTarget(descriptors, seen, state, objective);
  }
}

function _appendGalaxyJumpRouteTargets(descriptors, seen, state, maxCount, isPrimary) {
  var currentSystem = findSystem(state && state.currentSystem);
  var currentGalaxyId = currentSystem ? currentSystem.galaxyId : null;
  var candidates = SYSTEMS.filter(function (system) {
    return system && system.galaxyId !== currentGalaxyId;
  });

  _appendSortedRouteTargets(descriptors, seen, state, candidates, maxCount, {
    purposeLabel: '跃迁候选',
    note: '完成一次跨星系跃迁即可推进该目标。',
    isPrimary: isPrimary,
  });

  if (descriptors.length === 0) {
    _appendCurrentRouteTarget(descriptors, seen, state, { type: 'galaxy_jump' });
  }
}

function _appendSortedRouteTargets(descriptors, seen, state, systems, maxCount, options) {
  var sorted = _sortSystemsByRoutePriority(state, systems || []);
  sorted.forEach(function (system) {
    if (descriptors.length >= maxCount) return;
    _pushRouteTarget(descriptors, seen, system.id, options);
  });
}

function _appendCurrentRouteTarget(descriptors, seen, state, objective) {
  if (!state || !state.currentSystem) return;
  _pushRouteTarget(descriptors, seen, state.currentSystem, {
    purposeLabel: '当前可推进',
    note: _getObjectiveRouteNote(objective),
    isPrimary: true,
  });
}

function _pushRouteTarget(descriptors, seen, systemId, options) {
  if (!systemId || seen[systemId]) return;
  seen[systemId] = true;
  descriptors.push({
    systemId: systemId,
    purposeLabel: options && options.purposeLabel ? options.purposeLabel : '目标星球',
    note: options && options.note ? options.note : '',
    isPrimary: !!(options && options.isPrimary),
  });
}

function _sortSystemsByRoutePriority(state, systems) {
  var currentSystem = findSystem(state && state.currentSystem);
  if (!currentSystem) return (systems || []).slice();

  return (systems || []).slice().sort(function (left, right) {
    var leftScore = _getRouteAvailabilityScore(state, currentSystem, left);
    var rightScore = _getRouteAvailabilityScore(state, currentSystem, right);
    if (leftScore !== rightScore) return leftScore - rightScore;

    var leftCost = left.id === currentSystem.id ? 0 : Economy.getFuelCost(currentSystem.id, left.id, state.fuelEfficiency || 1, state);
    var rightCost = right.id === currentSystem.id ? 0 : Economy.getFuelCost(currentSystem.id, right.id, state.fuelEfficiency || 1, state);
    if (leftCost !== rightCost) return leftCost - rightCost;

    var levelDiff = (left.minLevel || 1) - (right.minLevel || 1);
    if (levelDiff !== 0) return levelDiff;
    return (left.name || '').localeCompare((right.name || ''), 'zh-CN');
  });
}

function _getRouteAvailabilityScore(state, currentSystem, targetSystem) {
  if (!state || !currentSystem || !targetSystem) return 99;
  if (currentSystem.id === targetSystem.id) return 0;

  var playerLevel = state.playerLevel || 1;
  var systemAccess = getSystemAccessState(targetSystem.id, playerLevel, state.researchedTechs);
  if (!systemAccess.galaxyAccess.unlocked) return 2;
  if (!systemAccess.unlocked) return 3;

  var fuelCost = Economy.getFuelCost(currentSystem.id, targetSystem.id, state.fuelEfficiency || 1, state);
  if ((state.fuel || 0) < fuelCost) return 1;
  return 0;
}

function _createRoutePreviewItem(state, descriptor) {
  var currentSystem = findSystem(state && state.currentSystem);
  var targetSystem = descriptor && descriptor.systemId ? findSystem(descriptor.systemId) : null;
  if (!currentSystem || !targetSystem) return null;

  var isCurrentSystem = currentSystem.id === targetSystem.id;
  var isCrossGalaxy = currentSystem.galaxyId !== targetSystem.galaxyId;
  var routeInfo = isCurrentSystem ? null : Exploration.getTravelRouteInfo(state, currentSystem.id, targetSystem.id);
  var rawDistance = isCurrentSystem ? 0 : _getSystemDistance(currentSystem, targetSystem);
  var displayedDistance = isCrossGalaxy ? _getCrossGalaxyLocalDistance(targetSystem) : rawDistance;
  var fuelCost = isCurrentSystem ? 0 : Economy.getFuelCost(currentSystem.id, targetSystem.id, state.fuelEfficiency || 1, state);
  var blockedReason = _getRouteBlockedReason(state, currentSystem, targetSystem, fuelCost);
  var galaxy = findGalaxy(targetSystem.galaxyId);

  return {
    systemId: targetSystem.id,
    systemName: targetSystem.name,
    galaxyName: galaxy ? galaxy.name : (targetSystem.galaxyId || '未知星区'),
    purposeLabel: descriptor.purposeLabel || '目标星球',
    note: _buildRoutePreviewNote(descriptor.note, blockedReason, routeInfo, isCurrentSystem),
    routeModeLabel: isCurrentSystem ? '当前停靠' : (isCrossGalaxy ? '跨星系跃迁' : '直航'),
    distanceLabel: isCurrentSystem ? '当前距离' : (isCrossGalaxy ? '跃迁后距离' : '星图距离'),
    distanceText: _formatRouteDistance(displayedDistance),
    fuelCost: fuelCost,
    etaDays: isCurrentSystem ? 0 : (isCrossGalaxy ? GALAXY_JUMP_DAYS : 1),
    isCurrentSystem: isCurrentSystem,
    isCrossGalaxy: isCrossGalaxy,
    isPrimary: !!descriptor.isPrimary,
    blockedReason: blockedReason,
    canTravel: !blockedReason,
    hasSecretRoute: !!(routeInfo && routeInfo.active),
    secretRouteLabel: routeInfo && routeInfo.active ? routeInfo.label : '',
    discountPercent: routeInfo && routeInfo.active ? Math.round((1 - routeInfo.fuelMultiplier) * 100) : 0,
    minLevel: targetSystem.minLevel || 1,
  };
}

function _getQuestRoutePreviewSummary(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  var blockedCount = items.filter(function (item) {
    return !item.isCurrentSystem && !!item.blockedReason;
  }).length;

  if (items.length === 1 && items[0].isCurrentSystem) {
    return '按当前停靠点、燃料与解锁条件测算：这项任务不需要额外跑图，接取后即可开始推进。';
  }

  if (blockedCount > 0) {
    return '按当前停靠点、燃料与解锁条件测算：部分航点暂不可直达，先补足条件再接会更稳。';
  }

  if (items.length === 1) {
    return '按当前停靠点、燃料与解锁条件测算：接取后可直接执行这条航线。';
  }

  return '按当前停靠点、燃料与解锁条件测算：已将关键航点按可执行顺序列出，适合提前规划顺路航程。';
}

function _getRouteBlockedReason(state, currentSystem, targetSystem, fuelCost) {
  if (!state || !currentSystem || !targetSystem || currentSystem.id === targetSystem.id) return '';

  var playerLevel = state.playerLevel || 1;
  var systemAccess = getSystemAccessState(targetSystem.id, playerLevel, state.researchedTechs);
  if (!systemAccess.unlocked) {
    var galaxyAccess = systemAccess.galaxyAccess;
    if (!galaxyAccess.unlocked) {
      var galaxyName = galaxyAccess.galaxy ? galaxyAccess.galaxy.name : (targetSystem.galaxyId || '目标星系');
      var blockerMessage = galaxyName + ' 需达到 Lv.' + galaxyAccess.requiredLevel + ' 才会开放。';
      if (galaxyAccess.techRequired) {
        blockerMessage += ' 研究超空间跃迁也可提前解锁。';
      }
      return blockerMessage;
    }
    if (galaxyAccess.unlockedBy === 'tech') {
      return '超空间跃迁仅提前开放该星系入口层；' + targetSystem.name + ' 仍需达到 Lv.' + systemAccess.requiredLevel + '。';
    }
    return '需要达到 Lv.' + systemAccess.requiredLevel + ' 才能前往。';
  }

  if ((state.fuel || 0) < fuelCost) {
    return '当前燃料不足，需要 ' + fuelCost + ' 燃料，现有 ' + Math.floor(state.fuel || 0) + '。';
  }

  return '';
}

function _buildRoutePreviewNote(baseNote, blockedReason, routeInfo, isCurrentSystem) {
  if (blockedReason) return blockedReason;

  var details = [];
  if (baseNote) details.push(baseNote);
  if (routeInfo && routeInfo.active && !isCurrentSystem) {
    details.push('已发现隐藏航线「' + routeInfo.label + '」，本次预计节省约 ' + Math.round((1 - routeInfo.fuelMultiplier) * 100) + '% 燃料。');
  }
  return details.join(' ');
}

function _getObjectiveRoutePurpose(objective) {
  if (!objective) return '当前可推进';

  switch (objective.type) {
    case 'deliver':
      return '交付地点';
    case 'buy_at':
      return '采购地点';
    case 'sell_at':
      return '销售地点';
    case 'visit_system':
      return '任务地点';
    case 'visit_systems':
      return '造访候选';
    case 'faction_trade':
      return '派系交易区';
    case 'sell_in_faction':
      return '派系销售区';
    case 'faction_relation':
      return '关系推进区';
    case 'galaxy_jump':
      return '跃迁候选';
    default:
      return '当前可推进';
  }
}

function _getObjectiveRouteNote(objective) {
  if (!objective) return '接取后可以按当前经营节奏开始推进。';

  switch (objective.type) {
    case 'deliver':
      return '需要在此地完成交付或卖出指定货物。';
    case 'buy_at':
      return '需要在此地采购指定货物。';
    case 'sell_at':
      return '需要在此地完成指定销售。';
    case 'visit_system':
      return '抵达该星球即可推进任务。';
    case 'visit_systems':
      return '优先造访尚未记录的星球，能更快完成探索目标。';
    case 'faction_trade':
      return '在该派系控制区完成交易即可累计次数。';
    case 'sell_in_faction':
      return '需要在该派系控制区卖出指定货物。';
    case 'faction_relation':
      return '在该派系势力范围内活动，更利于推进关系目标。';
    case 'trade_good':
      return '当前或临近市场完成指定货物交易即可推进。';
    case 'trade_count':
      return '任意市场买卖都会累计交易次数。';
    case 'earn_profit':
      return '优先跑高利润航线，当前市场也可先开单。';
    case 'survive_days':
      return '持续航行并推进日期即可累计。';
    case 'galaxy_jump':
      return '完成一次跨星系跃迁即可推进。';
    default:
      return '接取后即可按当前经营节奏逐步推进。';
  }
}

function _hasTech(state, techId) {
  return !!(state && Array.isArray(state.researchedTechs) && state.researchedTechs.indexOf(techId) !== -1);
}

function _getSystemDistance(fromSystem, toSystem) {
  return Math.sqrt(
    Math.pow((fromSystem.x || 0) - (toSystem.x || 0), 2) +
    Math.pow((fromSystem.y || 0) - (toSystem.y || 0), 2)
  );
}

function _getCrossGalaxyLocalDistance(targetSystem) {
  return Math.sqrt(
    Math.pow((targetSystem.x || 0) - ECONOMY_CONFIG.travel.crossGalaxyOriginX, 2) +
    Math.pow((targetSystem.y || 0) - ECONOMY_CONFIG.travel.crossGalaxyOriginY, 2)
  );
}

function _formatRouteDistance(distance) {
  return (Math.round((distance || 0) * 100) / 100).toFixed(2);
}

/**
 * 获取各阶段的完成进度
 */
export function getQuestPhaseProgress(state) {
  return QUEST_PHASES.map(function (phase, idx) {
    var phaseNum = idx + 1;
    var completion = _getPhaseCompletionState(state, phaseNum);
    return {
      phase: phase,
      total: completion.requiredForAdvance,
      completed: completion.completedForAdvance,
      allTotal: completion.phaseQuests.length,
      allCompleted: completion.allCompleted,
      coreTotal: completion.coreTotal,
      coreCompleted: completion.coreCompleted,
      optionalRequired: completion.optionalRequired,
      optionalCompleted: completion.optionalCompleted,
      percent: completion.requiredForAdvance > 0
        ? Math.round(completion.completedForAdvance / completion.requiredForAdvance * 100)
        : 100,
      isComplete: completion.isComplete,
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

  if ((template.phase || 1) > getCurrentQuestPhase(state)) {
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
      _updateObjective(obj, { action: 'accept_quest' }, state);
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
    var immediateRewardResult = _applyQuestRewards(state, quest);
    var immediateRewards = immediateRewardResult.summary;
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
      }].concat(immediateRewardResult.msgs),
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
      var rewardResult = _applyQuestRewards(state, quest);
      var rewardSummary = rewardResult.summary;
      state.completedQuests.push(quest.id);
      c.rewardSummary = JSON.parse(JSON.stringify(rewardSummary));

      const typeInfo = QUEST_TYPES[quest.type] || {};
      msgs.push({
        text: '🎉 任务完成「' + quest.name + '」！奖励：💰' +
              rewardSummary.credits + ' 积分, ⭐' + rewardSummary.exp + ' 经验, 🏅' + rewardSummary.reputation + ' 声望' +
              (rewardSummary.hasDecisionBonus ? ' · 🧭 ' + rewardSummary.bonusText : ''),
        type: 'upgrade',
      });
      msgs.push(...rewardResult.msgs);

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
  var progressionResult = Progression.gainExperience(state, rewardSummary.exp);
  state.reputation = (state.reputation || 0) + rewardSummary.reputation;
  return {
    summary: rewardSummary,
    msgs: progressionResult.msgs || [],
  };
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
      if (ctx.action === 'accept_quest') {
        obj.current = Math.min(obj.amount, Math.max(obj.current || 0, state.tradeCount || 0));
      } else if (ctx.action === 'buy' || ctx.action === 'sell') {
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
      // 生存天数（由每日推进触发）
      if (ctx.action === 'advance_day') {
        var advancedDays = Math.max(1, Math.floor(ctx.days || 1));
        obj.current = Math.min(obj.amount, (obj.current || 0) + advancedDays);
      }
      break;

    case 'galaxy_jump':
      // 跨星系跃迁
      if (ctx.action === 'galaxy_jump' || (ctx.action === 'travel' && ctx.crossGalaxy)) {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      }
      break;

    case 'research_count':
      obj.current = Math.min(obj.amount, (state.researchedTechs || []).length);
      break;

    case 'explore_pois':
      obj.current = Math.min(obj.amount, Object.values(state.galaxyStates || {}).reduce(function (count, planetState) {
        var pois = planetState && planetState.exploration && Array.isArray(planetState.exploration.pois)
          ? planetState.exploration.pois
          : [];
        return count + pois.filter(function (poi) { return poi && poi.resolved; }).length;
      }, 0));
      break;

    case 'fleet_size':
      obj.current = Math.min(obj.amount, (state.fleet || []).length);
      break;

    case 'crew_count':
      obj.current = Math.min(obj.amount, (state.crewRoster || []).length);
      break;

    case 'dispatch_routes':
      if (ctx.action === 'dispatch_route') {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      } else {
        obj.current = Math.min(obj.amount, Math.max(obj.current || 0, (state.fleet || []).filter(function (ship) {
          return !!(ship && ship.route);
        }).length));
      }
      break;

    case 'finance_actions':
      if (ctx.action === 'finance_action') {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      }
      break;

    case 'trade_stations':
      obj.current = Math.min(obj.amount, Object.keys(state.tradeStations || {}).length);
      break;

    case 'visited_galaxies':
      obj.current = Math.min(obj.amount, (state.visitedGalaxies || []).length);
      break;

    case 'victory_policy':
      obj.current = state.storyDecisions && state.storyDecisions.victory_policy ? 1 : 0;
      break;
  }
}
