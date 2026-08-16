// js/ui/FleetModPresenter.js — 舰船改装/保养详情只读模型、HTML 与 UI intent

import { SHIP_TYPES, SHIP_UPGRADES, SHIP_MODS } from '../data/ships.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';

export const FLEET_MOD_INTENT = Object.freeze({
  UPGRADE: 'mod.structure.upgrade',
  INSTALL: 'mod.component.install',
  UNINSTALL: 'mod.component.uninstall',
  SERVICE: 'mod.service.start',
  SELL: 'mod.ship.sell',
});

var INTENT_VALUES = Object.freeze(Object.keys(FLEET_MOD_INTENT).map(function (key) {
  return FLEET_MOD_INTENT[key];
}));

var STRUCTURE_MODULES = Object.freeze([
  { id: 'cargo', icon: '📦', name: '货舱舱段', desc: '扩展载货能力，只展示当前可推进的下一档。', emptyLabel: '尚未扩容' },
  { id: 'fuel', icon: '⛽', name: '燃料系统', desc: '提升续航储备，保持长线运营的油量冗余。', emptyLabel: '尚未加装' },
  { id: 'engine', icon: '🚀', name: '推进核心', desc: '优化推进效率，压低航行燃耗。', emptyLabel: '尚未调校' },
  { id: 'hull', icon: '🛡️', name: '结构装甲', desc: '强化船体与装甲骨架，提升耐久余量。', emptyLabel: '尚未强化' },
]);

var MOD_CATEGORY_META = Object.freeze({
  cargo: { icon: '📦', name: '货舱组件', desc: '围绕装载空间与压缩效率的舱段扩展。' },
  engine: { icon: '🔥', name: '动力组件', desc: '提升推进、续航与探索能力。' },
  hull: { icon: '🛡️', name: '防护组件', desc: '强化结构稳定性与自修复能力。' },
  trade: { icon: '💰', name: '贸易组件', desc: '改善买卖价格、走私安全和贸易收益。' },
});

function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getShipSellQuote(ship) {
  var type = SHIP_TYPES.find(function (item) { return item.id === (ship && ship.typeId); });
  var base = type ? (type.sellValue || type.cost || 0) : 0;
  return { minPrice: Math.floor(base * 0.45), maxPrice: Math.floor(base * 0.80) };
}

function _getStructureModuleId(upgrade) {
  if (!upgrade || !upgrade.id) return 'cargo';
  if (upgrade.id.indexOf('ship_fuel_') === 0) return 'fuel';
  if (upgrade.id.indexOf('ship_engine_') === 0) return 'engine';
  if (upgrade.id.indexOf('ship_hull_') === 0) return 'hull';
  return 'cargo';
}

function _formatEffectText(effect) {
  var parts = [];
  if (!effect) return '';
  if (effect.cargo) parts.push('货舱 +' + effect.cargo);
  if (effect.maxFuel) parts.push('燃料 +' + effect.maxFuel);
  if (effect.hull) parts.push('船体 +' + effect.hull);
  if (effect.fuelEff && effect.fuelEff < 1) parts.push('航耗 -' + Math.round((1 - effect.fuelEff) * 100) + '%');
  if (effect.buyDiscount) parts.push('买入 -' + Math.round(effect.buyDiscount * 100) + '%');
  if (effect.sellBonus) parts.push('卖出 +' + Math.round(effect.sellBonus * 100) + '%');
  if (effect.autoRepair) parts.push('自动修复 +' + effect.autoRepair);
  if (effect.maintenanceDecayMultiplier && effect.maintenanceDecayMultiplier < 1) {
    parts.push('磨损 -' + Math.round((1 - effect.maintenanceDecayMultiplier) * 100) + '%');
  }
  if (effect.poiRewardMultiplier && effect.poiRewardMultiplier > 1) {
    parts.push('探索收益 +' + Math.round((effect.poiRewardMultiplier - 1) * 100) + '%');
  }
  return parts.join(' · ');
}

