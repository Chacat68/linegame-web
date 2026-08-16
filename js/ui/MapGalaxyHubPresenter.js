// js/ui/MapGalaxyHubPresenter.js — 星系总览只读模型与 HTML 投影

import { GOODS } from '../data/goods.js';
import {
  GALAXIES,
  findGalaxy,
  getAccessibleGalaxies,
  getAccessibleSystems,
  getGalaxyAccessState,
  getSystemsByGalaxy,
} from '../data/systems.js';

const GOODS_BY_ID = GOODS.reduce(function (lookup, good) {
  lookup[good.id] = good;
  return lookup;
}, Object.create(null));

function _escapeHtml(value) {
  return String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _escapeHtmlAttr(value) {
  return _escapeHtml(value).replace(/`/g, '&#096;');
}

function _formatTradeGoods(goodIds) {
  if (!Array.isArray(goodIds) || goodIds.length === 0) return '综合供需';
  return goodIds.map(function (goodId) {
    var good = GOODS_BY_ID[goodId];
    return good ? (good.emoji + ' ' + good.name) : goodId;
  }).join(' · ');
}

function _tradeProfileSummary(galaxy) {
  var tradeProfile = galaxy && galaxy.tradeProfile;
  if (!tradeProfile) return '综合供需，适合作为中转市场';
  return '主供 ' + _formatTradeGoods(tradeProfile.exports) + '；高价收 ' + _formatTradeGoods(tradeProfile.imports);
}

function _chip(text, tone) {
  return '<span class="planet-detail-chip planet-detail-chip--' + _escapeHtmlAttr(tone || 'muted') + '">' +
    _escapeHtml(text) +
  '</span>';
}

function _keyCard(label, value, options) {
  var className = 'planet-detail-key-card';
  if (options && options.wide) className += ' planet-detail-key-card--wide';
  return '<div class="' + className + '">' +
    '<span class="planet-detail-key-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="planet-detail-key-value">' + _escapeHtml(value) + '</strong>' +
  '</div>';
}

function _visitedGalaxies(state) {
  if (Array.isArray(state.visitedGalaxies) && state.visitedGalaxies.length > 0) {
    return state.visitedGalaxies.slice();
  }
  return state.currentGalaxy ? [state.currentGalaxy] : [];
}

function _buildGalaxyCardModel(state, galaxy, focusGalaxyId, visitedGalaxies) {
  var playerLevel = state.playerLevel || 1;
  var researchedTechs = state.researchedTechs || [];
  var access = getGalaxyAccessState(galaxy.id, playerLevel, researchedTechs);
  var isCurrent = galaxy.id === state.currentGalaxy;
  var isVisited = visitedGalaxies.indexOf(galaxy.id) !== -1;
  var unlockedByTech = access.unlockedBy === 'tech' && playerLevel < access.requiredLevel;
  return Object.freeze({
    id: galaxy.id,
    icon: galaxy.icon,
    name: galaxy.name,
    current: isCurrent,
    focused: galaxy.id === focusGalaxyId,
    visited: isVisited,
    unlocked: access.unlocked,
    unlockedByTech: unlockedByTech,
    requiredLevel: access.requiredLevel,
    accessibleSystemCount: getAccessibleSystems(galaxy.id, playerLevel, researchedTechs).length,
    systemCount: getSystemsByGalaxy(galaxy.id).length,
    tradeSummary: _tradeProfileSummary(galaxy),
    note: access.unlocked
      ? (unlockedByTech
        ? '跃迁科技已提前开放'
        : (isCurrent ? '当前驻留，可返回本地星图' : '航线已开放，可进入查看'))
      : (access.techRequired
        ? ('需 Lv.' + access.requiredLevel + ' 或超空间跃迁')
        : ('需达到 Lv.' + access.requiredLevel)),
    buttonLabel: access.unlocked
      ? (isCurrent ? '查看当前星系' : '进入该星系')
      : ('Lv.' + access.requiredLevel + ' 开放'),
  });
}

export function buildGalaxyHubModel(state, options) {
  var source = state || {};
  var config = options || {};
  var playerLevel = source.playerLevel || 1;
  var researchedTechs = source.researchedTechs || [];
  var currentGalaxy = findGalaxy(source.currentGalaxy || 'milky_way') || GALAXIES[0];
  var focusGalaxy = findGalaxy(config.focusGalaxyId || source.currentGalaxy || 'milky_way') || currentGalaxy;
  var focusAccess = getGalaxyAccessState(focusGalaxy.id, playerLevel, researchedTechs);
  var visitedGalaxies = _visitedGalaxies(source);
  var focusSystems = getSystemsByGalaxy(focusGalaxy.id);
  var focusAccessibleSystems = getAccessibleSystems(focusGalaxy.id, playerLevel, researchedTechs);
  var galaxyCards = GALAXIES.slice().sort(function (left, right) {
    var levelDifference = (left.minLevel || 1) - (right.minLevel || 1);
    return levelDifference || left.name.localeCompare(right.name, 'zh-CN');
  }).map(function (galaxy) {
    return _buildGalaxyCardModel(source, galaxy, focusGalaxy.id, visitedGalaxies);
  });

  return Object.freeze({
    playerLevel: playerLevel,
    currentGalaxy: Object.freeze({ id: currentGalaxy.id, icon: currentGalaxy.icon, name: currentGalaxy.name }),
    focusGalaxy: Object.freeze({
      id: focusGalaxy.id,
      icon: focusGalaxy.icon,
      name: focusGalaxy.name,
      description: focusGalaxy.description || '',
      tradeSummary: _tradeProfileSummary(focusGalaxy),
      accessibleSystemCount: focusAccessibleSystems.length,
      systemCount: focusSystems.length,
      unlocked: focusAccess.unlocked,
      unlockText: focusAccess.unlocked
        ? (focusAccess.unlockedBy === 'tech' && playerLevel < focusAccess.requiredLevel
          ? '科技提前开放'
          : '已开放')
        : ('Lv.' + focusAccess.requiredLevel + ' 开放'),
    }),
    accessibleGalaxyCount: getAccessibleGalaxies(playerLevel, researchedTechs).length,
    galaxyCount: GALAXIES.length,
    visitedGalaxyCount: visitedGalaxies.length,
    hovered: !!config.focusGalaxyId,
    cards: Object.freeze(galaxyCards),
  });
}

function _renderGalaxyCard(card) {
  var className = 'galaxy-switcher-card';
  if (!card.unlocked) className += ' galaxy-switcher-card--locked';
  if (card.current) className += ' galaxy-switcher-card--current';
  if (card.focused) className += ' galaxy-switcher-card--focus';
  var disabled = card.unlocked ? '' : ' disabled aria-disabled="true"';
  return '<article class="' + className + '"' + (card.current ? ' aria-current="location"' : '') + '>' +
    '<div class="galaxy-switcher-card-head">' +
      '<div class="galaxy-switcher-card-title">' + _escapeHtml(card.icon + ' ' + card.name) + '</div>' +
      '<div class="galaxy-switcher-card-meta">可探索 ' + card.accessibleSystemCount + ' / ' + card.systemCount + '</div>' +
    '</div>' +
    '<div class="galaxy-switcher-card-status">' +
      '<div class="planet-detail-chip-row">' +
        _chip(card.unlocked ? (card.current ? '当前星系' : '已开放') : ('Lv.' + card.requiredLevel + ' 开放'), card.unlocked ? (card.current ? 'accent' : 'stable') : 'warning') +
        _chip(card.visited ? '已访问' : '未访问', 'muted') +
      '</div>' +
      '<span class="planet-detail-note galaxy-switcher-note">' + _escapeHtml(card.note) + '</span>' +
    '</div>' +
    '<div class="galaxy-switcher-signal">' + _escapeHtml(card.tradeSummary) + '</div>' +
    '<div class="planet-detail-actions galaxy-switcher-actions">' +
      '<button class="planet-detail-action" type="button" data-galaxy-action="open" data-galaxy-id="' + _escapeHtmlAttr(card.id) + '"' + disabled + '>' + _escapeHtml(card.buttonLabel) + '</button>' +
    '</div>' +
  '</article>';
}

export function renderGalaxyHub(model) {
  var view = model || buildGalaxyHubModel({});
  var focus = view.focusGalaxy;
  return '<section class="galaxy-hub-shell" aria-labelledby="galaxy-hub-title">' +
    '<header class="galaxy-hub-toolbar">' +
      '<div class="galaxy-hub-toolbar-copy">' +
        '<span class="planet-detail-kicker">GALAXY NAVIGATION</span>' +
        '<h3 id="galaxy-hub-title" class="planet-detail-title">星系总览</h3>' +
      '</div>' +
      '<button class="planet-detail-action planet-detail-action--quiet galaxy-hub-return" type="button" data-galaxy-action="return-planets">返回星球</button>' +
    '</header>' +
    '<div class="galaxy-hub-focus planet-detail-hero planet-detail-wide" aria-label="星系导航重点">' +
      '<div class="planet-detail-kicker">当前查看</div>' +
      '<div class="planet-detail-title">' + _escapeHtml(focus.icon + ' ' + focus.name) + '</div>' +
      '<div class="planet-detail-chip-row">' +
        _chip('Lv.' + view.playerLevel, 'accent') +
        _chip('已开放 ' + view.accessibleGalaxyCount + ' / ' + view.galaxyCount, 'stable') +
        _chip('已访问 ' + view.visitedGalaxyCount + ' 个', 'muted') +
        _chip(focus.unlockText, focus.unlocked ? 'stable' : 'warning') +
      '</div>' +
      '<div class="planet-detail-desc">' + _escapeHtml(focus.description) + '</div>' +
      '<div class="planet-detail-key-grid">' +
        _keyCard('当前驻留', view.currentGalaxy.icon + ' ' + view.currentGalaxy.name) +
        _keyCard('当前星系', focus.icon + ' ' + focus.name) +
        _keyCard('可探索星球', focus.accessibleSystemCount + ' / ' + focus.systemCount) +
        _keyCard('切换方式', '点击星云或使用目录按钮进入', { wide: true }) +
        _keyCard('低买高卖线索', focus.tradeSummary, { wide: true }) +
      '</div>' +
      '<div class="planet-detail-note planet-detail-note--hint">点击星系总览里的星云模型，或直接使用下方目录按钮，即可切换到已开放的新星系。</div>' +
    '</div>' +
    '<div class="planet-detail-section galaxy-hub-directory planet-detail-wide">' +
      '<div class="planet-detail-section-head">' +
        '<div class="planet-detail-section-title">星系跃迁目录</div>' +
        _chip(view.hovered ? '鼠标所指' : '当前导航', 'muted') +
      '</div>' +
      '<div class="galaxy-switcher-list">' + view.cards.map(_renderGalaxyCard).join('') + '</div>' +
    '</div>' +
  '</section>';
}

export function buildGalaxyHubPanel(state, options) {
  return renderGalaxyHub(buildGalaxyHubModel(state, options));
}
