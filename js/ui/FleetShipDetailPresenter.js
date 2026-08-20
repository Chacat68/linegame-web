// js/ui/FleetShipDetailPresenter.js — 舰船 Context / L4 纯视图投影

import { buildWorkspaceOpenDetailSlot } from './WorkspaceActionSlot.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _number(value) {
  var result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function _formatNumber(value) {
  return Math.round(_number(value)).toLocaleString();
}

function _normalize(input) {
  var model = input || {};
  if (!model.ship) return null;
  return Object.assign({
    shipIndex: 0,
    shipType: {},
    role: {},
    maintenance: {},
    operating: {},
    cargoUsed: 0,
    maxCargo: 1,
    maxFuel: 1,
    maxHull: 1,
    crewCount: 0,
    modCount: 0,
    skillCount: 0,
    faultCount: 0,
    active: false,
    routeLabel: '停靠待命',
  }, model);
}

function _hero(model) {
  return '<div class="workspace-context-hero"><span aria-hidden="true">' +
    _escapeHtml(model.shipType.icon || model.ship.emoji || '🚀') + '</span><div><small>' +
    _escapeHtml(model.role.label || '舰队成员') + '</small><h3>' +
    _escapeHtml(model.ship.name || model.shipType.name || ('舰船 ' + (model.shipIndex + 1))) +
    '</h3></div></div>';
}

function _vitals(model) {
  return '<div class="workspace-context-metrics" role="list">' +
    '<span role="listitem"><small>船体</small><strong>' + _formatNumber(model.ship.hull) + '/' + _formatNumber(model.maxHull) + '</strong></span>' +
    '<span role="listitem"><small>燃料</small><strong>' + _formatNumber(model.ship.fuel) + '/' + _formatNumber(model.maxFuel) + '</strong></span>' +
    '<span role="listitem"><small>货舱</small><strong>' + _formatNumber(model.cargoUsed) + '/' + _formatNumber(model.maxCargo) + '</strong></span>' +
    '<span role="listitem"><small>维护</small><strong>' + _formatNumber(model.maintenance.value) + '%</strong></span>' +
  '</div>';
}

export function buildFleetShipContextView(input) {
  var model = _normalize(input);
  if (!model) return null;
  return {
    title: '舰船检查',
    html: '<article class="workspace-context-card workspace-context-card--ship">' +
      _hero(model) +
      '<p>' + _escapeHtml(model.role.summary || model.shipType.description || '公司舰队成员。') + '</p>' +
      _vitals(model) +
      '<div class="workspace-context-tags"><span>' + (model.active ? '当前操控舰' : '舰队成员') +
        '</span><span>' + _escapeHtml(model.routeLabel) + '</span><span>累计净额 ' +
        _formatNumber(model.operating.net) + '</span></div>' +
      buildWorkspaceOpenDetailSlot({
        workspaceId: 'fleet',
        contextType: 'ship',
        contextId: model.shipIndex,
        label: '查看完整舰船详情',
        attributes: { 'data-ship-index': model.shipIndex },
      }) +
    '</article>',
  };
}

export function buildFleetShipDetailView(input) {
  var model = _normalize(input);
  if (!model) return null;
  var operating = model.operating || {};
  return {
    title: (model.ship.name || model.shipType.name || ('舰船 ' + (model.shipIndex + 1))) + ' · 舰船详情',
    html: '<section class="workspace-detail-section workspace-detail-section--ship" data-fleet-ship-detail="' +
      model.shipIndex + '">' +
      '<div class="workspace-detail-intro">' + _hero(model) +
        '<p>' + _escapeHtml(model.role.summary || model.shipType.description || '公司舰队成员。') + '</p></div>' +
      _vitals(model) +
      '<div class="workspace-detail-entity-grid" role="list" aria-label="舰船运行详情">' +
        '<article role="listitem"><small>运行状态</small><strong>' + _escapeHtml(model.routeLabel) +
          '</strong><span>' + (model.active ? '当前操控舰' : '非操控舰') + '</span></article>' +
        '<article role="listitem"><small>累计净额</small><strong>' +
          (operating.net >= 0 ? '+' : '') + _formatNumber(operating.net) + '</strong><span>' +
          _formatNumber(operating.tradeCycles) + ' 次贸易循环</span></article>' +
        '<article role="listitem"><small>收入 / 成本</small><strong>' + _formatNumber(operating.revenue) + ' / ' +
          _formatNumber(_number(operating.cargoCost) + _number(operating.fuelCost) + _number(operating.upkeepCost) + _number(operating.serviceCost)) +
          '</strong><span>货物、燃料、养护与保养合计</span></article>' +
        '<article role="listitem"><small>配置</small><strong>' + _formatNumber(model.modCount) + ' 模块 · ' +
          _formatNumber(model.crewCount) + ' 船员</strong><span>' + _formatNumber(model.skillCount) + ' 技能 · ' +
          _formatNumber(model.faultCount) + ' 故障</span></article>' +
      '</div>' +
      '<p class="workspace-detail-note">该详情只汇总舰船事实；切换、改装、派遣和维护仍在舰队工作区内确认。</p>' +
    '</section>',
  };
}