function _formatStructureEffect(moduleId, upgrades) {
  if (!upgrades || upgrades.length === 0) return '';
  if (moduleId === 'engine') {
    var factor = upgrades.reduce(function (value, upgrade) {
      return value * (upgrade.effect && upgrade.effect.fuelEff ? upgrade.effect.fuelEff : 1);
    }, 1);
    return '航耗 -' + Math.round((1 - factor) * 100) + '%';
  }
  var total = upgrades.reduce(function (sum, upgrade) {
    if (moduleId === 'cargo') return sum + ((upgrade.effect && upgrade.effect.cargo) || 0);
    if (moduleId === 'fuel') return sum + ((upgrade.effect && upgrade.effect.maxFuel) || 0);
    return sum + ((upgrade.effect && upgrade.effect.hull) || 0);
  }, 0);
  if (moduleId === 'cargo') return '货舱 +' + total;
  if (moduleId === 'fuel') return '燃料 +' + total;
  return '船体 +' + total;
}

function _buildStructureModules(state, ship) {
  return STRUCTURE_MODULES.map(function (definition) {
    var upgrades = SHIP_UPGRADES.filter(function (upgrade) {
      return _getStructureModuleId(upgrade) === definition.id;
    });
    var installed = upgrades.filter(function (upgrade) {
      return (ship.upgrades || []).includes(upgrade.id);
    });
    var next = upgrades.find(function (upgrade) {
      return !(ship.upgrades || []).includes(upgrade.id);
    }) || null;
    var atCap = false;
    if (next) {
      if (next.effect.cargo && ship.maxCargo + next.effect.cargo > ship.maxCargoCap) atCap = true;
      if (next.effect.maxFuel && ship.maxFuel + next.effect.maxFuel > ship.maxFuelCap) atCap = true;
      if (next.effect.hull && ship.maxHull + next.effect.hull > ship.maxHullCap) atCap = true;
      if (next.effect.fuelEff && ship.fuelEff * next.effect.fuelEff < ship.minFuelEff) atCap = true;
    }
    return {
      id: definition.id,
      icon: definition.icon,
      name: definition.name,
      desc: definition.desc,
      level: installed.length,
      totalLevels: upgrades.length,
      installedLabel: installed.length ? installed[installed.length - 1].name : definition.emptyLabel,
      currentEffectText: installed.length ? _formatStructureEffect(definition.id, installed) : definition.emptyLabel,
      nextUpgrade: next,
      nextEffectText: next ? _formatEffectText(next.effect) : '已达当前上限',
      canAfford: !!(next && state.credits >= next.cost),
      disabledReason: !next ? '已达当前上限' : (atCap ? '已达船体极限' : ''),
    };
  });
}

function _buildComponentGroups(state, ship, installedMods, availableMods, slotsLeft) {
  return Object.keys(MOD_CATEGORY_META).map(function (categoryId) {
    var meta = MOD_CATEGORY_META[categoryId];
    var readyMods = [];
    var lockedCount = 0;
    availableMods.forEach(function (mod) {
      if (mod.category !== categoryId) return;
      if (mod.requires && !(ship.mods || []).includes(mod.requires)) lockedCount += 1;
      else readyMods.push(mod);
    });
    return {
      id: categoryId,
      icon: meta.icon,
      name: meta.name,
      desc: meta.desc,
      installed: installedMods.filter(function (mod) { return mod.category === categoryId; }),
      readyMods: readyMods,
      lockedCount: lockedCount,
      slotsLeft: slotsLeft,
      credits: state.credits,
    };
  });
}

