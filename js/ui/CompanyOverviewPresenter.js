// js/ui/CompanyOverviewPresenter.js — Header 公司身份与机库经营概览投影

import * as PlayerLevels from '../data/playerLevels.js';
import { getCompanyLevelValue, getCompanyPrivilegeSummary } from '../data/companyAccess.js';

const PLAYER_LEVELS = PlayerLevels.PLAYER_LEVELS || [];
const COMPANY_LEVELS = PlayerLevels.COMPANY_LEVELS || [
  { level: 1, title: '新创企业', expRequired: 0, icon: '🏢' },
];
const getCompanyLevel = PlayerLevels.getCompanyLevel || function () { return COMPANY_LEVELS[0]; };

function _resolveDocument(source) {
  if (source && typeof source.getElementById === 'function') return source;
  return typeof document === 'undefined' ? null : document;
}

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _permissionMetric(label, value, note, toneClass) {
  return '<div class="company-permission-metric' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span>' + _escapeHtml(label) + '</span>' +
    '<strong>' + _escapeHtml(value) + '</strong>' +
    '<small>' + _escapeHtml(note) + '</small>' +
  '</div>';
}

function _formatPrivilegeCaps(summary) {
  if (!summary || !summary.caps) return '权限摘要暂不可用';
  var stations = summary.caps.tradeStations || {};
  var stationLevel = summary.caps.tradeStationLevel || {};
  var fleetSlots = summary.caps.fleetSlots || {};
  return '贸易站 ' + (stations.label || '未开放') +
    ' · 贸易站等级 ' + (stationLevel.label || '未开放') +
    ' · 舰船位置 ' + (fleetSlots.used || 1) + '/' + (fleetSlots.max || 1);
}

function _renderPlayerLevel(state, doc) {
  var panel = doc.getElementById('player-level-panel');
  if (!panel) return;
  var level = PlayerLevels.getLevel(state.experience || 0);
  var nextLevel = PLAYER_LEVELS.find(function (entry) { return entry.level === level.level + 1; });
  var expCurrent = (state.experience || 0) - level.expRequired;
  var expNeed = nextLevel ? (nextLevel.expRequired - level.expRequired) : 1;
  var percent = nextLevel ? Math.min(100, (expCurrent / expNeed) * 100) : 100;
  panel.innerHTML =
    '<span class="level-icon">' + _escapeHtml(level.icon) + '</span>' +
    '<span class="level-title">' + _escapeHtml(level.title) + ' Lv.' + level.level + '</span>' +
    '<div class="level-bar-track"><div class="level-bar-fill" style="width:' + percent + '%"></div></div>';
}

