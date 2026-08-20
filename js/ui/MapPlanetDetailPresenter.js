// js/ui/MapPlanetDetailPresenter.js — 星球摘要、航线焦点与局部行动的纯投影
// 不绑定 DOM、不修改 state、不触发 travel/POI；只返回不可变 view 与 intent。
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import { GOODS } from '../data/goods.js';
import {
  GALAXY_JUMP_DAYS,
  findGalaxy,
  findSystem,
  getSystemAccessState,
} from '../data/systems.js';
import { buildMapExplorationSection } from './MapExplorationPresenter.js';
import { buildWorkspaceActionSlot } from './WorkspaceActionSlot.js';

const _goodsById = GOODS.reduce(function (lookup, good) {
  lookup[good.id] = good;
  return lookup;
}, Object.create(null));

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
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

function _getGoodName(goodId) {
  var good = goodId ? _goodsById[goodId] : null;
  return good ? good.name : goodId;
}

function _getSafetyLabel(score) {
  if (score >= 80) return '安定';
  if (score >= 60) return '可控';
  if (score >= 40) return '紧张';
  return '危险';
}

function _buildChip(text, tone) {
  if (!text) return '';
  var className = 'planet-detail-chip';
  if (tone) className += ' planet-detail-chip--' + tone;
  return '<span class="' + className + '" role="listitem">' + _escapeHtml(text) + '</span>';
}

function _buildKeyCard(label, value, options) {
  if (!label || !value) return '';
  var opts = options || {};
  var className = 'planet-detail-key-card';
  if (opts.wide) className += ' planet-detail-key-card--wide';
  if (opts.tone) className += ' planet-detail-key-card--' + opts.tone;
  return '<div class="' + className + '">' +
    '<div class="planet-detail-key-label">' + _escapeHtml(label) + '</div>' +
    '<div class="planet-detail-key-value">' + _escapeHtml(value) + '</div>' +
  '</div>';
}

function _buildSummaryShell(sys, galaxy, heroChips, heroGrid, isPinned) {
  var titleId = 'planet-detail-title-' + _escapeHtmlAttr(sys.id);
  var kicker = isPinned ? 'LOCKED STARMAP NODE' : 'STARMAP NODE PREVIEW';
  return '<section class="planet-detail-shell" aria-labelledby="' + titleId + '">' +
    '<header class="planet-detail-hero planet-detail-wide">' +
      '<div class="planet-detail-kicker">' + kicker + '</div>' +
      '<div class="planet-detail-title-row">' +
        '<h3 id="' + titleId + '" class="planet-detail-title">🪐 ' + _escapeHtml(sys.name) + '</h3>' +
        '<span class="planet-detail-galaxy-tag">' + _escapeHtml(galaxy ? (galaxy.icon + ' ' + galaxy.name) : '未知星系') + '</span>' +
      '</div>' +
      '<div class="planet-detail-chip-row" role="list" aria-label="航点状态">' + heroChips + '</div>' +
      '<p class="planet-detail-desc">' + _escapeHtml(sys.description) + '</p>' +
    '</header>' +
    '<section class="planet-detail-summary-grid" aria-label="航点摘要">' + heroGrid + '</section>';
}

function _buildActionShelf(actionHtml, guideFocus) {
  if (!actionHtml) return '';
  return '<section class="planet-detail-action-shelf" aria-label="' + (guideFocus ? '航线焦点行动' : '航点行动') + '">' + actionHtml + '</section>';
}

function _buildField(label, value) {
  if (!label || !value) return '';
  return '<div class="planet-detail-item planet-detail-item--wrap">' +
    '<span class="planet-detail-label">' + _escapeHtml(label) + '</span>' + _escapeHtml(value) +
  '</div>';
}

function _isDisclosureOpen(options, sectionId, defaultOpen) {
  return options && typeof options.isDisclosureOpen === 'function'
    ? !!options.isDisclosureOpen(sectionId, defaultOpen)
    : !!defaultOpen;
}