export function buildFleetModModel(state, shipIndex, options) {
  if (!state || !Number.isInteger(shipIndex) || shipIndex < 0) return null;
  var ship = state.fleet && state.fleet[shipIndex];
  if (!ship) return null;
  var opts = options || {};
  var stats = Fleet.getEffectiveShipStats(state, ship);
  var maintenance = stats.maintenance || Fleet.getShipMaintenanceSummary(state, ship);
  var installedMods = (ship.mods || []).map(function (id) {
    return SHIP_MODS.find(function (mod) { return mod.id === id; });
  }).filter(Boolean);
  var slotsLeft = (ship.modSlots || 1) - (ship.mods || []).length;
  var sellDisabledReason = '';
  if (state.fleet.length <= 1) sellDisabledReason = '至少保留一艘船。';
  else if (ship.route) sellDisabledReason = '跑商中的飞船需先召回。';
  else if (shipIndex === (state.activeShipIndex || 0)) sellDisabledReason = '当前操控中的飞船需先切换到其他船只。';
  return {
    ship: ship,
    shipIndex: shipIndex,
    focusModId: typeof opts.focusModId === 'string' ? opts.focusModId : '',
    focusService: !!opts.focusService,
    maintenance: maintenance,
    operating: Fleet.getShipOperatingSummary(state, ship),
    roleProfile: stats.roleProfile || Fleet.getShipRoleProfile(state, ship),
    faults: stats.faults || Fleet.getShipFaultSummaries(ship),
    modRecommendation: Fleet.getShipModRecommendation ? Fleet.getShipModRecommendation(state, shipIndex) : null,
    repairQuote: Fleet.getShipRepairQuote(state, shipIndex),
    repairJob: ship.repairJob && ship.repairJob.remainingDays > 0 ? ship.repairJob : null,
    hullMissing: Math.max(0, (ship.maxHull || ship.hull || 0) - (ship.hull || 0)),
    installedUpgradeCount: SHIP_UPGRADES.filter(function (upgrade) {
      return (ship.upgrades || []).includes(upgrade.id);
    }).length,
    structureModules: _buildStructureModules(state, ship),
    componentGroups: _buildComponentGroups(state, ship, installedMods, SHIP_MODS.filter(function (mod) {
      return !(ship.mods || []).includes(mod.id);
    }), slotsLeft),
    slotsLeft: slotsLeft,
    sellQuote: _getShipSellQuote(ship),
    sellDisabledReason: sellDisabledReason,
  };
}

function _renderSignalMetric(label, value, note, tone) {
  var className = 'mod-modal-signal-item' + (tone ? (' mod-modal-signal-item--' + _escapeHtml(tone)) : '');
  return '<div class="' + className + '" role="listitem"><span class="mod-modal-signal-label">' + _escapeHtml(label) + '</span><strong class="mod-modal-signal-value">' + _escapeHtml(value) + '</strong><span class="mod-modal-signal-note">' + _escapeHtml(note || '') + '</span></div>';
}

