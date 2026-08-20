// js/ui/MapExplorationPresenter.js — 星图 POI/勘探流程的纯投影边界
// 不绑定 DOM、不修改游戏状态、不提交领域动作；只输出流程模型与稳定 intent HTML。
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import { buildMapSurveyLauncher } from './MapSurveyDetailPresenter.js';
import {
  getCommandActionAttributes,
  normalizeCommandAction,
  renderCommandActionContent,
} from './CommandAction.js';

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

function _resolvePoiStatus(options, state, systemId, poiId) {
  if (options && typeof options.getPoiStatus === 'function') {
    return options.getPoiStatus(state, systemId, poiId);
  }
  return Exploration.getPoiStatus(state, systemId, poiId);
}

function _resolveSurveySummary(options, state, systemId) {
  if (options && typeof options.getSurveySummary === 'function') {
    return options.getSurveySummary(state, systemId);
  }
  return Exploration.getSurveySummary(state, systemId);
}

function _resolveTravelRouteInfo(options, state, fromSystemId, toSystemId) {
  if (options && typeof options.getTravelRouteInfo === 'function') {
    return options.getTravelRouteInfo(state, fromSystemId, toSystemId);
  }
  return Exploration.getTravelRouteInfo(state, fromSystemId, toSystemId);
}

function _appendFlowNote(flow, text) {
  if (!flow || !text) return;
  flow.secondaryNote = flow.secondaryNote ? (flow.secondaryNote + ' ' + text) : text;
}

function _orderPoisForExploration(pois) {
  if (!Array.isArray(pois) || pois.length <= 1) return pois || [];
  return pois.slice().sort(function (left, right) {
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1;
    return 0;
  });
}

function _buildExplorationActionButton(action, extraClass) {
  if (!action) return '';

  var commandAction = normalizeCommandAction(action);
  var classes = 'planet-detail-action planet-detail-action--command command-action-btn';
  if (extraClass) classes += ' ' + extraClass;
  var disabledAttr = commandAction.disabled ? ' disabled aria-disabled="true"' : '';
  var titleAttr = commandAction.title ? ' title="' + _escapeHtmlAttr(commandAction.title) + '"' : '';
  var commandAttrs = getCommandActionAttributes(commandAction, _escapeHtmlAttr);
  var marketDataset = '';

  if (commandAction.marketWorkspaceId) {
    marketDataset += ' data-market-workspace-id="' + _escapeHtmlAttr(commandAction.marketWorkspaceId) + '"';
  }
  if (commandAction.marketSubworkspaceId) {
    marketDataset += ' data-market-subworkspace-id="' + _escapeHtmlAttr(commandAction.marketSubworkspaceId) + '"';
  }
  if (commandAction.marketFocusLabel) {
    marketDataset += ' data-market-focus-label="' + _escapeHtmlAttr(commandAction.marketFocusLabel) + '"';
  }
  if (commandAction.marketMode) {
    marketDataset += ' data-market-mode="' + _escapeHtmlAttr(commandAction.marketMode) + '"';
  }

  return '<button class="' + classes + '" data-exploration-action="' + _escapeHtmlAttr(commandAction.type || '') + '" data-system-id="' + _escapeHtmlAttr(commandAction.systemId || '') + '"' +
    (commandAction.poiId ? ' data-poi-id="' + _escapeHtmlAttr(commandAction.poiId) + '"' : '') + marketDataset + commandAttrs + disabledAttr + titleAttr + '>' +
    renderCommandActionContent(commandAction, _escapeHtml) +
  '</button>';
}

function _buildExplorationFlowCard(flow, options) {
  if (!flow) return '';

  var opts = options || {};
  var className = opts.cardClass || 'planet-detail-flow-card';
  var includeAction = opts.includeAction !== false;
  var actionHtml = includeAction && flow.nextAction
    ? '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction, opts.actionClass) + '</div>'
    : '';
  var noteHtml = flow.secondaryNote
    ? '<div class="planet-detail-note">' + _escapeHtml(flow.secondaryNote) + '</div>'
    : '';

  return '<div class="' + _escapeHtmlAttr(className) + '">' +
    '<div class="planet-detail-flow-kicker">' + _escapeHtml(flow.phase) + '</div>' +
    '<div class="planet-detail-flow-title">' + _escapeHtml(flow.title) + '</div>' +
    '<div class="planet-detail-flow-text">' + _escapeHtml(flow.detail) + '</div>' +
    actionHtml +
    noteHtml +
  '</div>';
}

function _buildExplorationProgressRow(flow) {
  return '<div class="planet-detail-progress-row">' +
    '<span class="planet-detail-progress-pill">探索点：' + flow.resolvedCount + '/' + flow.totalPois + '</span>' +
    '<span class="planet-detail-progress-pill">隐藏航线：' + flow.discoveredRoutes.length + '</span>' +
  '</div>';
}

