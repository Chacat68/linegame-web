// js/ui/ResearchUI.js — 科技研究界面渲染
// 依赖：data/technologies.js, systems/research/ResearchSystem.js
// 导出：render

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import { getSystemsByGalaxy } from '../data/systems.js';
import { buildMarketFocusAction, MARKET_FOCUS_PRESET_IDS } from './MarketFocus.js?v=20260531-chainfollow1';
import { getCommandActionAttributes, normalizeCommandAction, renderCommandActionContent } from './CommandAction.js?v=20260510-command1';
import * as Research from '../systems/research/ResearchSystem.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js?v=20260420-balance5';
import * as Quest from '../systems/quest/QuestSystem.js?v=20260412-questroute2';
import { getQuestBlockerActions, getPreferredAvailableQuest } from './QuestUI.js?v=20260619-confirmflow1';
import * as ActionConfirmUI from './ActionConfirmUI.js?v=20260621-settingsfallback1';

const RESEARCH_BLOCKER_MARKET_PRESETS = {
  cargo: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  credits: MARKET_FOCUS_PRESET_IDS.CAPITAL_LOCAL,
  level: MARKET_FOCUS_PRESET_IDS.OPERATIONS_LOCAL,
  generic: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
};

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function _getResearchSupplyFocus(state) {
  var techId = state.currentResearch && state.currentResearch.techId
    ? state.currentResearch.techId
    : (((state.researchOptions || [])[0]) || null);

  if (!techId) return null;

  var tech = TECHNOLOGIES.find(function (item) { return item.id === techId; });
  if (!tech) return null;

  var category = TECH_CATEGORIES.find(function (item) { return item.id === tech.category; });
  return {
    techId: tech.id,
    techName: tech.name,
    categoryId: tech.category,
    categoryLabel: category ? category.name : tech.category,
    sourceLabel: state.currentResearch && state.currentResearch.techId ? '当前研究' : '候选方向',
  };
}

function _getTechnologyById(techId) {
  return TECHNOLOGIES.find(function (tech) { return tech.id === techId; }) || null;
}

function _getResearchCategoryStatuses(state) {
  const completedSet = new Set(state.researchedTechs || []);
  const optionSet = new Set(state.researchOptions || []);
  const queueSet = new Set((state.researchQueue || []).map(function (item) { return item.techId; }));
  const currentTechId = state.currentResearch && state.currentResearch.techId;

  return TECH_CATEGORIES.map(function (category) {
    const categoryTechs = TECHNOLOGIES.filter(function (tech) { return tech.category === category.id; });
    const completed = categoryTechs.filter(function (tech) { return completedSet.has(tech.id); }).length;
    const options = categoryTechs.filter(function (tech) { return optionSet.has(tech.id); }).length;
    const queued = categoryTechs.filter(function (tech) { return queueSet.has(tech.id); }).length;
    const active = categoryTechs.some(function (tech) { return tech.id === currentTechId; });
    return {
      category: category,
      total: categoryTechs.length,
      completed: completed,
      options: options,
      queued: queued,
      active: active,
      pct: categoryTechs.length ? Math.round(completed / categoryTechs.length * 100) : 0,
    };
  });
}