function _renderSignalPanel(model) {
  var repairNeeded = model.hullMissing > 0 || model.faults.length > 0 || (model.maintenance.value || 100) < 99.5;
  var structureReadyCount = model.structureModules.filter(function (item) {
    return !!(item.nextUpgrade && !item.disabledReason && item.canAfford);
  }).length;
  var structureBlockedCount = model.structureModules.filter(function (item) {
    return !!(item.nextUpgrade && (item.disabledReason || !item.canAfford));
  }).length;
  var readyModCount = model.componentGroups.reduce(function (sum, group) {
    return sum + group.readyMods.filter(function (mod) { return group.slotsLeft > 0 && group.credits >= mod.cost; }).length;
  }, 0);
  var lockedModCount = model.componentGroups.reduce(function (sum, group) { return sum + group.lockedCount; }, 0);
  var installedModCount = Array.isArray(model.ship.mods) ? model.ship.mods.length : 0;
  var modSlots = Math.max(1, model.ship.modSlots || 1);
  var repair = { value: '稳定', note: '当前无需保养', tone: 'complete' };
  var focus = { title: '改装状态稳定', note: '维修、结构和组件都正常，可按当前船型用途继续调整。', tone: 'complete' };
  if (model.repairQuote && !model.repairQuote.disabledReason && repairNeeded) {
    repair = { value: '可保养', note: model.repairQuote.cost.toLocaleString() + ' 积分 · 即时完成', tone: 'work' };
    focus = { title: '保养优先', note: '维护 ' + Math.round(model.maintenance.value || 0) + '%，船体缺口 ' + model.hullMissing + '，可在港口即时恢复。', tone: 'repair' };
  } else if (model.repairQuote && model.repairQuote.disabledReason && model.repairQuote.disabledReason !== '当前无需维修') {
    repair = { value: '受限', note: model.repairQuote.disabledReason, tone: 'blocked' };
  }
  if (focus.tone === 'complete' && model.modRecommendation && model.modRecommendation.canInstall) {
    focus = { title: '推荐组件可安装', note: model.modRecommendation.mod.name + '：' + model.modRecommendation.reason, tone: 'module' };
  } else if (focus.tone === 'complete' && model.modRecommendation && model.modRecommendation.disabledReason) {
    focus = { title: '推荐组件受限', note: model.modRecommendation.mod.name + '：' + model.modRecommendation.disabledReason, tone: 'blocked' };
  } else if (focus.tone === 'complete' && structureReadyCount > 0) {
    focus = { title: '结构模块可推进', note: structureReadyCount + ' 个结构模块满足预算和上限条件，可先补齐最短板。', tone: 'structure' };
  } else if (focus.tone === 'complete' && readyModCount > 0) {
    focus = { title: '组件槽位可利用', note: '当前还有 ' + model.slotsLeft + ' 个槽位，' + readyModCount + ' 项组件可直接安装。', tone: 'module' };
  } else if (focus.tone === 'complete' && model.slotsLeft <= 0 && installedModCount > 0) {
    focus = { title: '组件槽位已满', note: '安装新组件前需要先拆卸低优先级组件，避免在长列表里反复确认。', tone: 'blocked' };
  } else if (focus.tone === 'complete' && model.sellDisabledReason) {
    focus = { title: '资产处置受限', note: model.sellDisabledReason, tone: 'blocked' };
  }
  var structureValue = structureReadyCount ? structureReadyCount + ' 可升级' : '待筹备';
  var structureNote = structureReadyCount ? '可直接推进下一档结构强化' : (structureBlockedCount ? structureBlockedCount + ' 项受预算或上限限制' : '结构模块已整理');
  var componentNote = readyModCount ? readyModCount + ' 项可安装' : (model.slotsLeft <= 0 ? '槽位已满' : (lockedModCount ? lockedModCount + ' 项待解锁' : '无待装组件'));
  var assetNote = model.sellDisabledReason || (model.sellQuote.maxPrice > 0 ? '回收 ' + model.sellQuote.minPrice.toLocaleString() + '~' + model.sellQuote.maxPrice.toLocaleString() : '暂无回收价');
  return '<section class="mod-modal-signal-panel" aria-label="改装当前状态"><div class="mod-modal-signal-head"><div><div class="mod-modal-signal-title">改装当前状态</div><div class="mod-modal-signal-subtitle">把维修、结构、组件和资产限制合并到一屏，先确认当前船的改装优先级。</div></div><span class="mod-modal-signal-badge">' + _escapeHtml(model.roleProfile.label || '综合用途') + '</span></div>' +
    '<div class="mod-modal-signal-grid" role="list" aria-label="改装决策指标">' +
      _renderSignalMetric('维修', repair.value, repair.note, repair.tone) +
      _renderSignalMetric('结构', structureValue, structureNote, structureReadyCount ? 'ready' : (structureBlockedCount ? 'blocked' : 'complete')) +
      _renderSignalMetric('组件', installedModCount + '/' + modSlots, componentNote, readyModCount ? 'ready' : (model.slotsLeft <= 0 ? 'blocked' : 'complete')) +
      _renderSignalMetric('资产', model.sellDisabledReason ? '锁定' : '可处置', assetNote, model.sellDisabledReason ? 'blocked' : 'ready') +
    '</div><div class="mod-modal-signal-focus" role="status" aria-label="改装处理状态" data-tone="' + _escapeHtml(focus.tone) + '"><span class="mod-modal-signal-focus-kicker">处理状态</span><strong class="mod-modal-signal-focus-title">' + _escapeHtml(focus.title) + '</strong><span class="mod-modal-signal-focus-note">' + _escapeHtml(focus.note) + '</span></div></section>';
}

