// js/ui/FactionDetailPresenter.js — 派系 Context 与共享 L4 详情纯投影

import * as Faction from '../systems/faction/FactionSystem.js';
import { FACTIONS, FACTION_LEVELS } from '../data/factions.js';
import { GOODS } from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import { buildWorkspaceObjectDetailView } from './WorkspaceObjectDetailPresenter.js';
import { buildWorkspaceOpenDetailSlot } from './WorkspaceActionSlot.js';

const GOOD_EMOJIS = Object.freeze({
  food: '🌾', water: '💧', minerals: '⛏', technology: '🔬',
  luxury: '💎', weapons: '⚔', medicine: '💊', fuel: '⚡',
});

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatSigned(value) {
  var number = Number(value) || 0;
  return (number >= 0 ? '+' : '') + number;
}

function _formatTaxMod(taxMod) {
  var pct = Math.round(((Number(taxMod) || 1) - 1) * 100);
  if (pct === 0) return '0%';
  return (pct > 0 ? '+' : '') + pct + '%';
}

function _goodEmoji(goodId) {
  return GOOD_EMOJIS[goodId] || goodId;
}

function _formatGoodNames(goodIds) {
  return (Array.isArray(goodIds) ? goodIds : []).map(function (goodId) {
    var good = GOODS.find(function (entry) { return entry.id === goodId; });
    return _goodEmoji(goodId) + ' ' + (good ? good.name : goodId);
  }).join(' / ');
}

function _getFaction(factionId) {
  return FACTIONS.find(function (entry) { return entry.id === factionId; }) || null;
}

export function buildFactionContextView(request) {
  var context = request && request.context;
  var state = request && request.state;
  if (!context || context.type !== 'faction' || !state) return null;
  var faction = _getFaction(context.id);
  if (!faction) return null;
  var relation = Faction.getRelation(state, faction.id);
  var level = Faction.getLevel(state, faction.id);
  var html = '<article class="workspace-context-card workspace-context-card--faction">' +
    '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(faction.icon) + '</span><div><small>' + _escapeHtml(faction.ideology) + '</small><h3>' + _escapeHtml(faction.name) + '</h3></div></div>' +
    '<p>' + _escapeHtml(faction.description) + '</p>' +
    '<div class="workspace-context-metrics" role="list"><span role="listitem"><small>关系</small><strong>' + _escapeHtml(_formatSigned(relation)) + '</strong></span><span role="listitem"><small>等级</small><strong>' + _escapeHtml(level.name) + '</strong></span><span role="listitem"><small>税率</small><strong>' + _escapeHtml(_formatTaxMod(level.taxMod)) + '</strong></span><span role="listitem"><small>控制</small><strong>' + (faction.controlledSystems || []).length + ' 地点</strong></span></div>' +
    '<div class="workspace-context-callout">' + _escapeHtml(faction.bonuses[level.id] || '提升关系以解锁派系奖励。') + '</div>' +
    buildWorkspaceOpenDetailSlot({
      workspaceId: 'archive',
      contextType: 'faction',
      contextId: faction.id,
      label: '查看完整派系详情',
      attributes: { 'data-context-id': faction.id },
    }) +
  '</article>';
  return Object.freeze({ title: '派系检查', html: html });
}

export function buildFactionWorkspaceDetailView(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  if (!detail || detail.type !== 'archive-faction' || !state) return null;
  var faction = _getFaction(detail.id);
  if (!faction) return null;
  var relation = Faction.getRelation(state, faction.id);
  var level = Faction.getLevel(state, faction.id);
  var controlledSystems = (faction.controlledSystems || []).map(function (systemId) {
    var system = findSystem(systemId);
    return system ? system.name : systemId;
  });
  var levelIndex = FACTION_LEVELS.findIndex(function (entry) { return entry.id === level.id; });
  var nextLevel = levelIndex >= 0 && levelIndex < FACTION_LEVELS.length - 1 ? FACTION_LEVELS[levelIndex + 1] : null;
  var representativeSystemId = faction.controlledSystems && faction.controlledSystems[0];
  var marketLabel = faction.marketAccess && faction.marketAccess.blackMarket
    ? (Faction.canAccessBlackMarket(state, representativeSystemId) ? '黑市已开放' : '黑市待解锁')
    : '公开市场';
  var view = buildWorkspaceObjectDetailView({
    id: faction.id,
    kind: 'faction',
    kindLabel: '派系',
    detailLabel: '派系详情',
    icon: faction.icon || '🏛️',
    eyebrow: faction.ideology || '派系档案',
    title: faction.name,
    description: faction.description || '暂无派系说明。',
    metrics: [
      { label: '关系', value: _formatSigned(relation) },
      { label: '等级', value: level.name },
      { label: '税率', value: _formatTaxMod(level.taxMod) },
      { label: '控制', value: controlledSystems.length + ' 地点' },
    ],
    facts: [
      { label: '当前关系效果', value: faction.bonuses[level.id] || '尚未解锁关系奖励', detail: nextLevel ? ('下一等级：' + nextLevel.name) : '已达到最高关系等级' },
      { label: '控制地点', value: controlledSystems.length ? controlledSystems.join(' / ') : '无登记地点', detail: '派系税率与市场规则在这些地点生效' },
      { label: '偏好商品', value: _formatGoodNames(faction.tradePreference && faction.tradePreference.liked) || '无登记偏好', detail: '交易这些商品通常有利于关系' },
      { label: '敏感商品', value: _formatGoodNames(faction.tradePreference && faction.tradePreference.disliked) || '无登记敏感品', detail: '交易这些商品可能影响关系' },
    ],
    tags: [level.name, marketLabel, faction.ideology || ''],
    note: '该详情汇总关系、控制区与贸易偏好；市场跳转和其它外交动作仍在派系页确认。',
  });
  return view ? Object.freeze({ title: view.title, html: view.html }) : null;
}
