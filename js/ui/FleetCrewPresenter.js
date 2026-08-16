// js/ui/FleetCrewPresenter.js — 船员详情只读模型、HTML 与 roster intent

import { SYSTEMS } from '../data/systems.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Crew from '../systems/fleet/CrewSystem.js';

export const FLEET_CREW_INTENT = Object.freeze({
  SWITCH_SHIP: 'crew.ship.switch',
  UNASSIGN: 'crew.member.unassign',
  ASSIGN: 'crew.member.assign',
  DISMISS: 'crew.member.dismiss',
  RECRUIT: 'crew.offer.recruit',
});

var INTENT_VALUES = Object.freeze(Object.keys(FLEET_CREW_INTENT).map(function (key) {
  return FLEET_CREW_INTENT[key];
}));

function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatCrewEffectParts(effect) {
  var parts = [];
  if (effect.cargo) parts.push('货舱 +' + effect.cargo);
  if (effect.autoRepair) parts.push('维修 +' + effect.autoRepair + '/天');
  if (effect.fuelEffMultiplier && effect.fuelEffMultiplier < 1) {
    parts.push('航耗 -' + Math.round((1 - effect.fuelEffMultiplier) * 100) + '%');
  }
  if (effect.buyDiscount) parts.push('买入 -' + Math.round(effect.buyDiscount * 100) + '%');
  if (effect.sellBonus) parts.push('卖出 +' + Math.round(effect.sellBonus * 100) + '%');
  return parts;
}

function _formatProgress(member) {
  if ((member.level || 1) >= (member.maxLevel || member.level || 1)) {
    return 'Lv.' + (member.level || 1) + ' · 已达当前成长上限';
  }
  return 'Lv.' + (member.level || 1) + ' · 进度 ' + (member.exp || 0) + '/' + (member.expToNext || 0);
}

function _getProgressPercent(member) {
  if (!member) return 0;
  if ((member.level || 1) >= (member.maxLevel || member.level || 1)) return 100;
  var next = Math.max(1, Number(member.expToNext) || 1);
  return Math.max(0, Math.min(100, Math.round(((member.exp || 0) / next) * 100)));
}

function _getRosterHint(shipCrew, reserveCrew, marketCrew, seatRemaining) {
  if (shipCrew.length <= 0 && reserveCrew.length > 0) return '当前飞船还没有船员，先从预备队分配一名关键岗位。';
  if (shipCrew.length <= 0 && marketCrew.length > 0) return '当前飞船还没有船员，可先从港口招募补足基础岗位。';
  if (seatRemaining <= 0 && reserveCrew.length + marketCrew.length > 0) return '船员席位已满，新人上船前需要先调回预备队或扩充船体。';
  if (seatRemaining > 0 && reserveCrew.length > 0) return '还有 ' + seatRemaining + ' 个空席位，可直接从预备队补强本船。';
  if (seatRemaining > 0 && marketCrew.length > 0) return '还有 ' + seatRemaining + ' 个空席位，港口市场有可签约人选。';
  return '船员编制稳定，继续查看工资与成长进度。';
}

export function buildFleetCrewModel(state, shipIndex) {
  if (!state || !Number.isInteger(shipIndex) || shipIndex < 0) return null;
  var ship = state.fleet && state.fleet[shipIndex];
  if (!ship) return null;
  var shipCrew = Crew.getShipCrew(state, ship);
  var reserveCrew = Crew.getReserveCrew(state);
  var marketState = Crew.getCrewMarket(state, state.currentSystem);
  var marketCrew = marketState.offers || [];
  var crewEffects = Fleet.getEffectiveShipStats(state, ship).crewEffects || {};
  var currentSystem = SYSTEMS.find(function (system) { return system.id === state.currentSystem; });
  var capacity = ship.crewCapacity || 0;
  var remaining = Math.max(0, capacity - shipCrew.length);
  return {
    state: state,
    ship: ship,
    shipIndex: shipIndex,
    isActive: shipIndex === (Number.isInteger(state.activeShipIndex) ? state.activeShipIndex : 0),
    shipCrew: shipCrew,
    reserveCrew: reserveCrew,
    marketCrew: marketCrew,
    marketState: marketState,
    crewEffects: crewEffects,
    currentSystemName: currentSystem ? currentSystem.name : state.currentSystem,
    capacity: capacity,
    remaining: remaining,
    seatTone: shipCrew.length <= 0 ? 'empty' : (remaining <= 0 ? 'warning' : 'ready'),
    reserveTone: reserveCrew.length > 0 ? 'ready' : 'empty',
    marketTone: marketCrew.length > 0 ? 'ready' : 'empty',
    rosterHint: _getRosterHint(shipCrew, reserveCrew, marketCrew, remaining),
  };
}