function _renderOverview(model) {
  var repairText = model.repairJob ? '维修中 · 剩余 ' + model.repairJob.remainingDays + ' 天' : (model.ship.route ? '跑商中，需召回后维修' : '已停靠，可安排维修');
  return '<div class="mod-modal-overview" role="list" aria-label="飞船改装摘要">' +
    '<span class="fleet-role-chip" role="listitem" title="' + _escapeHtml(model.roleProfile.summary || '') + '">🎯 ' + _escapeHtml(model.roleProfile.label || '综合用途') + '</span>' +
    '<span class="fleet-maintenance-chip fleet-maintenance-' + _escapeHtml(model.maintenance.band) + '" role="listitem">🧰 ' + _escapeHtml(model.maintenance.label) + ' ' + Math.round(model.maintenance.value) + '%</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">升级 ' + model.installedUpgradeCount + '</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">组件 ' + (model.ship.mods || []).length + '/' + (model.ship.modSlots || 1) + '</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">船体缺口 ' + model.hullMissing + '</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">日常养护 ' + model.maintenance.upkeepCost + '/天</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">磨损 ' + model.maintenance.dailyDecay.toFixed(1) + '/天</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">跑商实际盈亏 ' + (model.operating.net >= 0 ? '+' : '') + Math.round(model.operating.net).toLocaleString() + '</span>' +
    '<span class="mod-modal-overview-stat" role="listitem">完成循环 ' + model.operating.tradeCycles + '</span>' +
    '<span class="mod-modal-overview-stat' + (model.repairJob ? ' mod-modal-overview-stat--repair' : '') + '" role="listitem">' + _escapeHtml(repairText) + '</span></div>';
}

function _renderRecommendation(model) {
  var recommendation = model.modRecommendation;
  if (!recommendation) return '';
  var focused = !!(model.focusModId && recommendation.modId === model.focusModId);
  return '<div class="mod-modal-recommendation' + (focused ? ' mod-modal-recommendation--focus' : '') + '" role="group" aria-label="' + _escapeHtml('推荐组件 ' + recommendation.mod.name) + '"' + (focused ? ' data-focus-mod="recommendation"' : '') + '>' +
    '<div class="mod-modal-recommendation-copy"><div class="mod-modal-recommendation-title">🧩 推荐组件 · ' + recommendation.mod.emoji + ' ' + _escapeHtml(recommendation.mod.name) + '</div><div class="mod-modal-recommendation-reason">' + _escapeHtml(recommendation.reason) + '</div>' +
    (recommendation.disabledReason ? '<div class="mod-modal-recommendation-note">当前限制：' + _escapeHtml(recommendation.disabledReason) + '</div>' : '') + '</div>' +
    '<button class="mod-modal-buy-btn mod-modal-recommendation-btn" type="button" data-fleet-mod-intent="' + FLEET_MOD_INTENT.INSTALL + '" data-ship-index="' + model.shipIndex + '" data-mod-id="' + _escapeHtml(recommendation.modId) + '"' + (recommendation.canInstall ? '' : ' disabled') + '>' + (recommendation.canInstall ? '安装 · ' + recommendation.mod.cost.toLocaleString() : '暂不可装') + '</button></div>';
}