function _isDisclosureOpen(options, sectionId, defaultOpen) {
  if (options && typeof options.isDisclosureOpen === 'function') {
    return !!options.isDisclosureOpen(sectionId, defaultOpen);
  }
  return !!defaultOpen;
}

function _buildDisclosure(sectionId, title, bodyHtml, options, presenterOptions) {
  if (!bodyHtml) return '';

  var opts = options || {};
  var className = 'planet-detail-disclosure';
  if (opts.compact) className += ' planet-detail-disclosure--compact';
  var openAttr = _isDisclosureOpen(presenterOptions, sectionId, opts.defaultOpen) ? ' open' : '';
  var previewHtml = opts.preview
    ? '<span class="planet-detail-disclosure-preview">' + _escapeHtml(opts.preview) + '</span>'
    : '';

  return '<details class="' + className + '" data-detail-section="' + _escapeHtmlAttr(sectionId) + '"' + openAttr + '>' +
    '<summary class="planet-detail-disclosure-summary">' +
      '<span class="planet-detail-disclosure-title">' + _escapeHtml(title) + '</span>' +
      previewHtml +
      '<span class="planet-detail-disclosure-caret" aria-hidden="true">▾</span>' +
    '</summary>' +
    '<div class="planet-detail-disclosure-body">' + bodyHtml + '</div>' +
  '</details>';
}

function _buildExplorationActionBlock(flow, sys, state, options) {
  if (!flow || !flow.isCurrentSystem || !flow.nextAction) return '';

  if (flow.nextAction.type !== 'poi' || flow.unresolvedPois.length <= 1) {
    return '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction) + '</div>';
  }

  return '<div class="planet-detail-actions">' + flow.unresolvedPois.map(function (poi) {
    var poiPreview = _resolvePoiStatus(options, state, sys.id, poi.id);
    return _buildExplorationActionButton({
      type: 'poi',
      systemId: sys.id,
      poiId: poi.id,
      label: poiPreview && poiPreview.actionLabel ? poiPreview.actionLabel : ('调查 ' + poi.icon + ' ' + poi.name),
      disabled: !!(poiPreview && !poiPreview.canExplore),
      title: poiPreview && poiPreview.blockedReason ? poiPreview.blockedReason : '',
    });
  }).join('') + '</div>';
}

export function buildMapExplorationFlow(state, sys, planetData, options) {
  var exploration = planetData && planetData.exploration;
  if (!exploration || !sys) return null;

  var opts = options || {};
  var isCurrentSystem = typeof opts.isCurrentSystem === 'boolean'
    ? opts.isCurrentSystem
    : !!(state && state.currentSystem === sys.id);
  var isUnlocked = typeof opts.isUnlocked === 'boolean' ? opts.isUnlocked : true;
  var discoveredPois = (exploration.pois || []).slice();
  var unresolvedPois = _orderPoisForExploration(discoveredPois.filter(function (poi) { return !poi.resolved; }));
  var resolvedPois = discoveredPois.filter(function (poi) { return poi.resolved; });
  var discoveredRoutes = (exploration.secretRoutes || []).filter(function (route) { return route.discovered; });
  var flow = {
    exploration: exploration,
    discoveredPois: discoveredPois,
    unresolvedPois: unresolvedPois,
    resolvedPois: resolvedPois,
    discoveredRoutes: discoveredRoutes,
    resolvedCount: resolvedPois.length,
    totalPois: discoveredPois.length,
    isCurrentSystem: isCurrentSystem,
    roleTag: isCurrentSystem ? '当前停靠' : '悬停预览',
    phase: '',
    title: '',
    detail: '',
    nextAction: null,
    secondaryNote: '',
  };

  if (!isUnlocked) {
    flow.phase = '尚未解锁';
    flow.title = '等级不足，暂时无法展开本地探索';
    flow.detail = '达到 Lv.' + (sys.minLevel || 1) + ' 后才能调查这颗星球的探索点。';
    return flow;
  }

  if (!isCurrentSystem) {
    flow.phase = '抵达后可继续';
    if (unresolvedPois.length > 0) {
      flow.title = '抵达后可继续调查 ' + unresolvedPois.length + ' 个探索点';
      flow.detail = '这颗星球还有未完成的探索内容，靠近后即可继续推进。';
    } else if (discoveredRoutes.length > 0) {
      flow.title = '本地探索已完成';
      flow.detail = '这里已解锁 ' + discoveredRoutes.length + ' 条秘密航线，后续航行会自动享受燃料折扣。';
    } else {
      flow.title = '本地探索已完成';
      flow.detail = '当前没有待处理的探索行动，抵达后可直接前往市场或继续航行。';
    }
    return flow;
  }

  if (unresolvedPois.length > 0) {
    var nextPoi = unresolvedPois[0];
    var nextPoiPreview = _resolvePoiStatus(opts, state, sys.id, nextPoi.id);
    flow.phase = '待调查';
    flow.title = '调查当前航点探索点';
    flow.detail = nextPoiPreview && nextPoiPreview.detailText
      ? (nextPoi.icon + ' ' + nextPoi.name + '：' + nextPoiPreview.detailText)
      : ('优先处理 ' + nextPoi.icon + ' ' + nextPoi.name + '，完成后会自动切换到下一个待办。');
    flow.nextAction = {
      type: 'poi',
      systemId: sys.id,
      poiId: nextPoi.id,
      label: nextPoiPreview && nextPoiPreview.actionLabel ? nextPoiPreview.actionLabel : ('调查 ' + nextPoi.icon + ' ' + nextPoi.name),
      disabled: !!(nextPoiPreview && !nextPoiPreview.canExplore),
      title: nextPoiPreview && nextPoiPreview.blockedReason ? nextPoiPreview.blockedReason : '',
    };
    if (nextPoiPreview && nextPoiPreview.blockedReason && !nextPoiPreview.canExplore) {
      _appendFlowNote(flow, nextPoiPreview.blockedReason);
    }
    if (unresolvedPois.length > 1) {
      _appendFlowNote(flow, '当前还有 ' + unresolvedPois.length + ' 个探索点待调查，可在详情中选择目标。');
    }
    return flow;
  }

  flow.phase = '探索完成';
  if (discoveredRoutes.length > 0) {
    flow.title = '本地探索完成，隐藏航线已加入地图';
    flow.detail = '当前已解锁 ' + discoveredRoutes.length + ' 条秘密航线，之后从这里出发会自动应用燃料折扣。';
  } else {
    flow.title = '本地探索完成';
    flow.detail = '当前星球没有待处理的探索行动，可以继续贸易或前往下一颗星球。';
  }
  return flow;
}