function _renderResearchCategoryMatrix(statuses) {
  return '<div class="research-category-matrix" role="list" aria-label="科技分类态势">' +
    statuses.map(function (status) {
      return '<div class="research-category-cell' + (status.active ? ' is-active' : '') + '" role="listitem" style="border-color:' + _escapeHtmlAttr(status.category.color) + '44">' +
        '<span class="research-category-cell-kicker" style="color:' + _escapeHtmlAttr(status.category.color) + '">' + _escapeHtml(status.category.icon + ' ' + status.category.name) + '</span>' +
        '<strong>' + status.completed + '/' + status.total + '</strong>' +
        '<em>' + (status.active ? '当前研究' : ('候选 ' + status.options + ' · 队列 ' + status.queued)) + '</em>' +
        '<i class="research-category-cell-meter" aria-hidden="true"><b style="width:' + status.pct + '%;background:' + _escapeHtmlAttr(status.category.color) + '"></b></i>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _renderResearchFocusPanel(state, categoryStatuses, currentTech) {
  const queue = state.researchQueue || [];
  const options = state.researchOptions || [];
  const optionTechs = options.map(_getTechnologyById).filter(Boolean);
  const affordableOptions = optionTechs.filter(function (tech) {
    return (state.credits || 0) >= tech.cost;
  });
  const focusCategory = categoryStatuses.slice().sort(function (a, b) {
    if (b.active !== a.active) return b.active ? 1 : -1;
    if (b.options !== a.options) return b.options - a.options;
    if (a.pct !== b.pct) return a.pct - b.pct;
    return a.category.name.localeCompare(b.category.name);
  })[0];
  const signalTitle = currentTech
    ? ('正在研究：' + currentTech.name)
    : (queue.length > 0
        ? ('队列待启动：' + queue.length + ' 项')
        : (affordableOptions.length > 0 ? ('可立即启动：' + affordableOptions[0].name) : '等待研究预算'));
  const signalNote = currentTech && state.currentResearch
    ? ('剩余 ' + state.currentResearch.daysLeft + ' 天，完成后会自动接力队列中的下一项。')
    : (queue.length > 0
        ? '当前没有进行中研究，队列会在下一次启动条件满足后接力。'
        : (affordableOptions.length > 0
            ? '候选池中有可负担项目，可先从成本、天数和分类收益判断方向。'
            : '候选项目暂时超过预算，先通过市场或任务补足研究资金。'));
  const focusItems = (currentTech ? [currentTech] : []).concat(
    queue.map(function (item) { return _getTechnologyById(item.techId); }).filter(Boolean),
    affordableOptions
  ).filter(function (tech, index, list) {
    return tech && list.findIndex(function (item) { return item.id === tech.id; }) === index;
  }).slice(0, 3);

  return '<section class="research-focus-panel" aria-label="研究局部信号">' +
    '<div class="research-focus-copy">' +
      '<span class="research-focus-kicker">局部信号</span>' +
      '<strong class="research-focus-title">' + _escapeHtml(signalTitle) + '</strong>' +
      '<span class="research-focus-note">' + _escapeHtml(signalNote) + '</span>' +
    '</div>' +
    '<div class="research-focus-list" role="list" aria-label="研究焦点项目">' +
      (focusItems.length > 0
        ? focusItems.map(function (tech) {
            const category = TECH_CATEGORIES.find(function (cat) { return cat.id === tech.category; });
            return '<article class="research-focus-card" role="listitem" style="border-color:' + _escapeHtmlAttr((category ? category.color : '#6ce7ff') + '33') + '">' +
              '<span class="research-focus-icon" aria-hidden="true">' + _escapeHtml(tech.icon) + '</span>' +
              '<span class="research-focus-main">' +
                '<strong>' + _escapeHtml(tech.name) + '</strong>' +
                '<em>' + _escapeHtml((category ? category.name : tech.category) + ' · ' + tech.cost.toLocaleString() + ' / ' + tech.researchDays + ' 天') + '</em>' +
              '</span>' +
            '</article>';
          }).join('')
        : '<div class="research-focus-empty" role="listitem">暂无可展示研究焦点。</div>') +
    '</div>' +
    '<div class="research-budget-signal" aria-label="候选预算信号">' +
      '<span>候选预算</span>' +
      '<strong>' + affordableOptions.length + '/' + optionTechs.length + '</strong>' +
      '<em>' + (focusCategory ? (focusCategory.category.name + ' 进度 ' + focusCategory.completed + '/' + focusCategory.total) : '分类数据待生成') + '</em>' +
    '</div>' +
  '</section>';
}

function _getResearchDispatchBlockerState(state, researchDispatchContext) {
  var focus = _getResearchSupplyFocus(state);
  if (!focus) return null;

  researchDispatchContext = researchDispatchContext || {};
  var currentGalaxy = researchDispatchContext.currentGalaxy || state.currentGalaxy || 'milky_way';
  var playerLevel = Number.isFinite(researchDispatchContext.playerLevel)
    ? researchDispatchContext.playerLevel
    : (state.playerLevel || 1);
  var cargoFree = Number.isFinite(researchDispatchContext.cargoFree)
    ? researchDispatchContext.cargoFree
    : Math.max(0, (state.maxCargo || 0) - Object.values(state.cargo || {}).reduce(function (sum, qty) {
      return sum + qty;
    }, 0));
  var credits = Number.isFinite(researchDispatchContext.credits)
    ? researchDispatchContext.credits
    : (state.credits || 0);
  var accessibleSystems = getSystemsByGalaxy(currentGalaxy).filter(function (sys) {
    return playerLevel >= (sys.minLevel || 1);
  });

  if (cargoFree <= 0) {
    return Object.assign({}, focus, {
      reasonId: 'cargo',
      blockedReason: '当前货舱已满，暂时没有空位执行科研补给。',
      summaryText: '先清出部分舱位后，科研补给建议会自动恢复。',
    });
  }

  if (credits <= 0) {
    return Object.assign({}, focus, {
      reasonId: 'credits',
      blockedReason: '当前资金不足，暂时无法为科研补给垫付进货成本。',
      summaryText: '先做一笔周转或卖货回款，再回来安排这条科研补给线。',
    });
  }

  if (accessibleSystems.length < 2) {
    return Object.assign({}, focus, {
      reasonId: 'level',
      blockedReason: '当前可达科研补给点不足，先提升等级解锁更多星球。',
      summaryText: '先把可达星球池拉开，再回来规划更稳的科研补给循环。',
    });
  }

  return Object.assign({}, focus, {
    reasonId: 'generic',
    blockedReason: '当前没有匹配这项研究方向的稳定补给线。',
    summaryText: '先推进市场或任务节奏，等补给条件稳定后会再出现科研建议。',
  });
}

function _getResearchBlockerCopySeed(blocker) {
  if (!blocker) return [];

  if (blocker.reasonId === 'level') {
    return [{ blockedReason: '需要达到 Lv.4 才能前往。' }];
  }

  return [{ blockedReason: '当前燃料不足，需要 8 燃料，现有 2。' }];
}

function _buildResearchMarketAction(reasonId, label, hint) {
  return buildMarketFocusAction(
    reasonId,
    label,
    hint,
    RESEARCH_BLOCKER_MARKET_PRESETS[reasonId] || RESEARCH_BLOCKER_MARKET_PRESETS.generic,
    'primary'
  );
}

function _buildResearchPrimaryAction(blocker) {
  if (!blocker) return null;

  if (blocker.reasonId === 'cargo') {
    return _buildResearchMarketAction(
      'cargo',
      '打开市场清货',
      '会进入交易所终端的现货区，先卖掉一部分货物，腾出舱位后再回来规划科研补给。'
    );
  }

  if (blocker.reasonId === 'credits') {
    return _buildResearchMarketAction(
      'credits',
      '打开资本周转',
      '会进入交易所终端的资本区，先做一笔回款或卖货，补足进货资金后再回来。'
    );
  }

  if (blocker.reasonId === 'level') {
    return _buildResearchMarketAction(
      'level',
      '打开市场跑单',
      '会进入交易所终端，先提升等级，解锁更多科研相关补给点。'
    );
  }

  return _buildResearchMarketAction(
    'generic',
    '打开市场查看',
    '会进入交易所终端，先看看本地行情和库存，再回来等待更稳的科研补给线。'
  );
}

function _adaptResearchFallbackHint(hint, blocker) {
  if (!hint || !blocker) return hint;

  if (blocker.reasonId === 'credits') {
    return hint
      .replace('回补燃料和现金流', '补回现金流和科研进货资金')
      .replace('把燃料和节奏稳住', '把现金流和节奏稳住')
      .replace('再回来补燃料', '再回来补科研周转资金')
      .replace('先做一单回点现金，再回来补燃料。', '先做一单回点现金，再回来补科研周转资金。');
  }

  if (blocker.reasonId === 'cargo') {
    return hint
      .replace('回补燃料和现金流', '清掉一部分库存并腾出舱位')
      .replace('把燃料和节奏稳住', '把舱位和节奏稳住')
      .replace('再回来补燃料', '再回来腾出舱位')
      .replace('先做一单回点现金，再回来补燃料。', '先做一单顺手清一点库存，再回来腾出舱位。');
  }

  return hint;
}

export function getResearchDispatchBlockerState(state, researchDispatchContext) {
  return _getResearchDispatchBlockerState(state, researchDispatchContext);
}

export function getResearchDispatchBlockerActions(state, blocker) {
  if (!blocker) return [];

  var actions = [];
  var primaryAction = _buildResearchPrimaryAction(blocker);
  if (primaryAction) actions.push(primaryAction);

  var fallbackQuest = getPreferredAvailableQuest(state) || (Quest.getAvailableQuests(state)[0] || null);
  if (!fallbackQuest) return actions;

  var sharedQuestActions = getQuestBlockerActions(_getResearchBlockerCopySeed(blocker), fallbackQuest, state);
  var sharedFallbackAction = sharedQuestActions.find(function (action) {
    return action.actionId === 'quest-focus';
  });

  if (sharedFallbackAction) {
    actions.push({
      actionId: 'quest-focus',
      reasonId: blocker.reasonId,
      label: sharedFallbackAction.label,
      hint: _adaptResearchFallbackHint(sharedFallbackAction.hint, blocker),
      commandSurface: sharedFallbackAction.commandSurface,
      commandIntent: sharedFallbackAction.commandIntent,
      commandVerb: sharedFallbackAction.commandVerb || sharedFallbackAction.label,
      targetQuestId: sharedFallbackAction.targetQuestId,
      targetQuestName: sharedFallbackAction.targetQuestName,
      variant: 'secondary',
    });
  }

  return actions;
}

function _renderResearchDispatchBlocker(blocker, canResolveResearchBlocker, state) {
  if (!blocker) return '';

  var actions = getResearchDispatchBlockerActions(state, blocker);

  return (
    '<div class="research-route-card is-blocked">' +
      '<div class="research-route-head">' +
        '<div class="research-route-title">⛔ 暂不生成科研补给建议</div>' +
        '<div class="research-route-caption">' + blocker.sourceLabel + ' · ' + blocker.categoryLabel + '</div>' +
      '</div>' +
      '<div class="research-route-main">' + blocker.techName + ' 当前缺少可执行的补给条件，补足后会自动恢复科研补给建议。</div>' +
      '<div class="research-route-blocker-list">' +
        '<div class="research-route-blocker-item">' +
          '<div class="research-route-blocker-system">' + blocker.techName + ' · ' + blocker.categoryLabel + '</div>' +
          '<div class="research-route-blocker-reason">' + blocker.blockedReason + '</div>' +
        '</div>' +
      '</div>' +
      (canResolveResearchBlocker && actions.length > 0
        ? '<div class="research-route-actions is-blocked">' + actions.map(function (action) {
            var commandAction = normalizeCommandAction(action);
            return '<div class="research-route-action-item' + (action.variant === 'secondary' ? ' is-secondary' : '') + '">' +
              '<button type="button" class="research-route-blocker-btn command-action-btn' + (commandAction.variant === 'secondary' ? ' is-secondary' : '') + '" data-action-id="' + _escapeHtmlAttr(action.actionId || '') + '" data-reason-id="' + _escapeHtmlAttr(action.reasonId || '') + '" data-target-quest-id="' + _escapeHtmlAttr(action.targetQuestId || '') + '" data-target-quest-name="' + _escapeHtmlAttr(action.targetQuestName || '') + '" data-market-workspace-id="' + _escapeHtmlAttr(action.marketWorkspaceId || '') + '" data-market-subworkspace-id="' + _escapeHtmlAttr(action.marketSubworkspaceId || '') + '" data-market-focus-label="' + _escapeHtmlAttr(action.marketFocusLabel || '') + '" data-focus-tech-id="' + _escapeHtmlAttr(blocker.techId || '') + '" data-focus-tech-name="' + _escapeHtmlAttr(blocker.techName || '') + '"' + getCommandActionAttributes(commandAction, _escapeHtmlAttr) + '>' + renderCommandActionContent(commandAction, _escapeHtml) + '</button>' +
              '<span class="research-route-action-hint">' + _escapeHtml(action.hint || '') + '</span>' +
            '</div>';
          }).join('') + '</div>'
        : '') +
      '<div class="research-route-note is-blocked">' + blocker.summaryText + '</div>' +
    '</div>'
  );
}

/**
 * 渲染科技研究标签页
 * @param {object}   state
 * @param {Function} onStartResearch (techId) => void
 * @param {Function} onCancelQueuedResearch (techId) => void
 * @param {Function} onMoveQueuedResearchUp (techId) => void
 * @param {Function} onMoveQueuedResearchDown (techId) => void
 * @param {Function} onClearResearchQueue () => void
 * @param {object}   researchDispatchContext
 * @param {Function} onApplyResearchDispatch (recommendation) => void
 * @param {Function} onResolveResearchBlocker (action) => void
 */
export function render(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue, researchDispatchContext, onApplyResearchDispatch, onResolveResearchBlocker) {
  _renderStatus(state);
  _renderOptions(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue, researchDispatchContext, onApplyResearchDispatch, onResolveResearchBlocker);
  _renderCompleted(state);
}

function _renderStatus(state) {
  const container = document.getElementById('research-status');
  if (!container) return;

  const completed = state.researchedTechs || [];
  const queue = state.researchQueue || [];
  const total = TECHNOLOGIES.length;
  const completePct = total > 0 ? Math.round(completed.length / total * 100) : 0;
  const currentTech = state.currentResearch
    ? TECHNOLOGIES.find(function (tech) { return tech.id === state.currentResearch.techId; })
    : null;
  const currentCat = currentTech
    ? TECH_CATEGORIES.find(function (cat) { return cat.id === currentTech.category; })
    : null;
  const currentProgress = currentTech && state.currentResearch
    ? Math.max(0, Math.min(100, Math.round((currentTech.researchDays - state.currentResearch.daysLeft) / currentTech.researchDays * 100)))
    : 0;
  const categoryStatuses = _getResearchCategoryStatuses(state);

  container.innerHTML =
    '<section class="archive-research-console" aria-label="科技研究总览">' +
      '<div class="research-console-head">' +
        '<div>' +
          '<span class="archive-panel-kicker">RESEARCH MATRIX</span>' +
          '<h3 class="archive-panel-title">科技研究</h3>' +
        '</div>' +
        '<div class="research-completion-meter" role="progressbar" aria-label="科技完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + completePct + '">' +
          '<strong>' + completePct + '%</strong><span>' + completed.length + '/' + total + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="archive-stat-strip archive-stat-strip--research">' +
        '<span><strong>' + completed.length + '</strong><em>已完成</em></span>' +
        '<span><strong>' + (state.researchOptions || []).length + '</strong><em>候选方向</em></span>' +
        '<span><strong>' + queue.length + '</strong><em>队列项目</em></span>' +
        '<span><strong>' + (state.currentResearch ? state.currentResearch.daysLeft : 0) + '</strong><em>剩余天数</em></span>' +
      '</div>' +
      '<div class="research-current-strip' + (currentTech ? '' : ' is-idle') + '">' +
        '<div>' +
          '<span class="research-current-kicker">' + (currentCat ? _escapeHtml(currentCat.name) : '待启动') + '</span>' +
          '<strong>' + (currentTech ? _escapeHtml(currentTech.name) : '选择一项科技开始研究') + '</strong>' +
        '</div>' +
        '<div class="research-current-bar" role="progressbar" aria-label="当前研究进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + currentProgress + '">' +
          '<i style="width:' + currentProgress + '%"></i>' +
        '</div>' +
      '</div>' +
      _renderResearchCategoryMatrix(categoryStatuses) +
      _renderResearchFocusPanel(state, categoryStatuses, currentTech) +
    '</section>';
}

function _renderOptions(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue, researchDispatchContext, onApplyResearchDispatch, onResolveResearchBlocker) {
  const container = document.getElementById('research-options');
  if (!container) return;
  const researchRecommendation = AutoTrade.findResearchSupplyRoute(state, researchDispatchContext);
  const researchBlocker = !researchRecommendation
    ? getResearchDispatchBlockerState(state, researchDispatchContext)
    : null;

  let html = _renderResearchOverview(state, researchRecommendation, researchBlocker, !!onApplyResearchDispatch, !!onResolveResearchBlocker, state);
  const options = state.researchOptions || [];
  if (options.length === 0) {
    html += '<p class="research-hint">所有可用科技已研究完毕！🎉</p>';
  } else {
    const queueMode = !!state.currentResearch;
    const queueLen = (state.researchQueue || []).length;
    html += '<section class="research-option-console" aria-label="研究候选">' +
      '<div class="research-label">' + (queueMode ? '可加入研究队列（当前排队 ' + queueLen + ' 项）' : '选择研究方向（三选一）') + '</div>' +
      '<div class="research-cards" role="list" aria-label="可研究科技">';
    options.forEach(function (techId) {
      const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
      const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
      const canAfford = state.credits >= tech.cost;

      html +=
        '<article class="research-card' + (canAfford ? '' : ' unaffordable') + '" role="listitem" data-tech="' + _escapeHtmlAttr(tech.id) + '" data-research-affordable="' + (canAfford ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(tech.name + '，' + (canAfford ? '可研究' : '资金不足')) + '">' +
          '<div class="research-card-header" style="border-left: 3px solid ' + cat.color + '">' +
            '<span class="research-cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
            '<span class="research-tier">T' + tech.tier + '</span>' +
          '</div>' +
          '<div class="research-card-icon">' + tech.icon + '</div>' +
          '<div class="research-card-name">' + tech.name + '</div>' +
          '<div class="research-card-desc">' + tech.description + '</div>' +
          '<div class="research-card-effect">✨ ' + tech.effectText + '</div>' +
          '<div class="research-card-footer">' +
            '<span class="research-cost">💰 ' + tech.cost + '</span>' +
            '<span class="research-time">⏱️ ' + tech.researchDays + ' 天</span>' +
          '</div>' +
          '<button type="button" class="btn-research" aria-label="' + _escapeHtmlAttr((queueMode ? '加入研究队列：' : '开始研究：') + tech.name) + '">' + (queueMode ? '加入队列' : '开始研究') + '</button>' +
        '</article>';
    });
    html += '</div></section>';
  }

  container.innerHTML = html;
  _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue);
  _bindResearchActions(container, onStartResearch, onApplyResearchDispatch, researchRecommendation, onResolveResearchBlocker);
}

function _renderCompleted(state) {
  const container = document.getElementById('research-completed');
  if (!container) return;
  const completed = state.researchedTechs || [];
  if (completed.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<section class="research-completed-console" aria-label="已完成研究">';
  html += '<div class="research-label">已完成研究 (' + completed.length + '/' + TECHNOLOGIES.length + ')</div>';
  html += '<div class="completed-techs" role="list">';
  completed.forEach(function (techId) {
    const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
    const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
    html += '<span class="completed-tech-badge" role="listitem" style="border-color:' + cat.color + '" title="' + _escapeHtmlAttr(tech.effectText) + '">' + _escapeHtml(tech.icon + ' ' + tech.name) + '</span>';
  });
  html += '</div></section>';
  container.innerHTML = html;
}

function _renderResearchOverview(state, researchRecommendation, researchBlocker, canApplyResearchDispatch, canResolveResearchBlocker) {
  const dispatchRecommendationHtml = researchRecommendation
    ? _renderResearchDispatchRecommendation(researchRecommendation, canApplyResearchDispatch)
    : _renderResearchDispatchBlocker(researchBlocker, canResolveResearchBlocker, state);

  if (!state.currentResearch) {
    const queueWhenIdle = state.researchQueue || [];
    if (queueWhenIdle.length === 0) {
      return dispatchRecommendationHtml + '<p class="research-hint">🔬 选择一项科技开始研究</p>';
    }
    return dispatchRecommendationHtml + _renderQueueHtml(queueWhenIdle, '🗂️ 研究队列（待启动）');
  }

  const tech = TECHNOLOGIES.find(function (t) { return t.id === state.currentResearch.techId; });
  const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
  const totalDays = tech.researchDays;
  const progress = ((totalDays - state.currentResearch.daysLeft) / totalDays * 100).toFixed(0);

  let html =
    '<div class="research-active" role="region" aria-label="当前研究项目">' +
      '<div class="research-active-header">' +
        '<span class="research-cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
        '<span class="research-days">剩余 ' + state.currentResearch.daysLeft + ' 天</span>' +
      '</div>' +
      '<div class="research-active-name">' + tech.icon + ' ' + tech.name + '</div>' +
      '<div class="mini-bar-track" role="progressbar" aria-label="当前研究进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '" style="margin-top:6px">' +
        '<div class="mini-bar-fill research-fill" style="width:' + progress + '%"></div>' +
      '</div>' +
      '<div class="research-effect-text">' + tech.effectText + '</div>' +
    '</div>';

  html += dispatchRecommendationHtml;

  const queue = state.researchQueue || [];
  if (queue.length > 0) {
    html += _renderQueueHtml(queue, '🗂️ 研究队列（' + queue.length + '）');
  }

  return html;
}

function _renderResearchDispatchRecommendation(recommendation, canApplyResearchDispatch) {
  if (!recommendation) return '';

  const riskLabel = recommendation.inspectionRisk && recommendation.inspectionRisk.protectedByBlackMarket
    ? '0%（辛迪加庇护）'
    : ((recommendation.inspectionRisk && recommendation.inspectionRisk.checkChancePercent) || 0) + '%';
  const roleLabel = recommendation.dispatchProfile && recommendation.dispatchProfile.roleLabel
    ? recommendation.dispatchProfile.roleLabel
    : '标准派遣';
  const surveyIntelNote = recommendation.surveyIntelSummary
    ? '<div class="research-route-note">' + _escapeHtml(recommendation.surveyIntelSummary) + '</div>'
    : '';

  return (
    '<div class="research-route-card">' +
      '<div class="research-route-head">' +
        '<div class="research-route-title">🛰️ 科研补给建议</div>' +
        '<div class="research-route-caption">' + recommendation.focusTypeLabel + ' · ' + recommendation.focusCategoryLabel + '</div>' +
      '</div>' +
      '<div class="research-route-main">' + recommendation.focusTechName + ' · ' + recommendation.buySystemName + ' → ' + recommendation.sellSystemName + ' · ' + recommendation.goodEmoji + ' ' + recommendation.goodName + '</div>' +
      '<div class="research-route-meta">' +
        '<span>预计利润 ' + Math.floor(recommendation.profit) + '</span>' +
        '<span>装载 ' + recommendation.quantity + '</span>' +
        '<span>' + (recommendation.routeModeLabel || '星系内中转') + '</span>' +
        '<span>查获 ' + riskLabel + '</span>' +
      '</div>' +
      '<div class="research-route-note">' + roleLabel + ' · ' + recommendation.strategySummary + (recommendation.tradeThemeSummary ? ' · ' + recommendation.tradeThemeSummary : '') + '</div>' +
      surveyIntelNote +
      (canApplyResearchDispatch
        ? '<div class="research-route-actions">' +
            '<button type="button" class="research-route-apply-btn command-action-btn" data-command-surface="fleet" data-command-intent="科研补给" data-command-verb="带入机库派遣">' +
              renderCommandActionContent({
                actionId: 'dispatch',
                label: '带入机库派遣',
                commandSurface: 'fleet',
                commandIntent: '科研补给',
              }, _escapeHtml) +
            '</button>' +
            '<span class="research-route-action-hint">切到机库并预填这条补给线</span>' +
          '</div>'
        : '') +
    '</div>'
  );
}

function _renderQueueHtml(queue, title) {
  let html = '<div class="research-queue">' +
    '<div class="research-queue-head">' +
      '<div class="research-queue-title">' + title + '</div>' +
      '<button type="button" class="btn-queue-action queue-clear-btn">清空队列</button>' +
    '</div>' +
    '<div class="research-queue-list" role="list">';
  queue.forEach(function (item, idx) {
    const queueTech = TECHNOLOGIES.find(function (t) { return t.id === item.techId; });
    if (!queueTech) return;
    const isLast = idx === queue.length - 1;
    html += '<div class="research-queue-item" role="listitem">' +
      '<span class="queue-index">#' + (idx + 1) + '</span>' +
      '<span class="queue-name">' + queueTech.icon + ' ' + queueTech.name + '</span>' +
      '<span class="queue-days">' + item.daysLeft + ' 天</span>' +
      '<button type="button" class="btn-queue-action queue-up-btn' + (idx === 0 ? ' disabled' : '') + '" data-tech="' + item.techId + '">上移</button>' +
      '<button type="button" class="btn-queue-action queue-down-btn' + (isLast ? ' disabled' : '') + '" data-tech="' + item.techId + '">下移</button>' +
      '<button type="button" class="btn-queue-action queue-cancel-btn" data-tech="' + item.techId + '">取消</button>' +
      '</div>';
  });
  html += '</div></div>';
  return html;
}

function _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue) {
  if (!container) return;

  container.querySelectorAll('.queue-cancel-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onCancelQueuedResearch) onCancelQueuedResearch(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-up-btn:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onMoveQueuedResearchUp) onMoveQueuedResearchUp(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-down-btn:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onMoveQueuedResearchDown) onMoveQueuedResearchDown(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-clear-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!onClearResearchQueue) return;
      var queuedCount = container.querySelectorAll('.research-queue-item').length;
      ActionConfirmUI.open({
        kicker: '研究队列',
        title: '清空全部待研究项目？',
        message: '正在进行的首个项目会保留，其余未开始项目将从队列移除。',
        confirmLabel: '确认清空队列',
        tone: 'warning',
        details: [
          { label: '队列项目', value: queuedCount + ' 项' },
          { label: '未开始项目', value: '移除并返还积分', tone: 'safe' },
        ],
        onConfirm: onClearResearchQueue,
      });
    });
  });
}

function _bindResearchActions(container, onStartResearch, onApplyResearchDispatch, researchRecommendation, onResolveResearchBlocker) {
  container.querySelectorAll('.btn-research').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const card = btn.closest('.research-card');
      onStartResearch(card.dataset.tech);
    });
  });

  var applyBtn = container.querySelector('.research-route-apply-btn');
  if (applyBtn && typeof onApplyResearchDispatch === 'function' && researchRecommendation) {
    applyBtn.addEventListener('click', function () {
      onApplyResearchDispatch(researchRecommendation);
    });
  }

  container.querySelectorAll('.research-route-blocker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (typeof onResolveResearchBlocker !== 'function') return;
      onResolveResearchBlocker({
        actionId: btn.dataset.actionId,
        reasonId: btn.dataset.reasonId,
        targetQuestId: btn.dataset.targetQuestId,
        targetQuestName: btn.dataset.targetQuestName,
        marketWorkspaceId: btn.dataset.marketWorkspaceId,
        marketSubworkspaceId: btn.dataset.marketSubworkspaceId,
        marketFocusLabel: btn.dataset.marketFocusLabel,
        focusTechId: btn.dataset.focusTechId,
        focusTechName: btn.dataset.focusTechName,
      });
    });
  });
}