function _renderUnlockRoadmap(state, doc) {
  var roadmap = doc.getElementById('company-unlock-roadmap');
  if (!roadmap) return;
  var currentLevel = getCompanyLevelValue(state || {});
  var summary = getCompanyPrivilegeSummary(state || {});
  var fleetSlots = summary.caps.fleetSlots || {};
  var tradeStations = summary.caps.tradeStations || {};
  var stationLevel = summary.caps.tradeStationLevel || {};
  var fleetAvailable = Math.max(0, (fleetSlots.max || 0) - (fleetSlots.used || 0));
  var milestone = summary.nextMilestone;
  var focusTone = milestone ? (summary.progressRatio >= 0.75 ? 'near' : 'locked') : 'open';
  var focusTitle = milestone ? ('Lv.' + milestone.level + ' · ' + milestone.title) : '核心权限全部开放';
  var focusNote = milestone
    ? (milestone.items.slice(0, 4).join(' · ') + ' · 还需 ' + summary.expToNext + ' 公司经验')
    : _formatPrivilegeCaps(summary);

  roadmap.innerHTML =
    '<div class="company-permission-head">' +
      '<div><span class="company-permission-kicker">公司功能</span><strong class="company-permission-title">等级开放功能</strong></div>' +
      '<span class="company-permission-level">Lv.' + _escapeHtml(currentLevel) + '</span>' +
    '</div>' +
    '<div class="company-permission-grid" role="list" aria-label="公司功能容量">' +
      _permissionMetric('舰船位置', (fleetSlots.used || 0) + '/' + (fleetSlots.max || 0), '还有 ' + fleetAvailable + ' 个位置', fleetAvailable > 0 ? 'tone-open' : 'tone-full') +
      _permissionMetric('贸易站', tradeStations.label || '未开放', tradeStations.unlocked ? ('空余 ' + (tradeStations.available || 0) + ' 站') : '等级权限未开放', tradeStations.unlocked && !tradeStations.full ? 'tone-open' : 'tone-full') +
      _permissionMetric('贸易站等级', stationLevel.label || '未开放', '当前等级上限', stationLevel.max > 0 ? 'tone-open' : 'tone-full') +
    '</div>' +
    '<div class="company-permission-focus" data-tone="' + focusTone + '" role="status">' +
      '<span class="company-permission-focus-kicker">' + (milestone ? '下一级开放' : '当前状态') + '</span>' +
      '<strong>' + _escapeHtml(focusTitle) + '</strong>' +
      '<small>' + _escapeHtml(focusNote) + '</small>' +
    '</div>';
}

export function renderCompanyNetWorth(netWorth, documentSource) {
  var doc = _resolveDocument(documentSource);
  var element = doc && doc.getElementById('net-worth');
  if (!element) return false;
  var value = Number.isFinite(Number(netWorth)) ? Math.floor(Number(netWorth)) : 0;
  element.textContent = value.toLocaleString();
  element.setAttribute('title', '公司净资产：' + value.toLocaleString());
  return true;
}

export function renderCompanyOverview(state, documentSource) {
  var doc = _resolveDocument(documentSource);
  if (!doc || !state) return false;
  var name = state.companyName || '星际信使贸易公司';
  var nameElement = doc.getElementById('company-name-text');
  if (nameElement) {
    nameElement.textContent = name;
    nameElement.setAttribute('title', name);
  }

  _renderPlayerLevel(state, doc);
  _renderUnlockRoadmap(state, doc);

  var levelLine = doc.getElementById('company-level-line');
  var levelFill = doc.getElementById('company-level-fill');
  var levelTrack = doc.getElementById('company-level-track');
  if (!levelLine || !levelFill) return true;

  var level = getCompanyLevel(state.companyExperience || 0);
  var nextLevel = COMPANY_LEVELS.find(function (entry) { return entry.level === level.level + 1; });
  var expCurrent = (state.companyExperience || 0) - level.expRequired;
  var expNeed = nextLevel ? (nextLevel.expRequired - level.expRequired) : 1;
  var percent = nextLevel ? Math.min(100, (expCurrent / expNeed) * 100) : 100;
  levelLine.textContent = nextLevel
    ? level.icon + ' ' + level.title + ' Lv.' + level.level + ' · ' + Math.max(0, expCurrent) + '/' + expNeed
    : level.icon + ' ' + level.title + ' Lv.' + level.level + ' · 已满级';
  levelFill.style.width = percent + '%';
  if (levelTrack) {
    var progressNow = nextLevel ? Math.max(0, Math.min(expNeed, expCurrent)) : 1;
    var progressMax = nextLevel ? expNeed : 1;
    var progressText = nextLevel
      ? '公司等级 ' + level.level + '，' + progressNow + '/' + progressMax
      : '公司等级 ' + level.level + '，已满级';
    levelTrack.setAttribute('aria-valuemin', '0');
    levelTrack.setAttribute('aria-valuemax', String(progressMax));
    levelTrack.setAttribute('aria-valuenow', String(progressNow));
    levelTrack.setAttribute('aria-valuetext', progressText);
    levelTrack.setAttribute('title', progressText);
  }
  return true;
}