function _buildDisclosure(sectionId, title, bodyHtml, disclosureOptions, presenterOptions) {
  if (!bodyHtml) return '';
  var opts = disclosureOptions || {};
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

function _buildArchiveDisclosure(info, options) {
  var archiveHtml = '<div class="planet-detail-archive-grid">' +
    _buildField('居民', info.races) +
    _buildField('人口', info.population) +
    _buildField('政体', info.government) +
    _buildField('治安', info.safety) +
    _buildField('解锁', info.lockText) +
  '</div>';
  return _buildDisclosure('archive', '星球档案', archiveHtml, {
    preview: info.population,
    defaultOpen: false,
  }, options);
}

function _buildNavigationGuideBanner(guideFocus, sys) {
  if (!guideFocus || !sys) return '';
  var goodName = guideFocus.goodId ? _getGoodName(guideFocus.goodId) : '';
  return '<div class="planet-detail-guide-banner">' +
    '<span class="planet-detail-guide-kicker">航线焦点</span>' +
    '<strong class="planet-detail-guide-title">前往 ' + _escapeHtml(sys.name) + '</strong>' +
    '<span class="planet-detail-guide-text">' +
      (goodName ? ('抵达后打开市场，卖出「' + _escapeHtml(goodName) + '」。') : '抵达后处理本地贸易目标。') +
    '</span>' +
  '</div>';
}

function _getGuideRouteRiskLabel(state, fuelCost, fuelLeft, crossGalaxy, routeInfo, travelAction) {
  if (travelAction && travelAction.disabled) return '暂不可达';
  if (fuelLeft < 0) return '燃料不足';
  var maxFuel = Math.max(1, Number(state && state.maxFuel) || 1);
  if (fuelLeft <= Math.max(5, Math.round(maxFuel * 0.15))) return '燃料紧张';
  if (routeInfo && routeInfo.active) return '隐藏航线省油';
  if (crossGalaxy) return '跃迁航线';
  if (fuelCost <= 8) return '短程直航';
  return '常规直航';
}

function _buildNavigationGuideRoutePlan(state, sys, guideFocus, travelAction) {
  if (!guideFocus || !state || !sys) return '';
  var current = findSystem(state.currentSystem);
  if (!current) return '';

  var isCurrentSystem = current.id === sys.id;
  var crossGalaxy = current.galaxyId !== sys.galaxyId;
  var routeInfo = isCurrentSystem ? null : Exploration.getTravelRouteInfo(state, current.id, sys.id);
  var fuelCost = isCurrentSystem ? 0 : Economy.getFuelCost(current.id, sys.id, state.fuelEfficiency || 1, state);
  var etaDays = isCurrentSystem ? 0 : (crossGalaxy ? GALAXY_JUMP_DAYS : 1);
  var currentFuel = Math.floor(Number(state.fuel) || 0);
  var fuelLeft = currentFuel - fuelCost;
  var riskLabel = _getGuideRouteRiskLabel(state, fuelCost, fuelLeft, crossGalaxy, routeInfo, travelAction);
  var routeMode = routeInfo && routeInfo.active
    ? ('秘密航线 · 燃料 -' + Math.round((1 - routeInfo.fuelMultiplier) * 100) + '%')
    : (crossGalaxy ? '跨星系跃迁' : '星图直航');
  var goodName = guideFocus.goodId ? _getGoodName(guideFocus.goodId) : '';
  var cargoQuantity = guideFocus.goodId && state.cargo ? Math.max(0, state.cargo[guideFocus.goodId] || 0) : 0;
  var cargoCost = guideFocus.goodId && state.cargoCost ? Math.max(0, state.cargoCost[guideFocus.goodId] || 0) : 0;
  var averageCost = cargoQuantity > 0 ? cargoCost / cargoQuantity : 0;
  var expectedSellPrice = guideFocus.goodId ? Economy.getSellPrice(sys.id, guideFocus.goodId, state) : 0;
  var fuelReplacementCost = isCurrentSystem ? 0 : fuelCost * Economy.getBuyPrice(sys.id, 'fuel', state);
  var expectedNetProfit = cargoQuantity > 0
    ? Math.round((expectedSellPrice - averageCost) * cargoQuantity - fuelReplacementCost)
    : 0;
  var localFollowup = goodName
    ? ('抵达后打开市场，确认卖出「' + goodName + '」并核对结算。')
    : '抵达后可处理本地事务。';

  return '<div class="planet-detail-guide-route" data-planet-guide-route>' +
    '<div class="planet-detail-guide-route-grid">' +
      '<div class="planet-detail-guide-route-card"><span>燃料</span><strong>' + _escapeHtml(fuelCost + ' / 余 ' + Math.max(0, fuelLeft)) + '</strong></div>' +
      '<div class="planet-detail-guide-route-card"><span>预计</span><strong>' + _escapeHtml(etaDays + ' 天') + '</strong></div>' +
      '<div class="planet-detail-guide-route-card"><span>风险</span><strong>' + _escapeHtml(riskLabel) + '</strong></div>' +
      (goodName
        ? '<div class="planet-detail-guide-route-card"><span>卖价</span><strong>' + _escapeHtml(expectedSellPrice + ' / 单位') + '</strong></div>' +
          '<div class="planet-detail-guide-route-card"><span>预计净利</span><strong>' + _escapeHtml((expectedNetProfit >= 0 ? '+' : '') + expectedNetProfit) + '</strong></div>'
        : '') +
    '</div>' +
    '<div class="planet-detail-guide-route-foot"><span>' + _escapeHtml(routeMode) + '</span><span>' + _escapeHtml(localFollowup) + '</span></div>' +
  '</div>';
}

function _buildPinnedActions(travelAction, guideFocus) {
  var actions = [];
  if (travelAction) {
    var actionClass = 'planet-detail-action' + (guideFocus ? ' planet-detail-action--guide-target' : '');
    var actionLabel = guideFocus && !travelAction.disabled ? '前往卖货点' : travelAction.label;
    actions.push({
      id: 'travel',
      label: actionLabel,
      disabled: travelAction.disabled,
      title: travelAction.title,
      className: actionClass,
      attributes: {
        'data-planet-detail-action': 'travel',
        'data-system-id': travelAction.systemId,
      },
    });
  }
  actions.push({
    id: 'close-detail',
    label: '收起详情',
    variant: 'quiet',
    className: 'planet-detail-action planet-detail-action--quiet',
    attributes: { 'data-planet-detail-action': 'close-detail' },
  });
  return buildWorkspaceActionSlot({
    workspaceId: 'map',
    contextType: 'planet',
    contextId: travelAction && travelAction.systemId,
    label: guideFocus ? '航线焦点局部操作' : '航点局部操作',
    className: 'planet-detail-action-shelf planet-detail-local-action-slot',
    actionsClassName: 'planet-detail-actions planet-detail-actions--panel',
    noteClassName: 'planet-detail-note planet-detail-note--hint',
    actions: actions,
    note: guideFocus
      ? '点击“前往卖货点”出航；抵达后在市场处理卖出。'
      : (travelAction && travelAction.hint ? travelAction.hint : ''),
  });
}

function _buildHoverSummaryNote(travelAction, isCurrentSystem) {
  var message = isCurrentSystem
    ? '点击锁定本地探索详情。'
    : (travelAction && travelAction.hint ? travelAction.hint : '点击锁定这颗星球的详细信息。');
  return '<div class="planet-detail-note planet-detail-note--hint">' + _escapeHtml(message) + '</div>';
}

export function buildMapPlanetTravelAction(state, sys) {
  if (!state || !sys) return null;
  var playerLevel = state.playerLevel || 1;
  var systemAccess = getSystemAccessState(sys.id, playerLevel, state.researchedTechs || []);
  if (!systemAccess.unlocked) {
    var galaxyAccess = systemAccess.galaxyAccess;
    if (!galaxyAccess.unlocked) {
      var galaxyName = galaxyAccess.galaxy ? galaxyAccess.galaxy.name : '目标星系';
      return Object.freeze({
        type: 'travel', systemId: sys.id, label: '星系未开放', disabled: true,
        title: galaxyName + ' 需 Lv.' + galaxyAccess.requiredLevel + ' 解锁',
        hint: galaxyAccess.techRequired
          ? ('达到 Lv.' + galaxyAccess.requiredLevel + ' 或研究超空间跃迁后，可提前进入该星系入口层。')
          : ('达到 Lv.' + galaxyAccess.requiredLevel + ' 后，才可切换到该星系。'),
      });
    }
    return Object.freeze({
      type: 'travel', systemId: sys.id, label: '等级不足', disabled: true,
      title: '需 Lv.' + systemAccess.requiredLevel + '（当前 Lv.' + playerLevel + '）',
      hint: galaxyAccess.unlockedBy === 'tech'
        ? '超空间跃迁仅提前开放入口层；这颗高阶星球仍需达到对应等级。'
        : '达到对应等级后才能前往这颗星球。',
    });
  }
  if (sys.id === state.currentSystem) {
    return Object.freeze({
      type: 'travel', systemId: sys.id, label: '当前停靠中', disabled: true,
      title: '你已经停靠在这颗星球。', hint: '这里已展开探索详情，可以直接调查探索点。',
    });
  }
  var activeShip = Array.isArray(state.fleet) ? state.fleet[state.activeShipIndex || 0] : null;
  if (activeShip && activeShip.repairJob && activeShip.repairJob.remainingDays > 0) {
    return Object.freeze({
      type: 'travel', systemId: sys.id, label: '维修中', disabled: true,
      title: '当前飞船仍在维修中', hint: '剩余 ' + activeShip.repairJob.remainingDays + ' 天，维修完成后方可出航。',
    });
  }
  var crossGalaxy = sys.galaxyId !== state.currentGalaxy;
  return Object.freeze({
    type: 'travel', systemId: sys.id,
    label: crossGalaxy ? '跃迁前往' : '前往该星球', disabled: false,
    title: crossGalaxy ? '跨星系跳转到该星球' : '前往该星球',
    hint: crossGalaxy
      ? '单击先看详情，再次点击同一星球或按钮可立即跃迁。'
      : '单击先看详情，再次点击同一星球或按钮可立即前往。',
  });
}

export function buildMapPlanetDetailView(state, systemId, options) {
  if (!state || !systemId) return null;
  var opts = options || {};
  var sys = opts.system || findSystem(systemId);
  if (!sys) return null;
  var galaxy = opts.galaxy || findGalaxy(sys.galaxyId);
  var planetData = opts.planetData || GalaxyData.getPlanetData(systemId);
  var details = sys.details || {};
  var races = (details.population || []).map(function (population) {
    return (population.icon || '') + (population.name || '') + '(' + population.percentage + '%)';
  }).join('、') || '未知';
  var government = details.government ? (details.government.name + ' · ' + details.government.style) : '未知政体';
  var specialties = (details.specialties || []).join('、') || '暂无';
  var safety = typeof details.safety === 'number'
    ? (details.safety + ' / 100（' + _getSafetyLabel(details.safety) + '）')
    : '未知';
  var faction = Faction.getFactionForSystem(sys.id);
  var factionText = '🛰️ 独立星区';
  var relationText = '🙂 中立 (0)';
  if (faction) {
    var relation = Faction.getRelation(state, faction.id);
    var level = Faction.getLevel(state, faction.id);
    factionText = faction.icon + ' ' + faction.name;
    relationText = level.emoji + ' ' + level.name + ' (' + (relation >= 0 ? '+' : '') + relation + ')';
  }

  var playerLevel = state.playerLevel || 1;
  var systemAccess = getSystemAccessState(sys.id, playerLevel, state.researchedTechs || []);
  var isUnlocked = systemAccess.unlocked;
  var isCurrentSystem = systemId === state.currentSystem;
  var isPinned = opts.selectedSystemId === systemId;
  var guideFocus = opts.navigationGuideFocus && opts.navigationGuideFocus.systemId === systemId
    ? Object.freeze(Object.assign({}, opts.navigationGuideFocus))
    : null;
  var lockText = isUnlocked
    ? (systemAccess.unlockedBy === 'tech-entry' ? '超空间入口已开放' : '已解锁')
    : ('需 Lv.' + (sys.minLevel || 1) + '（当前 Lv.' + playerLevel + '）');
  var safetyChipText = typeof details.safety === 'number' ? ('治安 ' + _getSafetyLabel(details.safety)) : '治安未知';
  var safetyTone = typeof details.safety === 'number'
    ? (details.safety >= 80 ? 'stable' : (details.safety >= 60 ? 'accent' : (details.safety >= 40 ? 'warning' : 'danger')))
    : 'muted';
  var heroChipParts = [
    _buildChip(sys.typeLabel, 'accent'),
    _buildChip(isCurrentSystem ? '当前停靠' : '悬停预览', isCurrentSystem ? 'accent' : 'muted'),
    _buildChip(safetyChipText, safetyTone),
    _buildChip(lockText, isUnlocked ? 'stable' : 'warning'),
  ];
  if (guideFocus) heroChipParts.push(_buildChip(guideFocus.goodId ? ('卖出 ' + _getGoodName(guideFocus.goodId)) : '导航目标', 'warning'));
  var heroGrid = '<div class="planet-detail-key-grid">' +
    _buildKeyCard('势力', factionText) +
    _buildKeyCard('友好度', relationText) +
    _buildKeyCard('特产', specialties, { wide: true }) +
  '</div>';
  var travelAction = buildMapPlanetTravelAction(state, sys);
  var summaryHtml = _buildSummaryShell(sys, galaxy, heroChipParts.join(''), heroGrid, isPinned) +
    _buildNavigationGuideBanner(guideFocus, sys) +
    _buildNavigationGuideRoutePlan(state, sys, guideFocus, travelAction) +
    (isPinned ? '' : _buildActionShelf(_buildHoverSummaryNote(travelAction, isCurrentSystem), guideFocus)) +
    '</section>';
  var archiveDisclosure = _buildArchiveDisclosure({
    races: races,
    population: details.totalPopulation || '未知',
    government: government,
    safety: safety,
    lockText: lockText,
  }, opts);
  var detailBodyHtml = summaryHtml + (isPinned
    ? (buildMapExplorationSection(state, sys, planetData, {
      isCurrentSystem: isCurrentSystem,
      isUnlocked: isUnlocked,
      getPoiStatus: opts.getPoiStatus,
      getSurveySummary: opts.getSurveySummary,
      getTravelRouteInfo: opts.getTravelRouteInfo,
      isDisclosureOpen: opts.isDisclosureOpen,
    }) + archiveDisclosure)
    : '');
  var html = isPinned
    ? ('<div class="planet-detail-scroll-body">' + detailBodyHtml + '</div>' +
      _buildPinnedActions(travelAction, guideFocus))
    : detailBodyHtml;

  return Object.freeze({
    anchor: Object.freeze({ x: Number(sys.x) || 0, y: Number(sys.y) || 0 }),
    guideFocus: guideFocus,
    html: html,
    isCurrentSystem: isCurrentSystem,
    isPinned: isPinned,
    isUnlocked: isUnlocked,
    systemId: sys.id,
    titleId: 'planet-detail-title-' + _escapeHtmlAttr(sys.id),
    travelAction: travelAction,
  });
}