function _renderStructureModules(model) {
  return '<h4 class="mod-modal-section-title">结构模块</h4><div class="mod-modal-structure-grid">' + model.structureModules.map(function (item) {
    var next = item.nextUpgrade;
    var disabled = !!item.disabledReason;
    var canBuy = !!(next && !disabled && item.canAfford);
    var cardClass = 'mod-modal-structure-card' + (!next ? ' mod-modal-structure-card--done' : (disabled ? ' mod-modal-structure-card--locked' : (!item.canAfford ? ' mod-modal-structure-card--poor' : '')));
    var progress = item.totalLevels > 0 ? Math.max(0, Math.min(100, Math.round((item.level / item.totalLevels) * 100))) : 100;
    var nextHtml = '<div class="mod-modal-structure-next mod-modal-structure-next--done">当前模块已升到上限</div>';
    if (next) {
      nextHtml = '<div class="mod-modal-structure-next"><div class="mod-modal-structure-next-label">可升级项</div><div class="mod-modal-structure-next-name">' + _escapeHtml(next.name) + '</div><div class="mod-modal-structure-next-desc">' + _escapeHtml(item.nextEffectText || next.desc) + '</div>' +
        (disabled ? '<div class="mod-modal-structure-note">🚫 ' + _escapeHtml(item.disabledReason) + '</div>' : '') +
        '<button class="upg-modal-buy-btn mod-modal-structure-btn' + (item.canAfford ? '' : ' upg-modal-no-afford') + '" type="button" data-fleet-mod-intent="' + FLEET_MOD_INTENT.UPGRADE + '" data-ship-index="' + model.shipIndex + '" data-upgrade-id="' + _escapeHtml(next.id) + '"' + (canBuy ? '' : ' disabled') + '>' + (disabled ? '已达极限' : (item.canAfford ? '升级 · ' + next.cost.toLocaleString() : '积分不足 · ' + next.cost.toLocaleString())) + '</button></div>';
    }
    return '<article class="' + cardClass + '" role="group" aria-label="' + _escapeHtml(item.name + ' Lv.' + item.level + '/' + item.totalLevels) + '"><div class="mod-modal-structure-head"><div><div class="mod-modal-structure-name">' + item.icon + ' ' + _escapeHtml(item.name) + '</div><div class="mod-modal-structure-desc">' + _escapeHtml(item.desc) + '</div></div><span class="mod-modal-structure-level">Lv.' + item.level + '/' + item.totalLevels + '</span></div><div class="mod-modal-structure-progress" role="progressbar" aria-label="' + _escapeHtml(item.name + ' 升级进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><div class="mod-modal-structure-progress-fill" style="width:' + progress + '%"></div></div><div class="mod-modal-structure-current"><span class="mod-modal-structure-current-label">当前状态</span><strong>' + _escapeHtml(item.currentEffectText) + '</strong><span>' + _escapeHtml(item.installedLabel) + '</span></div>' + nextHtml + '</article>';
  }).join('') + '</div>';
}

function _renderComponentGroups(model) {
  return '<h4 class="mod-modal-section-title">功能组件</h4><div class="mod-modal-module-grid">' + model.componentGroups.map(function (group) {
    var installedHtml = group.installed.length ? '<div class="mod-modal-subtitle">已装配</div><div class="mod-modal-list" role="list">' + group.installed.map(function (mod) {
      var focused = !!(model.focusModId && mod.id === model.focusModId);
      return '<article class="mod-modal-item mod-modal-installed-item' + (focused ? ' mod-modal-item--focus' : '') + '" role="listitem" aria-label="' + _escapeHtml('已装配 ' + mod.name) + '" data-mod-id="' + _escapeHtml(mod.id) + '"' + (focused ? ' data-focus-mod="item"' : '') + '><div class="mod-modal-item-info"><div class="mod-modal-item-name">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</div><div class="mod-modal-item-desc">' + _escapeHtml(mod.desc) + '</div></div><button class="mod-modal-uninstall-btn" type="button" data-fleet-mod-intent="' + FLEET_MOD_INTENT.UNINSTALL + '" data-ship-index="' + model.shipIndex + '" data-mod-id="' + _escapeHtml(mod.id) + '">🗑️ 拆卸</button></article>';
    }).join('') + '</div>' : '';
    var readyHtml = '';
    if (group.readyMods.length) {
      readyHtml = '<div class="mod-modal-subtitle">可安装' + (group.slotsLeft <= 0 ? '（槽位已满）' : '') + '</div><div class="mod-modal-list" role="list">' + group.readyMods.map(function (mod) {
        var canAfford = group.credits >= mod.cost;
        var disabled = group.slotsLeft <= 0 || !canAfford;
        var focused = !!(model.focusModId && mod.id === model.focusModId);
        var className = 'mod-modal-item' + (group.slotsLeft <= 0 ? ' mod-modal-full' : (!canAfford ? ' mod-modal-poor' : '')) + (focused ? ' mod-modal-item--focus' : '');
        return '<article class="' + className + '" role="listitem" aria-label="' + _escapeHtml('可安装 ' + mod.name) + '" data-mod-id="' + _escapeHtml(mod.id) + '"' + (focused ? ' data-focus-mod="item"' : '') + '><div class="mod-modal-item-info"><div class="mod-modal-item-name">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</div><div class="mod-modal-item-desc">' + _escapeHtml(mod.desc) + '</div></div><button class="mod-modal-buy-btn' + (canAfford ? '' : ' mod-modal-no-afford') + '" type="button" data-fleet-mod-intent="' + FLEET_MOD_INTENT.INSTALL + '" data-ship-index="' + model.shipIndex + '" data-mod-id="' + _escapeHtml(mod.id) + '"' + (disabled ? ' disabled' : '') + '>' + (group.slotsLeft <= 0 ? '槽位已满' : (canAfford ? '安装 · ' + mod.cost.toLocaleString() : '积分不足')) + '</button></article>';
      }).join('') + '</div>';
    } else if (!group.installed.length) {
      readyHtml = '<div class="mod-modal-module-empty">当前没有可立即安装的组件。</div>';
    }
    return '<section class="mod-modal-module-card" role="group" aria-label="' + _escapeHtml(group.name) + '"><div class="mod-modal-module-head"><div><div class="mod-modal-module-name">' + group.icon + ' ' + _escapeHtml(group.name) + '</div><div class="mod-modal-module-desc">' + _escapeHtml(group.desc) + '</div></div><span class="mod-modal-module-meta">已装 ' + group.installed.length + '</span></div>' + installedHtml + readyHtml + (group.lockedCount ? '<div class="mod-modal-module-note">后续解锁 ' + group.lockedCount + ' 项，满足前置后再显示详细内容。</div>' : '') + '</section>';
  }).join('') + '</div>';
}

function _renderService(model) {
  var quote = model.repairQuote;
  var html = '<h4 class="mod-modal-section-title">港口保养</h4><div class="ship-repair-card"><div class="ship-repair-card-head"><div><div class="ship-repair-card-title">🔧 即时保养</div><div class="ship-repair-card-desc">' + _escapeHtml(quote ? quote.desc : '当前无法生成保养报价。') + '</div></div><span class="ship-repair-card-badge">' + _escapeHtml(quote ? quote.cost.toLocaleString() + ' 积分' : '') + '</span></div>';
  if (model.repairJob) {
    var job = model.repairJob;
    var progress = job.totalDays > 0 ? Math.max(0, Math.min(100, Math.round(((job.totalDays - job.remainingDays) / job.totalDays) * 100))) : 0;
    html += '<div class="ship-repair-progress" role="progressbar" aria-label="维修进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><div class="ship-repair-progress-fill" style="width:' + progress + '%"></div></div><div class="ship-repair-meta"><span>总耗时 ' + job.totalDays + ' 天</span><span>已支付 ' + job.cost.toLocaleString() + '</span><span>船体缺口 ' + model.hullMissing + '</span><span>故障 ' + model.faults.length + '</span></div><div class="ship-repair-note">维修完成前该船无法自动跑商，当前操控船也无法出航。</div>';
  } else if (quote) {
    html += '<div class="ship-repair-meta"><span>耗时 即时</span><span>船体缺口 ' + model.hullMissing + '</span><span>日常养护 ' + model.maintenance.upkeepCost + '/天</span></div><div class="ship-repair-effect">' + _escapeHtml(quote.effectSummary) + '</div>' + (quote.disabledReason ? '<div class="ship-repair-note ship-repair-note--warning">' + _escapeHtml(quote.disabledReason) + '</div>' : '') + '<button class="btn-primary ship-repair-start-btn" type="button" data-fleet-mod-intent="' + FLEET_MOD_INTENT.SERVICE + '" data-ship-index="' + model.shipIndex + '"' + (quote.disabledReason ? ' disabled' : '') + '>立即保养</button>';
  }
  if (model.faults.length) html += '<div class="ship-repair-faults">' + model.faults.map(function (fault) { return '<span class="fleet-fault-chip" title="' + _escapeHtml(fault.desc) + '">' + fault.icon + ' ' + _escapeHtml(fault.label) + '</span>'; }).join('') + '</div>';
  return html + '</div>';
}

function _renderDisposal(model) {
  if (model.sellQuote.maxPrice <= 0) return '';
  return '<h4 class="mod-modal-section-title">资产处置</h4><div class="mod-modal-disposal' + (model.sellDisabledReason ? ' mod-modal-disposal--disabled' : '') + '"><div class="mod-modal-item-info"><div class="mod-modal-item-name">💸 回收卖出</div><div class="mod-modal-item-desc">预计回收价 ' + model.sellQuote.minPrice.toLocaleString() + ' ~ ' + model.sellQuote.maxPrice.toLocaleString() + ' 积分，货舱中的货物会一并清空。</div>' + (model.sellDisabledReason ? '<div class="mod-modal-item-prereq">⚠️ ' + _escapeHtml(model.sellDisabledReason) + '</div>' : '') + '</div><button class="fleet-sell-btn mod-modal-sell-btn" type="button" data-fleet-mod-intent="' + FLEET_MOD_INTENT.SELL + '" data-ship-index="' + model.shipIndex + '"' + (model.sellDisabledReason ? ' disabled' : '') + '>卖出飞船</button></div>';
}

export function renderFleetMod(model) {
  if (!model) return null;
  return {
    title: '🔧 ' + model.ship.emoji + ' ' + model.ship.name + ' — 模块改装 / 维修',
    html: _renderOverview(model) + _renderSignalPanel(model) + _renderRecommendation(model) + _renderStructureModules(model) + _renderComponentGroups(model) + _renderService(model) + _renderDisposal(model),
  };
}

function _findIntentElement(target) {
  if (!target) return null;
  if (typeof target.closest === 'function') return target.closest('[data-fleet-mod-intent]');
  var current = target;
  while (current) {
    if (current.dataset && current.dataset.fleetModIntent) return current;
    current = current.parentElement || null;
  }
  return null;
}

function _id(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readFleetModIntent(target) {
  var element = _findIntentElement(target);
  if (!element || !element.dataset || element.disabled) return null;
  var type = element.dataset.fleetModIntent;
  if (INTENT_VALUES.indexOf(type) === -1) return null;
  var shipIndex = Number(element.dataset.shipIndex);
  if (!Number.isInteger(shipIndex) || shipIndex < 0) return null;
  if (type === FLEET_MOD_INTENT.SERVICE || type === FLEET_MOD_INTENT.SELL) {
    return Object.freeze({ type: type, shipIndex: shipIndex });
  }
  if (type === FLEET_MOD_INTENT.UPGRADE) {
    var upgradeId = _id(element.dataset.upgradeId);
    return upgradeId ? Object.freeze({ type: type, shipIndex: shipIndex, upgradeId: upgradeId }) : null;
  }
  var modId = _id(element.dataset.modId);
  return modId ? Object.freeze({ type: type, shipIndex: shipIndex, modId: modId }) : null;
}