function _renderSummaryStat(label, value) {
  return '<div class="crew-modal-summary-stat" role="listitem"><span>' + _escapeHtml(label) + '</span><strong>' + _escapeHtml(value) + '</strong></div>';
}

function _renderStatus(items) {
  return (items || []).map(function (item) {
    return '<span class="crew-modal-status-chip" role="listitem" data-tone="' + _escapeHtml(item.tone || 'neutral') + '"><span>' + _escapeHtml(item.label) + '</span><strong>' + _escapeHtml(item.value) + '</strong></span>';
  }).join('');
}

function _renderCard(member, actionHtml, options) {
  var opts = options || {};
  var effectParts = _formatCrewEffectParts(Crew.getCrewEffectProfile(member));
  var progressText = _formatProgress(member);
  var progressPercent = _getProgressPercent(member);
  var meta = opts.meta || (member.roleName + ' · ' + (member.branchLabel || member.specialtyName || member.roleName) + ' · 工资 ' + member.wage + '/天');
  var detailText = progressText + (effectParts.length ? ' · ' + effectParts.join(' · ') : '');
  var cardLabel = (member.name || '') + '，' + meta + '，' + progressText;
  return '<article class="crew-card' + (opts.kind ? ' crew-card--' + _escapeHtml(opts.kind) : '') + '" role="listitem" aria-label="' + _escapeHtml(cardLabel) + '">' +
    '<div class="crew-card-main"><strong>' + (member.emoji || '👤') + ' ' + _escapeHtml(member.name) + '</strong><span>' + _escapeHtml(meta) + '</span><small>' + _escapeHtml(detailText) + '</small>' +
      '<div class="crew-progress" role="progressbar" aria-label="' + _escapeHtml((member.name || '船员') + ' 经验进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPercent + '"><div class="crew-progress-fill" style="width:' + progressPercent + '%"></div></div>' +
      (opts.desc ? '<small class="crew-card-desc">' + _escapeHtml(opts.desc) + '</small>' : '') +
    '</div><div class="crew-card-actions">' + actionHtml + '</div></article>';
}

export function renderFleetCrew(model) {
  if (!model) return null;
  var shipIndex = model.shipIndex;
  var summary = _renderSummaryStat('席位', model.shipCrew.length + '/' + model.capacity) +
    _renderSummaryStat('当前港口', model.currentSystemName) +
    _renderSummaryStat('工资/天', model.shipCrew.reduce(function (sum, member) { return sum + (member.wage || 0); }, 0)) +
    _renderSummaryStat('货舱加成', '+' + (model.crewEffects.cargo || 0)) +
    _renderSummaryStat('维修加成', '+' + (model.crewEffects.autoRepair || 0)) +
    _renderSummaryStat('市场刷新', '第 ' + model.marketState.refreshDay + ' 天 / 下次第 ' + model.marketState.nextRefreshDay + ' 天') +
    _renderSummaryStat('人才倾向', model.marketState.themeLabel || '综合港') +
    '<div class="crew-modal-command-panel" role="listitem" aria-label="舰桥状态"><div class="crew-modal-command-head"><strong>舰桥状态</strong><div class="crew-modal-command-actions"><span class="crew-modal-command-state">' + (model.isActive ? '当前操控' : '远程管理') + '</span>' +
      (model.isActive ? '' : '<button class="btn-secondary crew-switch-ship-btn" type="button" data-fleet-crew-intent="' + FLEET_CREW_INTENT.SWITCH_SHIP + '" data-ship-index="' + shipIndex + '">设为当前操控</button>') +
    '</div></div><div class="ship-protocol-panel-desc">船型、改装与船员效果会自动算入跑商结果，不需要额外开启。</div></div>' +
    '<div class="crew-modal-roster-alert" role="listitem" aria-label="船员管理建议"><strong>船员建议</strong><span>' + _escapeHtml(model.rosterHint) + '</span></div>';

  var assigned = model.shipCrew.length > 0
    ? model.shipCrew.map(function (member) {
      return _renderCard(member, '<button class="btn-secondary crew-unassign-btn" type="button" data-fleet-crew-intent="' + FLEET_CREW_INTENT.UNASSIGN + '" data-ship-index="' + shipIndex + '" data-crew-id="' + _escapeHtml(member.id) + '">调回预备队</button>', { kind: 'assigned' });
    }).join('')
    : '<div class="crew-empty" role="listitem">当前飞船暂无船员。</div>';
  var reserve = model.reserveCrew.length > 0
    ? model.reserveCrew.map(function (member) {
      return _renderCard(member,
        '<button class="btn-primary crew-assign-btn" type="button" data-fleet-crew-intent="' + FLEET_CREW_INTENT.ASSIGN + '" data-ship-index="' + shipIndex + '" data-crew-id="' + _escapeHtml(member.id) + '">分配到本船</button>' +
        '<button class="btn-secondary crew-dismiss-btn" type="button" data-fleet-crew-intent="' + FLEET_CREW_INTENT.DISMISS + '" data-crew-id="' + _escapeHtml(member.id) + '">解雇</button>', { kind: 'reserve' });
    }).join('')
    : '<div class="crew-empty" role="listitem">预备队为空。</div>';
  var market = model.marketCrew.length > 0
    ? model.marketCrew.map(function (offer) {
      return _renderCard(offer, '<button class="btn-primary crew-recruit-btn" type="button" data-fleet-crew-intent="' + FLEET_CREW_INTENT.RECRUIT + '" data-offer-id="' + _escapeHtml(offer.id) + '">签约 ' + offer.hireCost + '</button>', {
        kind: 'market',
        meta: offer.title + ' · ' + offer.roleName + ' · ' + (offer.branchLabel || offer.specialtyName || offer.roleName),
        desc: offer.desc,
      });
    }).join('')
    : '<div class="crew-empty" role="listitem">当前港口本轮人才市场已无可签约人选。</div>';

  return {
    title: '👥 船员管理 · ' + model.ship.emoji + ' ' + model.ship.name,
    dataset: {
      crewShipIndex: String(shipIndex),
      crewSeatState: model.seatTone,
      crewReserveState: model.reserveTone,
      crewMarketState: model.marketTone,
    },
    summary: summary,
    assignedStatus: _renderStatus([
      { label: '席位', value: model.shipCrew.length + '/' + model.capacity, tone: model.seatTone },
      { label: '可补', value: model.remaining + ' 人', tone: model.remaining > 0 ? 'ready' : 'warning' },
    ]),
    reserveStatus: _renderStatus([
      { label: '待命', value: model.reserveCrew.length + ' 人', tone: model.reserveTone },
      { label: '操作', value: model.reserveCrew.length > 0 ? '可分配' : '空', tone: model.reserveTone },
    ]),
    marketStatus: _renderStatus([
      { label: '候选', value: model.marketCrew.length + ' 人', tone: model.marketTone },
      { label: '刷新', value: '第 ' + model.marketState.nextRefreshDay + ' 天', tone: 'neutral' },
    ]),
    assigned: assigned,
    reserve: reserve,
    market: market,
  };
}

function _findIntentElement(target) {
  if (!target) return null;
  if (typeof target.closest === 'function') return target.closest('[data-fleet-crew-intent]');
  var current = target;
  while (current) {
    if (current.dataset && current.dataset.fleetCrewIntent) return current;
    current = current.parentElement || null;
  }
  return null;
}

function _id(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readFleetCrewIntent(target) {
  var element = _findIntentElement(target);
  if (!element || !element.dataset || element.disabled) return null;
  var type = element.dataset.fleetCrewIntent;
  if (INTENT_VALUES.indexOf(type) === -1) return null;
  if (type === FLEET_CREW_INTENT.RECRUIT) {
    var offerId = _id(element.dataset.offerId);
    return offerId ? Object.freeze({ type: type, offerId: offerId }) : null;
  }
  if (type === FLEET_CREW_INTENT.DISMISS) {
    var dismissedId = _id(element.dataset.crewId);
    return dismissedId ? Object.freeze({ type: type, crewId: dismissedId }) : null;
  }
  var shipIndex = Number(element.dataset.shipIndex);
  if (!Number.isInteger(shipIndex) || shipIndex < 0) return null;
  if (type === FLEET_CREW_INTENT.SWITCH_SHIP) return Object.freeze({ type: type, shipIndex: shipIndex });
  var crewId = _id(element.dataset.crewId);
  return crewId ? Object.freeze({ type: type, shipIndex: shipIndex, crewId: crewId }) : null;
}