export function buildMapExplorationSection(state, sys, planetData, options) {
  var opts = options || {};
  var flow = buildMapExplorationFlow(state, sys, planetData, opts);
  if (!flow) return '';
  var surveySummary = _resolveSurveySummary(opts, state, sys.id);
  var poiList = _orderPoisForExploration(flow.discoveredPois);

  var poiHtml = poiList.length > 0
    ? poiList.map(function (poi) {
      var badgeText = poi.resolved ? '已调查' : '待调查';
      if (!poi.resolved && flow.unresolvedPois.length > 0 && flow.unresolvedPois[0].id === poi.id) {
        badgeText = '优先';
      }
      var chainLabel = poi.chain && poi.chain.label ? (' · ' + poi.chain.label) : '';
      return '<div class="planet-detail-list-row">' +
        '<span>' + _escapeHtml((poi.icon || '') + ' ' + (poi.name || '') + chainLabel) + '</span>' +
        '<span class="planet-detail-badge">' + badgeText + '</span>' +
      '</div>';
    }).join('')
    : '';

  var routeHtml = flow.discoveredRoutes.length > 0
    ? flow.discoveredRoutes.map(function (route) {
      var routeInfo = _resolveTravelRouteInfo(opts, state, sys.id, route.targetSystemId) || {};
      var fuelMultiplier = routeInfo.active ? routeInfo.fuelMultiplier : (route.fuelMultiplier || 1);
      var discount = Math.round((1 - fuelMultiplier) * 100);
      return '<div class="planet-detail-list-row">' +
        '<span>🛰️ ' + _escapeHtml(route.targetSystemName || route.targetSystemId || '') + '</span>' +
        '<span class="planet-detail-badge">燃料 -' + _escapeHtml(discount) + '%</span>' +
      '</div>';
    }).join('')
    : '';

  var actionHtml = _buildExplorationActionBlock(flow, sys, state, opts);
  var poiPreview = poiList.length > 0
    ? (flow.unresolvedPois.length > 0
      ? ('待处理 ' + flow.unresolvedPois.length + ' / 已发现 ' + poiList.length)
      : ('已处理 ' + poiList.length + ' 个'))
    : '暂无探索点';
  var routePreview = flow.discoveredRoutes.length > 0
    ? (flow.discoveredRoutes.length + ' 条已录入')
    : '未发现';

  return '<div class="planet-detail-section planet-detail-wide">' +
    '<div class="planet-detail-section-head">' +
      '<div class="planet-detail-section-title">探索流程</div>' +
      '<span class="planet-detail-chip">' + _escapeHtml(flow.roleTag) + '</span>' +
    '</div>' +
    _buildExplorationFlowCard(flow, { includeAction: false }) +
    _buildExplorationProgressRow(flow) +
    actionHtml +
    buildMapSurveyLauncher(surveySummary, sys) +
    _buildDisclosure('poi', '探索点清单', poiHtml ? '<div class="planet-detail-list">' + poiHtml + '</div>' : '', {
      preview: poiPreview,
      defaultOpen: false,
    }, opts) +
    _buildDisclosure('routes', '秘密航线', routeHtml ? '<div class="planet-detail-list">' + routeHtml + '</div>' : '', {
      preview: routePreview,
      defaultOpen: false,
    }, opts) +
  '</div>';
}
