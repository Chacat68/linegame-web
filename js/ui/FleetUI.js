// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：data/ships.js, data/systems.js, data/goods.js, systems/fleet/FleetSystem.js
// 导出：render

import { SHIP_TYPES, SHIP_UPGRADES, SHIP_MODS } from '../data/ships.js';
import { GALAXIES, SYSTEMS, getAccessibleGalaxies, getSystemsByGalaxy } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Crew from '../systems/fleet/CrewSystem.js';
import * as Economy from '../systems/economy/Economy.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import { hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';
import * as EventBus from '../core/EventBus.js';
import * as ActionConfirmUI from './ActionConfirmUI.js';
import * as ContextInspector from './ContextInspector.js';
import { FLEET_COMMAND, normalizeFleetCommand } from '../core/FleetCommand.js';
import {
  FLEET_HANGAR_INTENT,
  buildFleetHangarModel,
  getFleetCargoUsed,
  readFleetHangarIntent,
  renderFleetHangar,
} from './FleetHangarPresenter.js';
import {
  FLEET_CREW_INTENT,
  buildFleetCrewModel,
  readFleetCrewIntent,
  renderFleetCrew,
} from './FleetCrewPresenter.js';

let _activeInlineModalId = null;
let _currentPortalCleanup = null;
let _activeModModalContext = null;
let _activeDispatchModalContext = null;
let _inspectedHangarShipIndex = null;
let _lifecycleActions = null;

function _publishFleetCommand(onCommand, type, payload) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeFleetCommand(Object.assign({}, payload || {}, { type: type }));
  return command ? onCommand(command) : false;
}

function _createFleetActionPorts(onCommand) {
  return Object.freeze({
    onBuyShip: function (shipTypeId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.BUY_SHIP, { shipTypeId: shipTypeId });
    },
    onSwitchShip: function (shipIndex) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.SWITCH_SHIP, { shipIndex: shipIndex });
    },
    onUpgradeShip: function (shipIndex, upgradeId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.UPGRADE_SHIP, { shipIndex: shipIndex, upgradeId: upgradeId });
    },
    onAssignRoute: function (shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.ASSIGN_ROUTE, {
        shipIndex: shipIndex,
        buySystemId: buySystemId,
        sellSystemId: sellSystemId,
        goodId: goodId,
        tradePolicy: tradePolicy,
      });
    },
    onCancelRoute: function (shipIndex) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.CANCEL_ROUTE, { shipIndex: shipIndex });
    },
    onBuySlot: function () {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.BUY_SLOT);
    },
    onSellShip: function (shipIndex) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.SELL_SHIP, { shipIndex: shipIndex });
    },
    onInstallMod: function (shipIndex, modId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.INSTALL_MOD, { shipIndex: shipIndex, modId: modId });
    },
    onUninstallMod: function (shipIndex, modId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.UNINSTALL_MOD, { shipIndex: shipIndex, modId: modId });
    },
    onServiceShip: function (shipIndex, tierId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.SERVICE_SHIP, { shipIndex: shipIndex, tierId: tierId });
    },
    onRecruitCrew: function (offerId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.RECRUIT_CREW, { offerId: offerId });
    },
    onAssignCrew: function (shipIndex, crewId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.ASSIGN_CREW, { shipIndex: shipIndex, crewId: crewId });
    },
    onUnassignCrew: function (shipIndex, crewId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.UNASSIGN_CREW, { shipIndex: shipIndex, crewId: crewId });
    },
    onDismissCrew: function (crewId) {
      return _publishFleetCommand(onCommand, FLEET_COMMAND.DISMISS_CREW, { crewId: crewId });
    },
  });
}

export function setLifecycleActions(actions) {
  _lifecycleActions = actions || null;
}

export function getInspectedShipIndex() {
  return Number.isInteger(_inspectedHangarShipIndex) ? _inspectedHangarShipIndex : null;
}

export function renderContextInspector(request) {
  var context = request && request.context;
  var state = request && request.state;
  var container = request && request.container;
  var shipIndex = context ? Number(context.id) : NaN;
  var ship = state && Number.isInteger(shipIndex) ? (state.fleet || [])[shipIndex] : null;
  if (!context || context.type !== 'ship' || !ship || !container) return false;

  var shipType = Fleet.getShipType(ship.typeId) || {};
  var stats = Fleet.getEffectiveShipStats(state, ship);
  var maintenance = stats.maintenance || Fleet.getShipMaintenanceSummary(state, ship);
  var role = stats.roleProfile || Fleet.getShipRoleProfile(state, ship);
  var operating = Fleet.getShipOperatingSummary(state, ship);
  var cargoUsed = getFleetCargoUsed(ship.cargo);
  var maxCargo = Math.max(1, stats.maxCargo || ship.maxCargo || 1);
  var maxFuel = Math.max(1, stats.maxFuel || ship.maxFuel || 1);
  var maxHull = Math.max(1, stats.maxHull || ship.maxHull || 1);

  container.innerHTML =
    '<article class="workspace-context-card workspace-context-card--ship">' +
      '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(shipType.icon || '🚀') + '</span><div><small>' + _escapeHtml(role.label || '舰队成员') + '</small><h3>' + _escapeHtml(ship.name || shipType.name || ('舰船 ' + (shipIndex + 1))) + '</h3></div></div>' +
      '<p>' + _escapeHtml(role.summary || shipType.description || '公司舰队成员。') + '</p>' +
      '<div class="workspace-context-metrics" role="list">' +
        '<span role="listitem"><small>船体</small><strong>' + Math.round(Number(ship.hull) || 0) + '/' + maxHull + '</strong></span>' +
        '<span role="listitem"><small>燃料</small><strong>' + Math.round(Number(ship.fuel) || 0) + '/' + maxFuel + '</strong></span>' +
        '<span role="listitem"><small>货舱</small><strong>' + cargoUsed + '/' + maxCargo + '</strong></span>' +
        '<span role="listitem"><small>维护</small><strong>' + Math.round(maintenance.value || 0) + '%</strong></span>' +
      '</div>' +
      '<div class="workspace-context-tags"><span>' + (shipIndex === (state.activeShipIndex || 0) ? '当前操控舰' : '舰队成员') + '</span><span>' + (ship.route ? '自动跑商中' : '停靠') + '</span><span>累计净额 ' + Math.round(operating.net || 0).toLocaleString() + '</span></div>' +
    '</article>';
  return { title: '舰船检查' };
}

// 全局监听重置事件（用于视图切换时自动归还节点）
EventBus.on('hangar:reset', function() {
  if (_currentPortalCleanup) {
    _currentPortalCleanup({ restoreFocus: false });
  }
  _inspectedHangarShipIndex = null;
});

function _focusInlineElement(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled) return;
  if (target.isConnected === false) return;
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

function _scheduleInlineFocusRestore(selector, fallbackTarget) {
  Promise.resolve().then(function () {
    var target = null;
    if (selector && globalThis.document && typeof document.querySelector === 'function') {
      target = document.querySelector(selector);
    }
    _focusInlineElement(target || fallbackTarget);
  });
}

function _getInlineScrollViewport(inlineContainer) {
  if (!inlineContainer || typeof inlineContainer.closest !== 'function') return null;
  return inlineContainer.closest('.secondary-terminal-content');
}

function _setInlineScrollPosition(viewport, top) {
  if (!viewport) return;
  var nextTop = Number.isFinite(top) ? top : 0;
  if (typeof viewport.scrollTo === 'function') {
    try {
      viewport.scrollTo({ top: nextTop, left: 0, behavior: 'auto' });
      return;
    } catch (err) {
      // Older WebViews may only support direct scrollTop assignment.
    }
  }
  viewport.scrollTop = nextTop;
}

function _renderHangarAfterInlineClose() {
  if (_lifecycleActions && typeof _lifecycleActions.requestRender === 'function') {
    return _lifecycleActions.requestRender();
  }
  return false;
}

/**
 * 核心 Portal 函数：将弹窗中的 .modal-box 搬移至内联容器
 * @param {string} modalId 弹窗元素的ID（如 'mod-modal'）
 * @param {Function} onCloseCallback 当点击返回或关闭时调用的额外回调
 * @param {Object} options 内联区域语义和焦点恢复配置
 */
function _openInlinePortal(modalId, onCloseCallback, options) {
  var portalOptions = options || {};
  // 如果之前已经有活动的 portal，先静默归还
  if (_currentPortalCleanup) {
    _currentPortalCleanup({ restoreFocus: false });
  }

  const listContainer = document.getElementById('fleet-list');
  const inlineContainer = document.getElementById('fleet-inline-container');
  const modal = document.getElementById(modalId);
  if (!listContainer || !inlineContainer || !modal) return false;

  const modalBox = modal.querySelector('.modal-box');
  if (!modalBox) return false;
  const returnFocusTarget = globalThis.document ? document.activeElement : null;
  const scrollViewport = _getInlineScrollViewport(inlineContainer);
  const returnScrollTop = scrollViewport && Number.isFinite(scrollViewport.scrollTop)
    ? scrollViewport.scrollTop
    : 0;

  _activeInlineModalId = modalId;

  // 1. 隐藏原主列表，显示内嵌容器
  listContainer.classList.add('hidden');
  listContainer.setAttribute('aria-hidden', 'true');
  listContainer.inert = true;
  inlineContainer.classList.remove('hidden');
  inlineContainer.setAttribute('aria-hidden', 'false');
  inlineContainer.setAttribute('role', 'region');
  inlineContainer.setAttribute('tabindex', '-1');
  inlineContainer.setAttribute('data-inline-surface', modalId);
  inlineContainer.inert = false;
  if (portalOptions.labelledBy) inlineContainer.setAttribute('aria-labelledby', portalOptions.labelledBy);
  if (portalOptions.describedBy) inlineContainer.setAttribute('aria-describedby', portalOptions.describedBy);
  inlineContainer.innerHTML = '';

  // 2. 创建可被键盘稳定访问的返回栏
  const backBar = document.createElement('div');
  backBar.className = 'inline-portal-back-bar';
  const backButton = document.createElement('button');
  backButton.className = 'inline-portal-back-btn';
  backButton.type = 'button';
  backButton.textContent = '← 返回机库列表';
  backButton.setAttribute('aria-label', '返回机库列表');
  backBar.appendChild(backButton);
  
  // 3. 将返回条和搬移过来的 modalBox 插入到内联容器
  inlineContainer.appendChild(backBar);
  inlineContainer.appendChild(modalBox);
  modalBox.setAttribute('data-surface-mode', 'inline');
  _setInlineScrollPosition(scrollViewport, 0);

  // 4. 定义清理（还原）函数
  const cleanup = function(cleanupOptions) {
    if (_activeInlineModalId !== modalId) return; // 避免重复清理
    var shouldRestoreFocus = !cleanupOptions || cleanupOptions.restoreFocus !== false;

    if (typeof inlineContainer.removeEventListener === 'function') {
      inlineContainer.removeEventListener('keydown', handlePortalKeydown);
    }

    // 把 .modal-box 移回原 modal 容器
    modal.appendChild(modalBox);
    modalBox.removeAttribute('data-surface-mode');
    
    // 隐藏并清空内嵌容器，重新展现列表
    inlineContainer.classList.add('hidden');
    inlineContainer.setAttribute('aria-hidden', 'true');
    inlineContainer.removeAttribute('role');
    inlineContainer.removeAttribute('tabindex');
    inlineContainer.removeAttribute('aria-labelledby');
    inlineContainer.removeAttribute('aria-describedby');
    inlineContainer.removeAttribute('data-inline-surface');
    inlineContainer.inert = true;
    inlineContainer.innerHTML = '';
    listContainer.classList.remove('hidden');
    listContainer.setAttribute('aria-hidden', 'false');
    listContainer.inert = false;
    _setInlineScrollPosition(scrollViewport, returnScrollTop);
    
    _activeInlineModalId = null;
    _currentPortalCleanup = null;
    if (modalId === 'mod-modal') {
      _activeModModalContext = null;
    } else if (modalId === 'dispatch-modal') {
      _activeDispatchModalContext = null;
    }

    if (onCloseCallback) {
      onCloseCallback();
    }
    if (shouldRestoreFocus) {
      _scheduleInlineFocusRestore(portalOptions.returnFocusSelector, returnFocusTarget);
    }
  };

  _currentPortalCleanup = cleanup;

  // 5. 绑定返回按钮事件
  backButton.onclick = function(e) {
    e.preventDefault();
    cleanup();
    _renderHangarAfterInlineClose();
  };

  function handlePortalKeydown(event) {
    if (!event || event.key !== 'Escape' || _activeInlineModalId !== modalId) return;
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    cleanup();
    _renderHangarAfterInlineClose();
  }

  if (typeof inlineContainer.addEventListener === 'function') {
    inlineContainer.addEventListener('keydown', handlePortalKeydown);
  }
  Promise.resolve().then(function () {
    if (_activeInlineModalId !== modalId) return;
    _setInlineScrollPosition(scrollViewport, 0);
    _focusInlineElement(backButton);
  });

  return true;
}

/**
 * 渲染机库主视图。Presenter 拥有只读投影与 HTML，FleetUI 只协调选择、弹层与 command。
 * @param {{state:object, onCommand?:Function}} request
 */
export function render(request) {
  var input = request || {};
  var state = input.state;
  if (!state || _activeInlineModalId !== null) return false;
  var container = document.getElementById('fleet-list');
  if (!container) return false;

  var actions = _createFleetActionPorts(input.onCommand);
  var model = buildFleetHangarModel(state, _inspectedHangarShipIndex);
  if (!model) return false;
  _inspectedHangarShipIndex = model.inspectedIdx;

  if (model.inspectedIdx !== null) {
    ContextInspector.replaceContext({
      type: 'ship',
      id: String(model.inspectedIdx),
      workspaceId: 'fleet',
      source: 'hangar-selection',
      revision: ContextInspector.getCurrentRevision(),
    }, { render: false });
  }

  container.innerHTML = renderFleetHangar(model);
  container.onclick = function (event) {
    var intent = readFleetHangarIntent(event && event.target);
    if (!intent) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    if (intent.type === FLEET_HANGAR_INTENT.INSPECT_SHIP) {
      if (!model.fleet[intent.shipIndex] || intent.shipIndex === _inspectedHangarShipIndex) return;
      _inspectedHangarShipIndex = intent.shipIndex;
      ContextInspector.replaceContext({
        type: 'ship',
        id: String(intent.shipIndex),
        workspaceId: 'fleet',
        source: 'hangar-ship-selector',
        revision: ContextInspector.getCurrentRevision(),
      });
      render(input);
      Promise.resolve().then(function () {
        if (!container || typeof container.querySelector !== 'function') return;
        _focusInlineElement(container.querySelector('.hangar-ship-select[data-ship-index="' + intent.shipIndex + '"]'));
      });
      return;
    }
    if (intent.type === FLEET_HANGAR_INTENT.BUY_SLOT) return actions.onBuySlot();
    if (intent.type === FLEET_HANGAR_INTENT.SWITCH_SHIP) return actions.onSwitchShip(intent.shipIndex);
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_MODS) {
      return _openModModal(state, intent.shipIndex, actions.onInstallMod, actions.onUninstallMod, actions.onUpgradeShip, actions.onServiceShip, actions.onSellShip);
    }
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_CREW) {
      return _openCrewModal(state, intent.shipIndex, actions.onRecruitCrew, actions.onAssignCrew, actions.onUnassignCrew, actions.onDismissCrew, actions.onSwitchShip);
    }
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_DISPATCH) {
      return _openDispatchModal(state, intent.shipIndex, actions.onAssignRoute, actions.onCancelRoute);
    }
    if (intent.type === FLEET_HANGAR_INTENT.CANCEL_ROUTE) return actions.onCancelRoute(intent.shipIndex);
  };

  return true;
}

function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _focusGuidedMod(container, focusModId) {
  if (!container || !focusModId || typeof container.querySelector !== 'function') return;

  var target = container.querySelector('[data-focus-mod="item"]')
    || container.querySelector('[data-focus-mod="recommendation"]');
  if (!target) return;

  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('mod-modal-guidance-focus');
  }
  if (typeof target.setAttribute === 'function') {
    target.setAttribute('tabindex', '-1');
  }
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  _focusInlineElement(target);
}

function _focusGuidedService(container) {
  if (!container || typeof container.querySelector !== 'function') return;
  var target = container.querySelector('.ship-repair-card');
  if (!target) return;
  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('mod-modal-guidance-focus');
  }
  if (typeof target.setAttribute === 'function') target.setAttribute('tabindex', '-1');
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  var serviceButton = target.querySelector && target.querySelector('.ship-repair-start-btn:not([disabled])');
  _focusInlineElement(serviceButton || target);
}

function _getShipSellQuote(ship) {
  var shipTypeDef = SHIP_TYPES.find(function (type) { return type.id === (ship && ship.typeId); });
  var sellBase = shipTypeDef ? (shipTypeDef.sellValue || shipTypeDef.cost || 0) : 0;
  return {
    minPrice: Math.floor(sellBase * 0.45),
    maxPrice: Math.floor(sellBase * 0.80),
  };
}

var STRUCTURE_MODULES = [
  { id: 'cargo', icon: '📦', name: '货舱舱段', desc: '扩展载货能力，只展示当前可推进的下一档。', emptyLabel: '尚未扩容' },
  { id: 'fuel', icon: '⛽', name: '燃料系统', desc: '提升续航储备，保持长线运营的油量冗余。', emptyLabel: '尚未加装' },
  { id: 'engine', icon: '🚀', name: '推进核心', desc: '优化推进效率，压低航行燃耗。', emptyLabel: '尚未调校' },
  { id: 'hull', icon: '🛡️', name: '结构装甲', desc: '强化船体与装甲骨架，提升耐久余量。', emptyLabel: '尚未强化' },
];

var MOD_CATEGORY_META = {
  cargo: { icon: '📦', name: '货舱组件', desc: '围绕装载空间与压缩效率的舱段扩展。' },
  engine: { icon: '🔥', name: '动力组件', desc: '提升推进、续航与探索能力。' },
  hull: { icon: '🛡️', name: '防护组件', desc: '强化结构稳定性与自修复能力。' },
  trade: { icon: '💰', name: '贸易组件', desc: '改善买卖价格、走私安全和贸易收益。' },
};

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

function _formatStructureModuleEffect(moduleId, installedUpgrades) {
  if (!installedUpgrades || installedUpgrades.length === 0) return '';

  if (moduleId === 'engine') {
    var fuelFactor = installedUpgrades.reduce(function (factor, upgrade) {
      return factor * (upgrade.effect && upgrade.effect.fuelEff ? upgrade.effect.fuelEff : 1);
    }, 1);
    return '航耗 -' + Math.round((1 - fuelFactor) * 100) + '%';
  }

  var total = installedUpgrades.reduce(function (sum, upgrade) {
    if (moduleId === 'cargo') return sum + ((upgrade.effect && upgrade.effect.cargo) || 0);
    if (moduleId === 'fuel') return sum + ((upgrade.effect && upgrade.effect.maxFuel) || 0);
    return sum + ((upgrade.effect && upgrade.effect.hull) || 0);
  }, 0);

  if (moduleId === 'cargo') return '货舱 +' + total;
  if (moduleId === 'fuel') return '燃料 +' + total;
  return '船体 +' + total;
}

function _getStructureModuleStates(state, ship) {
  return STRUCTURE_MODULES.map(function (moduleDef) {
    var moduleUpgrades = SHIP_UPGRADES.filter(function (upgrade) {
      return _getStructureModuleId(upgrade) === moduleDef.id;
    });
    var installedUpgrades = moduleUpgrades.filter(function (upgrade) {
      return (ship.upgrades || []).includes(upgrade.id);
    });
    var nextUpgrade = moduleUpgrades.find(function (upgrade) {
      return !(ship.upgrades || []).includes(upgrade.id);
    }) || null;
    var atCap = false;

    if (nextUpgrade) {
      if (nextUpgrade.effect.cargo && ship.maxCargo + nextUpgrade.effect.cargo > ship.maxCargoCap) atCap = true;
      if (nextUpgrade.effect.maxFuel && ship.maxFuel + nextUpgrade.effect.maxFuel > ship.maxFuelCap) atCap = true;
      if (nextUpgrade.effect.hull && ship.maxHull + nextUpgrade.effect.hull > ship.maxHullCap) atCap = true;
      if (nextUpgrade.effect.fuelEff && ship.fuelEff * nextUpgrade.effect.fuelEff < ship.minFuelEff) atCap = true;
    }

    return {
      id: moduleDef.id,
      icon: moduleDef.icon,
      name: moduleDef.name,
      desc: moduleDef.desc,
      level: installedUpgrades.length,
      totalLevels: moduleUpgrades.length,
      installedLabel: installedUpgrades.length > 0
        ? installedUpgrades[installedUpgrades.length - 1].name
        : moduleDef.emptyLabel,
      currentEffectText: installedUpgrades.length > 0
        ? _formatStructureModuleEffect(moduleDef.id, installedUpgrades)
        : moduleDef.emptyLabel,
      nextUpgrade: nextUpgrade,
      nextEffectText: nextUpgrade ? _formatEffectText(nextUpgrade.effect) : '已达当前上限',
      canAfford: !!(nextUpgrade && state.credits >= nextUpgrade.cost),
      disabledReason: !nextUpgrade ? '已达当前上限' : (atCap ? '已达船体极限' : ''),
    };
  });
}

function _getComponentModuleGroups(state, ship, installedMods, availableMods, slotsLeft) {
  return Object.keys(MOD_CATEGORY_META).map(function (categoryId) {
    var meta = MOD_CATEGORY_META[categoryId];
    var installed = installedMods.filter(function (mod) { return mod.category === categoryId; });
    var readyMods = [];
    var lockedCount = 0;

    availableMods.forEach(function (mod) {
      if (mod.category !== categoryId) return;
      var prereqOk = !mod.requires || (ship.mods || []).includes(mod.requires);
      if (!prereqOk) {
        lockedCount += 1;
        return;
      }
      readyMods.push(mod);
    });

    return {
      id: categoryId,
      icon: meta.icon,
      name: meta.name,
      desc: meta.desc,
      installed: installed,
      readyMods: readyMods,
      lockedCount: lockedCount,
      slotsLeft: slotsLeft,
      credits: state.credits,
    };
  });
}

function _renderModModalSignalMetric(label, value, note, tone) {
  var className = 'mod-modal-signal-item' + (tone ? (' mod-modal-signal-item--' + _escapeHtml(tone)) : '');
  return '<div class="' + className + '" role="listitem">' +
    '<span class="mod-modal-signal-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="mod-modal-signal-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="mod-modal-signal-note">' + _escapeHtml(note || '') + '</span>' +
  '</div>';
}

function _buildModModalSignalPanel(options) {
  var opts = options || {};
  var ship = opts.ship || {};
  var maintenance = opts.maintenance || {};
  var structureModules = opts.structureModules || [];
  var componentGroups = opts.componentGroups || [];
  var faults = opts.faults || [];
  var modRecommendation = opts.modRecommendation || null;
  var repairQuote = opts.repairQuote || null;
  var repairJob = opts.repairJob || null;
  var roleProfile = opts.roleProfile || {};
  var sellQuote = opts.sellQuote || null;
  var hullMissing = Math.max(0, opts.hullMissing || 0);
  var slotsLeft = Math.max(0, opts.slotsLeft || 0);
  var installedModCount = Array.isArray(ship.mods) ? ship.mods.length : 0;
  var modSlots = Math.max(1, ship.modSlots || 1);
  var repairNeeded = hullMissing > 0 || faults.length > 0 || (maintenance.value || 100) < 99.5;
  var structureReadyCount = structureModules.filter(function (moduleState) {
    return !!(moduleState.nextUpgrade && !moduleState.disabledReason && moduleState.canAfford);
  }).length;
  var structureBlockedCount = structureModules.filter(function (moduleState) {
    return !!(moduleState.nextUpgrade && (moduleState.disabledReason || !moduleState.canAfford));
  }).length;
  var readyModCount = componentGroups.reduce(function (sum, group) {
    return sum + ((group.readyMods || []).filter(function (mod) {
      return group.slotsLeft > 0 && group.credits >= mod.cost;
    }).length);
  }, 0);
  var lockedModCount = componentGroups.reduce(function (sum, group) {
    return sum + (group.lockedCount || 0);
  }, 0);
  var repairValue = '稳定';
  var repairNote = '当前无需保养';
  var repairTone = 'complete';
  var structureValue = structureReadyCount > 0 ? (structureReadyCount + ' 可升级') : '待筹备';
  var structureNote = structureReadyCount > 0
    ? '可直接推进下一档结构强化'
    : (structureBlockedCount > 0 ? (structureBlockedCount + ' 项受预算或上限限制') : '结构模块已整理');
  var structureTone = structureReadyCount > 0 ? 'ready' : (structureBlockedCount > 0 ? 'blocked' : 'complete');
  var componentValue = installedModCount + '/' + modSlots;
  var componentNote = readyModCount > 0
    ? (readyModCount + ' 项可安装')
    : (slotsLeft <= 0 ? '槽位已满' : (lockedModCount > 0 ? (lockedModCount + ' 项待解锁') : '无待装组件'));
  var componentTone = readyModCount > 0 ? 'ready' : (slotsLeft <= 0 ? 'blocked' : 'complete');
  var assetValue = opts.sellDisabledReason ? '锁定' : '可处置';
  var assetNote = opts.sellDisabledReason || (sellQuote && sellQuote.maxPrice > 0
    ? ('回收 ' + sellQuote.minPrice.toLocaleString() + '~' + sellQuote.maxPrice.toLocaleString())
    : '暂无回收价');
  var assetTone = opts.sellDisabledReason ? 'blocked' : 'ready';
  var focusTitle = '改装状态稳定';
  var focusNote = '维修、结构和组件都正常，可按当前船型用途继续调整。';
  var focusTone = 'complete';

  if (repairQuote && !repairQuote.disabledReason && repairNeeded) {
    repairValue = '可保养';
    repairNote = repairQuote.cost.toLocaleString() + ' 积分 · 即时完成';
    repairTone = 'work';
    focusTitle = '保养优先';
    focusNote = '维护 ' + Math.round(maintenance.value || 0) + '%，船体缺口 ' + hullMissing + '，可在港口即时恢复。';
    focusTone = 'repair';
  } else if (repairQuote && repairQuote.disabledReason && repairQuote.disabledReason !== '当前无需维修') {
    repairValue = '受限';
    repairNote = repairQuote.disabledReason;
    repairTone = 'blocked';
  }

  if (focusTone === 'complete' && modRecommendation && modRecommendation.canInstall) {
    focusTitle = '推荐组件可安装';
    focusNote = modRecommendation.mod.name + '：' + modRecommendation.reason;
    focusTone = 'module';
  } else if (focusTone === 'complete' && modRecommendation && modRecommendation.disabledReason) {
    focusTitle = '推荐组件受限';
    focusNote = modRecommendation.mod.name + '：' + modRecommendation.disabledReason;
    focusTone = 'blocked';
  } else if (focusTone === 'complete' && structureReadyCount > 0) {
    focusTitle = '结构模块可推进';
    focusNote = structureReadyCount + ' 个结构模块满足预算和上限条件，可先补齐最短板。';
    focusTone = 'structure';
  } else if (focusTone === 'complete' && readyModCount > 0) {
    focusTitle = '组件槽位可利用';
    focusNote = '当前还有 ' + slotsLeft + ' 个槽位，' + readyModCount + ' 项组件可直接安装。';
    focusTone = 'module';
  } else if (focusTone === 'complete' && slotsLeft <= 0 && installedModCount > 0) {
    focusTitle = '组件槽位已满';
    focusNote = '安装新组件前需要先拆卸低优先级组件，避免在长列表里反复确认。';
    focusTone = 'blocked';
  } else if (focusTone === 'complete' && opts.sellDisabledReason) {
    focusTitle = '资产处置受限';
    focusNote = opts.sellDisabledReason;
    focusTone = 'blocked';
  }

  return '<section class="mod-modal-signal-panel" aria-label="改装当前状态">' +
    '<div class="mod-modal-signal-head">' +
      '<div>' +
        '<div class="mod-modal-signal-title">改装当前状态</div>' +
        '<div class="mod-modal-signal-subtitle">把维修、结构、组件和资产限制合并到一屏，先确认当前船的改装优先级。</div>' +
      '</div>' +
      '<span class="mod-modal-signal-badge">' + _escapeHtml(roleProfile.label || '综合用途') + '</span>' +
    '</div>' +
    '<div class="mod-modal-signal-grid" role="list" aria-label="改装决策指标">' +
      _renderModModalSignalMetric('维修', repairValue, repairNote, repairTone) +
      _renderModModalSignalMetric('结构', structureValue, structureNote, structureTone) +
      _renderModModalSignalMetric('组件', componentValue, componentNote, componentTone) +
      _renderModModalSignalMetric('资产', assetValue, assetNote, assetTone) +
    '</div>' +
    '<div class="mod-modal-signal-focus" role="status" aria-label="改装处理状态" data-tone="' + _escapeHtml(focusTone) + '">' +
      '<span class="mod-modal-signal-focus-kicker">处理状态</span>' +
      '<strong class="mod-modal-signal-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="mod-modal-signal-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _getRepairCountdownText(repairJob) {
  if (!repairJob || !repairJob.remainingDays) return '';
  return '维修中 · 剩余 ' + repairJob.remainingDays + ' 天';
}

function _openCrewModal(state, shipIndex, onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew, onSwitchShip) {
  _inspectedHangarShipIndex = shipIndex;
  var modal = document.getElementById('crew-modal');
  if (!modal) return false;
  var modalBox = modal.querySelector('.modal-box');
  if (!modalBox || !state.fleet || !state.fleet[shipIndex]) return false;

  var portalOpened = _openInlinePortal('crew-modal', function () {
    hideBlockingSurface('crew-modal');
  }, {
    labelledBy: 'crew-modal-title',
    describedBy: 'crew-modal-desc crew-modal-summary',
    returnFocusSelector: '.fleet-open-crew-btn[data-ship-index="' + shipIndex + '"]',
  });
  if (!portalOpened) showBlockingSurface('crew-modal', { focusSelector: '#crew-modal-close' });

  var titleEl = document.getElementById('crew-modal-title');
  var summaryEl = document.getElementById('crew-modal-summary');
  var assignedStatusEl = document.getElementById('crew-assigned-status');
  var reserveStatusEl = document.getElementById('crew-reserve-status');
  var marketStatusEl = document.getElementById('crew-market-status');
  var assignedEl = document.getElementById('crew-assigned-list');
  var reserveEl = document.getElementById('crew-reserve-list');
  var marketEl = document.getElementById('crew-market-list');

  function renderCrewModal() {
    var model = buildFleetCrewModel(state, shipIndex);
    var view = renderFleetCrew(model);
    if (!model || !view) return false;
    Object.keys(view.dataset).forEach(function (key) {
      if (modal.dataset) modal.dataset[key] = view.dataset[key];
      if (modalBox.dataset) modalBox.dataset[key] = view.dataset[key];
    });
    titleEl.textContent = view.title;
    summaryEl.innerHTML = view.summary;
    assignedStatusEl.innerHTML = view.assignedStatus;
    reserveStatusEl.innerHTML = view.reserveStatus;
    marketStatusEl.innerHTML = view.marketStatus;
    assignedEl.innerHTML = view.assigned;
    reserveEl.innerHTML = view.reserve;
    marketEl.innerHTML = view.market;

    modalBox.onclick = function (event) {
      var intent = readFleetCrewIntent(event && event.target);
      if (!intent) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (intent.type === FLEET_CREW_INTENT.UNASSIGN) {
        onUnassignCrew(intent.shipIndex, intent.crewId);
        return renderCrewModal();
      }
      if (intent.type === FLEET_CREW_INTENT.ASSIGN) {
        onAssignCrew(intent.shipIndex, intent.crewId);
        return renderCrewModal();
      }
      if (intent.type === FLEET_CREW_INTENT.RECRUIT) {
        onRecruitCrew(intent.offerId);
        return renderCrewModal();
      }
      if (intent.type === FLEET_CREW_INTENT.SWITCH_SHIP) {
        onSwitchShip(intent.shipIndex);
        setTimeout(renderCrewModal, 50);
        return;
      }
      if (intent.type === FLEET_CREW_INTENT.DISMISS) {
        var crewMember = model.reserveCrew.find(function (member) { return member.id === intent.crewId; });
        ActionConfirmUI.open({
          kicker: '船员合同',
          title: '解雇「' + (crewMember ? crewMember.name : '该船员') + '」？',
          message: '该船员会从预备队永久移除，已积累的等级和经验无法恢复。',
          confirmLabel: '确认解雇',
          details: [
            { label: '当前岗位', value: crewMember ? (crewMember.roleName || crewMember.title || '未指定') : '预备队', tone: 'neutral' },
            { label: '人员记录', value: '永久移除', tone: 'danger' },
          ],
          onConfirm: function () {
            onDismissCrew(intent.crewId);
            renderCrewModal();
          },
        });
      }
    };
    return true;
  }

  renderCrewModal();
  document.getElementById('crew-modal-close').onclick = function () {
    if (_currentPortalCleanup) _currentPortalCleanup();
    else hideBlockingSurface('crew-modal');
    _renderHangarAfterInlineClose();
  };
  return true;
}

// ---------------------------------------------------------------------------
// 船只商店（独立标签页）
// ---------------------------------------------------------------------------

function _getShipShopRoleLabel(shipType) {
  if (!shipType) return '综合用途';
  if (shipType.modSlots >= 3 || shipType.id === 'galleon') return '旗舰骨架';
  if (shipType.fuelEff <= 0.8 || shipType.id === 'clipper') return '高速航路';
  if (shipType.maxCargo >= 100 || shipType.id === 'freighter') return '货运主力';
  return '综合用途';
}

function _buildShipShopContext(state) {
  var fleet = Fleet.getFleet(state);
  var slotCount = Fleet.getSlotCount(state);
  var maxSlots = Fleet.getMaxSlots();
  var routeLevel = Fleet.getDispatchRouteLevel(state);
  var hasAvailableSlot = Fleet.getAvailableSlotCount(state) > 0;
  var credits = state.credits || 0;
  var paidTypes = SHIP_TYPES.filter(function (shipType) { return shipType.cost > 0; });
  var ownedTypeCounts = fleet.reduce(function (map, ship) {
    map[ship.typeId] = (map[ship.typeId] || 0) + 1;
    return map;
  }, {});
  var fleetCargoCap = fleet.reduce(function (sum, ship) {
    var stats = Fleet.getEffectiveShipStats(state, ship);
    return sum + (stats.maxCargo || ship.maxCargo || 0);
  }, 0);
  var averageCargoCap = fleet.length ? Math.round(fleetCargoCap / fleet.length) : 0;
  var hasCargoCore = fleet.some(function (ship) { return ship.typeId === 'freighter' || ship.typeId === 'galleon'; });
  var hasFastHull = fleet.some(function (ship) { return ship.typeId === 'clipper'; });
  var hasFlagshipHull = fleet.some(function (ship) { return ship.typeId === 'galleon'; });

  var entries = paidTypes.map(function (shipType) {
    var roleLabel = _getShipShopRoleLabel(shipType);
    var canAfford = credits >= shipType.cost;
    var creditGap = Math.max(0, shipType.cost - credits);
    var diversityBonus = ownedTypeCounts[shipType.id] ? -35 : 80;
    var roleFit = 0;
    if (!hasCargoCore && roleLabel === '货运主力') roleFit += 120;
    if (!hasFastHull && roleLabel === '高速航路') roleFit += 95;
    if (!hasFlagshipHull && roleLabel === '旗舰骨架' && fleet.length >= 2) roleFit += 105;
    var rangeValue = Math.round(shipType.maxFuelCap / Math.max(0.1, shipType.fuelEff));
    var score = (shipType.maxCargo || 0) + Math.round(rangeValue / 8) + (shipType.modSlots || 1) * 24 + diversityBonus + roleFit;

    return {
      type: shipType,
      roleLabel: roleLabel,
      canAfford: canAfford,
      creditGap: creditGap,
      ownedCount: ownedTypeCounts[shipType.id] || 0,
      rangeValue: rangeValue,
      cargoLift: Math.max(0, (shipType.maxCargo || 0) - averageCargoCap),
      score: score,
    };
  });

  var affordableEntries = entries.filter(function (entry) { return entry.canAfford; });
  var focusEntry = hasAvailableSlot && affordableEntries.length > 0
    ? affordableEntries.slice().sort(function (left, right) {
        if (left.score !== right.score) return right.score - left.score;
        return left.type.cost - right.type.cost;
      })[0]
    : null;
  var closestEntry = entries.slice().sort(function (left, right) {
    if (left.creditGap !== right.creditGap) return left.creditGap - right.creditGap;
    return left.type.cost - right.type.cost;
  })[0] || null;

  return {
    credits: credits,
    fleet: fleet,
    fleetLen: fleet.length,
    slotCount: slotCount,
    maxSlots: maxSlots,
    routeLevel: routeLevel,
    hasAvailableSlot: hasAvailableSlot,
    entries: entries,
    affordableEntries: affordableEntries,
    focusEntry: focusEntry,
    closestEntry: closestEntry,
    averageCargoCap: averageCargoCap,
  };
}

function _renderShipShopBrief(context) {
  var slotText = context.fleetLen + '/' + context.slotCount;
  var slotMeta = context.hasAvailableSlot
    ? ('空席位 ' + Math.max(0, context.slotCount - context.fleetLen) + ' · 锁定 ' + Math.max(0, context.maxSlots - context.slotCount))
    : ('席位已满 · 上限 ' + context.maxSlots);
  var budgetMeta = context.closestEntry && context.closestEntry.creditGap > 0
    ? ('距 ' + context.closestEntry.type.name + ' 还差 ' + context.closestEntry.creditGap.toLocaleString())
    : '预算覆盖当前候选';
  var focusTitle = context.focusEntry
    ? context.focusEntry.type.emoji + ' ' + context.focusEntry.type.name
    : (context.hasAvailableSlot ? '预算观察' : '采购暂停');
  var focusBody = context.focusEntry
    ? (context.focusEntry.roleLabel + ' · 货舱上限 ' + context.focusEntry.type.maxCargo + ' · 航程能力 ' + context.focusEntry.rangeValue)
    : (context.hasAvailableSlot
        ? (context.closestEntry ? budgetMeta : '暂无候选船型')
        : '当前没有空席位，新船购买按钮会保持锁定');
  var focusMeta = context.focusEntry
    ? ('购船情况 · 已拥有同型 ' + context.focusEntry.ownedCount)
    : (context.hasAvailableSlot ? '预算状态' : '船位状态');

  return '<section class="hangar-shop-brief" aria-label="购船决策摘要">' +
    '<div class="hangar-shop-brief-grid" role="list" aria-label="采购状态概览">' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>可用信用积分</span><strong>' + context.credits.toLocaleString() + '</strong><small>' + _escapeHtml(budgetMeta) + '</small></div>' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>可采购</span><strong>' + context.affordableEntries.length + '/' + context.entries.length + '</strong><small>按当前预算计算</small></div>' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>席位</span><strong>' + slotText + '</strong><small>' + _escapeHtml(slotMeta) + '</small></div>' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>航线等级</span><strong>Lv.' + context.routeLevel + '</strong><small>购船后沿用当前跑商等级</small></div>' +
    '</div>' +
    '<div class="hangar-shop-focus" aria-label="购船建议">' +
      '<div><span>购船建议</span><strong>' + _escapeHtml(focusTitle) + '</strong><small>' + _escapeHtml(focusBody) + '</small></div>' +
      '<span class="hangar-shop-focus-badge">' + _escapeHtml(focusMeta) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderShipShopSignalStrip(entry, context) {
  var statusText = !context.hasAvailableSlot
    ? '席位锁定'
    : (entry.canAfford ? '可采购' : ('差额 ' + entry.creditGap.toLocaleString()));
  var statusClass = !context.hasAvailableSlot
    ? 'fleet-shop-status-pill--locked'
    : (entry.canAfford ? 'fleet-shop-status-pill--ready' : 'fleet-shop-status-pill--blocked');

  return '<div class="fleet-shop-signal-strip" role="list" aria-label="' + _escapeHtml(entry.type.name) + '购船信息">' +
    '<span role="listitem">用途 ' + _escapeHtml(entry.roleLabel) + '</span>' +
    '<span role="listitem">航程能力 ' + entry.rangeValue + '</span>' +
    '<span role="listitem">货舱增加 +' + entry.cargoLift + '</span>' +
    '<span class="fleet-shop-status-pill ' + statusClass + '" role="listitem">' + _escapeHtml(statusText) + '</span>' +
  '</div>';
}

/**
 * 渲染船只商店标签页
 * @param {{state:object, onCommand?:Function}} request
 */
export function renderShop(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  const container = document.getElementById('shop-list');
  if (!container) return false;

  var shopContext = _buildShipShopContext(state);
  var hasAvailableSlot = shopContext.hasAvailableSlot;
  var slotCount = shopContext.slotCount;
  var fleetLen  = shopContext.fleetLen;

  var html = '';

  html += '<section class="hangar-shop-hero">';
  html += '<div class="hangar-shop-kicker">SHIP ACQUISITION</div>';
  html += '<h2>船坞采购甲板</h2>';
  html += '<p>按机库席位、现金流和航线等级选择下一艘船。购买后可进入改装与人员配置流程。</p>';
  html += '<div class="shop-slot-hint">🎫 席位：' + fleetLen + '/' + slotCount +
          (hasAvailableSlot ? ' — 可购买新船' : ' — 席位已满，需先购买席位') + '</div>';
  html += '</section>';
  html += _renderShipShopBrief(shopContext);
  html += '<div class="fleet-section-title">🏪 船只商店</div>';
  html += '<div class="hangar-shop-grid">';

  shopContext.entries.forEach(function (entry) {
    const st = entry.type;
    const canAfford = entry.canAfford;
    const isFocus = shopContext.focusEntry && shopContext.focusEntry.type.id === st.id;

    html += '<div class="fleet-shop-card' + (isFocus ? ' fleet-shop-card--focus' : '') + '">';
    html += '<div class="fleet-shop-header">';
    html += '<span class="fleet-ship-icon">' + st.emoji + '</span>';
    html += '<span class="fleet-ship-name">' + _escapeHtml(st.name) + '</span>';
    html += '<span class="fleet-shop-price">' + st.cost.toLocaleString() + ' 积分</span>';
    html += '</div>';
    html += '<div class="fleet-shop-desc">' + _escapeHtml(st.desc) + '</div>';
    html += _renderShipShopSignalStrip(entry, shopContext);
    html += '<div class="fleet-shop-specs">';
    html += '📦' + st.cargo + '(→' + st.maxCargo + ') ';
    html += '⚡' + st.fuel + '(→' + st.maxFuelCap + ') ';
    html += '🛡️' + st.hull + '(→' + st.maxHullCap + ') ';
    html += '🔧×' + st.fuelEff + '(→' + st.minFuelEff + ')';
    html += '</div>';

    // 改装槽位和技能预览
    html += '<div class="fleet-shop-extras">';
    html += '<span class="fleet-shop-mod-slots">🔧 改装槽：' + (st.modSlots || 1) + '</span>';
    if (st.skills && st.skills.length > 0) {
      html += '<span class="fleet-shop-skills">';
      st.skills.forEach(function (skill) {
        html += '<span class="fleet-shop-skill-chip" title="' + _escapeHtml(skill.desc) + '">' + skill.emoji + ' ' + _escapeHtml(skill.name) + '</span>';
      });
      html += '</span>';
    }
    html += '</div>';

    if (!hasAvailableSlot) {
      html += '<button class="fleet-buy-btn" disabled>需要先购买席位</button>';
    } else if (!canAfford) {
      html += '<button class="fleet-buy-btn" disabled>积分不足</button>';
    } else {
      html += '<button class="fleet-buy-btn fleet-can-buy" data-type="' + st.id + '">购买</button>';
    }
    html += '</div>';
  });
  html += '</div>';

  container.innerHTML = html;

  // 绑定购买事件
  container.querySelectorAll('.fleet-can-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      actions.onBuyShip(btn.dataset.type);
    });
  });
  return true;
}

export function openDispatchModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  _openDispatchModal(input.state, input.shipIndex, actions.onAssignRoute, actions.onCancelRoute, input.preset);
  return true;
}

export function openCrewModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  _openCrewModal(input.state, input.shipIndex, actions.onRecruitCrew, actions.onAssignCrew, actions.onUnassignCrew, actions.onDismissCrew, actions.onSwitchShip);
  return true;
}

export function openModModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = _createFleetActionPorts(input.onCommand);
  _openModModal(input.state, input.shipIndex, actions.onInstallMod, actions.onUninstallMod, actions.onUpgradeShip, actions.onServiceShip, actions.onSellShip, input.options);
  return true;
}

export function getActiveModModalContext() {
  if (_activeInlineModalId !== 'mod-modal' || !_activeModModalContext) return null;
  return Object.assign({}, _activeModModalContext);
}

export function getActiveDispatchModalContext() {
  if (_activeInlineModalId !== 'dispatch-modal' || !_activeDispatchModalContext) return null;
  return Object.assign({}, _activeDispatchModalContext);
}

// ---------------------------------------------------------------------------
// 改装弹窗
// ---------------------------------------------------------------------------

function _openModModal(state, shipIndex, onInstallMod, onUninstallMod, onUpgradeShip, onServiceShip, onSellShip, options) {
  _inspectedHangarShipIndex = shipIndex;
  var modal = document.getElementById('mod-modal');
  if (!modal) return;
  var opts = options || {};
  var focusModId = opts.focusModId || '';
  var focusService = !!opts.focusService;
  _activeModModalContext = {
    shipIndex: shipIndex,
    focusModId: focusModId,
    focusService: focusService,
    recommendedModId: '',
  };

  var portalOpened = _openInlinePortal('mod-modal', function() {
    hideBlockingSurface('mod-modal');
  }, {
    labelledBy: 'mod-modal-title',
    describedBy: 'mod-modal-desc mod-modal-body',
    returnFocusSelector: '.fleet-open-mod-btn[data-ship-index="' + shipIndex + '"]',
  });
  if (!portalOpened) showBlockingSurface('mod-modal', { focusSelector: '#mod-modal-close' });

  function _renderModModal() {
    var ship = state.fleet[shipIndex];
    if (!ship) {
      if (_currentPortalCleanup) _currentPortalCleanup();
      return;
    }

    var shipStats = Fleet.getEffectiveShipStats(state, ship);
    var maintenance = shipStats.maintenance || Fleet.getShipMaintenanceSummary(state, ship);
    var operating = Fleet.getShipOperatingSummary(state, ship);
    var roleProfile = shipStats.roleProfile || Fleet.getShipRoleProfile(state, ship);
    var faults = shipStats.faults || Fleet.getShipFaultSummaries(ship);
    var modRecommendation = Fleet.getShipModRecommendation
      ? Fleet.getShipModRecommendation(state, shipIndex)
      : null;
    _activeModModalContext = {
      shipIndex: shipIndex,
      focusModId: focusModId,
      recommendedModId: modRecommendation ? modRecommendation.modId : '',
    };
    var repairQuote = Fleet.getShipRepairQuote(state, shipIndex);
    var repairJob = ship.repairJob && ship.repairJob.remainingDays > 0 ? ship.repairJob : null;
    var hullMissing = Math.max(0, (ship.maxHull || ship.hull || 0) - (ship.hull || 0));
    var isActive = shipIndex === (state.activeShipIndex || 0);
    var installedUpgrades = SHIP_UPGRADES.filter(function (upgrade) {
      return (ship.upgrades || []).includes(upgrade.id);
    });
    var structureModules = _getStructureModuleStates(state, ship);
    var installedMods = (ship.mods || []).map(function (modId) {
      return SHIP_MODS.find(function (mod) { return mod.id === modId; });
    }).filter(Boolean);
    var slotsLeft = (ship.modSlots || 1) - (ship.mods || []).length;
    var availableMods = SHIP_MODS.filter(function (mod) {
      return !(ship.mods || []).includes(mod.id);
    });
    var componentGroups = _getComponentModuleGroups(state, ship, installedMods, availableMods, slotsLeft);
    var sellQuote = _getShipSellQuote(ship);
    var sellDisabledReason = null;

    if (state.fleet.length <= 1) sellDisabledReason = '至少保留一艘船。';
    else if (ship.route) sellDisabledReason = '跑商中的飞船需先召回。';
    else if (isActive) sellDisabledReason = '当前操控中的飞船需先切换到其他船只。';

    document.getElementById('mod-modal-title').textContent =
      '🔧 ' + ship.emoji + ' ' + ship.name + ' — 模块改装 / 维修';

    var body = document.getElementById('mod-modal-body');
    var html = '';

    html += '<div class="mod-modal-overview" role="list" aria-label="飞船改装摘要">';
    html += '<span class="fleet-role-chip" role="listitem" title="' + _escapeHtml(roleProfile.summary || '') + '">🎯 ' + _escapeHtml(roleProfile.label || '综合用途') + '</span>';
    html += '<span class="fleet-maintenance-chip fleet-maintenance-' + maintenance.band + '" role="listitem">🧰 ' + _escapeHtml(maintenance.label) + ' ' + Math.round(maintenance.value) + '%</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">升级 ' + installedUpgrades.length + '</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">组件 ' + (ship.mods || []).length + '/' + (ship.modSlots || 1) + '</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">船体缺口 ' + hullMissing + '</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">日常养护 ' + maintenance.upkeepCost + '/天</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">磨损 ' + maintenance.dailyDecay.toFixed(1) + '/天</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">跑商实际盈亏 ' + (operating.net >= 0 ? '+' : '') + Math.round(operating.net).toLocaleString() + '</span>';
    html += '<span class="mod-modal-overview-stat" role="listitem">完成循环 ' + operating.tradeCycles + '</span>';
    html += '<span class="mod-modal-overview-stat' + (repairJob ? ' mod-modal-overview-stat--repair' : '') + '" role="listitem">' + _escapeHtml(repairJob ? _getRepairCountdownText(repairJob) : (ship.route ? '跑商中，需召回后维修' : '已停靠，可安排维修')) + '</span>';
    html += '</div>';
    html += _buildModModalSignalPanel({
      ship: ship,
      maintenance: maintenance,
      roleProfile: roleProfile,
      faults: faults,
      modRecommendation: modRecommendation,
      repairQuote: repairQuote,
      repairJob: repairJob,
      hullMissing: hullMissing,
      structureModules: structureModules,
      componentGroups: componentGroups,
      slotsLeft: slotsLeft,
      sellQuote: sellQuote,
      sellDisabledReason: sellDisabledReason,
    });

    if (modRecommendation) {
      var recommendationFocused = !!(focusModId && modRecommendation.modId === focusModId);
      html += '<div class="mod-modal-recommendation' + (recommendationFocused ? ' mod-modal-recommendation--focus' : '') + '"' +
              ' role="group" aria-label="' + _escapeHtml('推荐组件 ' + modRecommendation.mod.name) + '"' +
              (recommendationFocused ? ' data-focus-mod="recommendation"' : '') + '>';
      html += '<div class="mod-modal-recommendation-copy">';
      html += '<div class="mod-modal-recommendation-title">🧩 推荐组件 · ' + modRecommendation.mod.emoji + ' ' + _escapeHtml(modRecommendation.mod.name) + '</div>';
      html += '<div class="mod-modal-recommendation-reason">' + _escapeHtml(modRecommendation.reason) + '</div>';
      if (modRecommendation.disabledReason) {
        html += '<div class="mod-modal-recommendation-note">当前限制：' + _escapeHtml(modRecommendation.disabledReason) + '</div>';
      }
      html += '</div>';
      html += '<button class="mod-modal-buy-btn mod-modal-recommendation-btn" type="button"' +
              (modRecommendation.canInstall ? '' : ' disabled') +
              ' data-mod="' + modRecommendation.modId + '">' +
              (modRecommendation.canInstall ? ('安装 · ' + modRecommendation.mod.cost.toLocaleString()) : '暂不可装') +
              '</button>';
      html += '</div>';
    }

    html += '<h4 class="mod-modal-section-title">结构模块</h4>';
    html += '<div class="mod-modal-structure-grid">';
    structureModules.forEach(function (moduleState) {
      var nextUpgrade = moduleState.nextUpgrade;
      var disabled = !!moduleState.disabledReason;
      var canBuy = !!(nextUpgrade && !disabled && moduleState.canAfford);
      var cardClass = 'mod-modal-structure-card';
      if (!nextUpgrade) cardClass += ' mod-modal-structure-card--done';
      else if (disabled) cardClass += ' mod-modal-structure-card--locked';
      else if (!moduleState.canAfford) cardClass += ' mod-modal-structure-card--poor';

      var structureProgress = moduleState.totalLevels > 0
        ? Math.max(0, Math.min(100, Math.round((moduleState.level / moduleState.totalLevels) * 100)))
        : 100;
      html += '<article class="' + cardClass + '" role="group" aria-label="' + _escapeHtml(moduleState.name + ' Lv.' + moduleState.level + '/' + moduleState.totalLevels) + '">';
      html += '<div class="mod-modal-structure-head">';
      html += '<div>'; 
      html += '<div class="mod-modal-structure-name">' + moduleState.icon + ' ' + _escapeHtml(moduleState.name) + '</div>';
      html += '<div class="mod-modal-structure-desc">' + _escapeHtml(moduleState.desc) + '</div>';
      html += '</div>';
      html += '<span class="mod-modal-structure-level">Lv.' + moduleState.level + '/' + moduleState.totalLevels + '</span>';
      html += '</div>';
      html += '<div class="mod-modal-structure-progress" role="progressbar" aria-label="' + _escapeHtml(moduleState.name + ' 升级进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + structureProgress + '"><div class="mod-modal-structure-progress-fill" style="width:' + structureProgress + '%"></div></div>';
      html += '<div class="mod-modal-structure-current">';
      html += '<span class="mod-modal-structure-current-label">当前状态</span>';
      html += '<strong>' + _escapeHtml(moduleState.currentEffectText) + '</strong>';
      html += '<span>' + _escapeHtml(moduleState.installedLabel) + '</span>';
      html += '</div>';
      if (nextUpgrade) {
        html += '<div class="mod-modal-structure-next">';
        html += '<div class="mod-modal-structure-next-label">可升级项</div>';
        html += '<div class="mod-modal-structure-next-name">' + _escapeHtml(nextUpgrade.name) + '</div>';
        html += '<div class="mod-modal-structure-next-desc">' + _escapeHtml(moduleState.nextEffectText || nextUpgrade.desc) + '</div>';
        if (disabled) {
          html += '<div class="mod-modal-structure-note">🚫 ' + _escapeHtml(moduleState.disabledReason) + '</div>';
        }
        html += '<button class="upg-modal-buy-btn mod-modal-structure-btn' + (moduleState.canAfford ? '' : ' upg-modal-no-afford') + '" type="button"' +
                (canBuy ? '' : ' disabled') +
                ' data-upgrade="' + nextUpgrade.id + '">' +
                (disabled ? '已达极限' : (moduleState.canAfford ? '升级 · ' + nextUpgrade.cost.toLocaleString() : '积分不足 · ' + nextUpgrade.cost.toLocaleString())) +
                '</button>';
        html += '</div>';
      } else {
        html += '<div class="mod-modal-structure-next mod-modal-structure-next--done">当前模块已升到上限</div>';
      }
      html += '</article>';
    });
    html += '</div>';

    html += '<h4 class="mod-modal-section-title">功能组件</h4>';
    html += '<div class="mod-modal-module-grid">';
    componentGroups.forEach(function (group) {
      html += '<section class="mod-modal-module-card" role="group" aria-label="' + _escapeHtml(group.name) + '">';
      html += '<div class="mod-modal-module-head">';
      html += '<div>';
      html += '<div class="mod-modal-module-name">' + group.icon + ' ' + _escapeHtml(group.name) + '</div>';
      html += '<div class="mod-modal-module-desc">' + _escapeHtml(group.desc) + '</div>';
      html += '</div>';
      html += '<span class="mod-modal-module-meta">已装 ' + group.installed.length + '</span>';
      html += '</div>';

      if (group.installed.length > 0) {
        html += '<div class="mod-modal-subtitle">已装配</div>';
        html += '<div class="mod-modal-list" role="list">';
        group.installed.forEach(function (mod) {
          var installedFocused = !!(focusModId && mod.id === focusModId);
          html += '<article class="mod-modal-item mod-modal-installed-item' + (installedFocused ? ' mod-modal-item--focus' : '') + '"' +
                  ' role="listitem" aria-label="' + _escapeHtml('已装配 ' + mod.name) + '"' +
                  ' data-mod-id="' + _escapeHtml(mod.id) + '"' +
                  (installedFocused ? ' data-focus-mod="item"' : '') + '>';
          html += '<div class="mod-modal-item-info">';
          html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</div>';
          html += '<div class="mod-modal-item-desc">' + _escapeHtml(mod.desc) + '</div>';
          html += '</div>';
          html += '<button class="mod-modal-uninstall-btn" type="button" data-mod="' + _escapeHtml(mod.id) + '">🗑️ 拆卸</button>';
          html += '</article>';
        });
        html += '</div>';
      }

      if (group.readyMods.length > 0) {
        html += '<div class="mod-modal-subtitle">可安装' + (group.slotsLeft <= 0 ? '（槽位已满）' : '') + '</div>';
        html += '<div class="mod-modal-list" role="list">';
        group.readyMods.forEach(function (mod) {
          var canAfford = group.credits >= mod.cost;
          var disabled = group.slotsLeft <= 0 || !canAfford;
          var cls = 'mod-modal-item';
          var itemFocused = !!(focusModId && mod.id === focusModId);
          if (group.slotsLeft <= 0) cls += ' mod-modal-full';
          else if (!canAfford) cls += ' mod-modal-poor';
          if (itemFocused) cls += ' mod-modal-item--focus';

          html += '<article class="' + cls + '" role="listitem" aria-label="' + _escapeHtml('可安装 ' + mod.name) + '" data-mod-id="' + _escapeHtml(mod.id) + '"' +
                  (itemFocused ? ' data-focus-mod="item"' : '') + '>';
          html += '<div class="mod-modal-item-info">';
          html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</div>';
          html += '<div class="mod-modal-item-desc">' + _escapeHtml(mod.desc) + '</div>';
          html += '</div>';
          html += '<button class="mod-modal-buy-btn' + (canAfford ? '' : ' mod-modal-no-afford') + '" type="button"' +
                  (disabled ? ' disabled' : '') +
                  ' data-mod="' + _escapeHtml(mod.id) + '">' +
                  (group.slotsLeft <= 0 ? '槽位已满' : (canAfford ? '安装 · ' + mod.cost.toLocaleString() : '积分不足')) +
                  '</button>';
          html += '</article>';
        });
        html += '</div>';
      } else if (group.installed.length === 0) {
        html += '<div class="mod-modal-module-empty">当前没有可立即安装的组件。</div>';
      }

      if (group.lockedCount > 0) {
        html += '<div class="mod-modal-module-note">后续解锁 ' + group.lockedCount + ' 项，满足前置后再显示详细内容。</div>';
      }
      html += '</section>';
    });
    html += '</div>';

    html += '<h4 class="mod-modal-section-title">港口保养</h4>';
    html += '<div class="ship-repair-card">';
    html += '<div class="ship-repair-card-head">';
    html += '<div>';
    html += '<div class="ship-repair-card-title">🔧 即时保养</div>';
    html += '<div class="ship-repair-card-desc">' + _escapeHtml(repairQuote ? repairQuote.desc : '当前无法生成保养报价。') + '</div>';
    html += '</div>';
    html += '<span class="ship-repair-card-badge">' + _escapeHtml(repairQuote ? (repairQuote.cost.toLocaleString() + ' 积分') : '') + '</span>';
    html += '</div>';

    if (repairJob) {
      var repairProgress = repairJob.totalDays > 0
        ? Math.max(0, Math.min(100, Math.round(((repairJob.totalDays - repairJob.remainingDays) / repairJob.totalDays) * 100)))
        : 0;
      html += '<div class="ship-repair-progress" role="progressbar" aria-label="维修进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + repairProgress + '"><div class="ship-repair-progress-fill" style="width:' + repairProgress + '%"></div></div>';
      html += '<div class="ship-repair-meta">';
      html += '<span>总耗时 ' + repairJob.totalDays + ' 天</span>';
      html += '<span>已支付 ' + repairJob.cost.toLocaleString() + '</span>';
      html += '<span>船体缺口 ' + hullMissing + '</span>';
      html += '<span>故障 ' + faults.length + '</span>';
      html += '</div>';
      html += '<div class="ship-repair-note">维修完成前该船无法自动跑商，当前操控船也无法出航。</div>';
    } else if (repairQuote) {
      html += '<div class="ship-repair-meta">';
      html += '<span>耗时 即时</span>';
      html += '<span>船体缺口 ' + hullMissing + '</span>';
      html += '<span>日常养护 ' + maintenance.upkeepCost + '/天</span>';
      html += '</div>';
      html += '<div class="ship-repair-effect">' + _escapeHtml(repairQuote.effectSummary) + '</div>';
      if (repairQuote.disabledReason) {
        html += '<div class="ship-repair-note ship-repair-note--warning">' + _escapeHtml(repairQuote.disabledReason) + '</div>';
      }
      html += '<button class="btn-primary ship-repair-start-btn" type="button"' + (repairQuote.disabledReason ? ' disabled' : '') + '>立即保养</button>';
    }

    if (faults.length > 0) {
      html += '<div class="ship-repair-faults">';
      faults.forEach(function (fault) {
        html += '<span class="fleet-fault-chip" title="' + _escapeHtml(fault.desc) + '">' + fault.icon + ' ' + _escapeHtml(fault.label) + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';

    if (sellQuote.maxPrice > 0) {
      html += '<h4 class="mod-modal-section-title">资产处置</h4>';
      html += '<div class="mod-modal-disposal' + (sellDisabledReason ? ' mod-modal-disposal--disabled' : '') + '">';
      html += '<div class="mod-modal-item-info">';
      html += '<div class="mod-modal-item-name">💸 回收卖出</div>';
      html += '<div class="mod-modal-item-desc">预计回收价 ' + sellQuote.minPrice.toLocaleString() + ' ~ ' + sellQuote.maxPrice.toLocaleString() + ' 积分，货舱中的货物会一并清空。</div>';
      if (sellDisabledReason) {
        html += '<div class="mod-modal-item-prereq">⚠️ ' + _escapeHtml(sellDisabledReason) + '</div>';
      }
      html += '</div>';
      html += '<button class="fleet-sell-btn mod-modal-sell-btn" type="button"' + (sellDisabledReason ? ' disabled' : '') + '>卖出飞船</button>';
      html += '</div>';
    }

    body.innerHTML = html;
    if (focusService) _focusGuidedService(body);
    else _focusGuidedMod(body, focusModId);

    body.querySelectorAll('.upg-modal-buy-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onUpgradeShip) onUpgradeShip(shipIndex, btn.dataset.upgrade);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

    // 绑定安装事件
    body.querySelectorAll('.mod-modal-buy-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onInstallMod) onInstallMod(shipIndex, btn.dataset.mod);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

    // 绑定拆卸事件
    body.querySelectorAll('.mod-modal-uninstall-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onUninstallMod) onUninstallMod(shipIndex, btn.dataset.mod);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

    body.querySelectorAll('.ship-repair-start-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onServiceShip) onServiceShip(shipIndex);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

    var sellBtn = body.querySelector('.mod-modal-sell-btn:not([disabled])');
    if (sellBtn) {
      sellBtn.addEventListener('click', function () {
        var currentShip = state.fleet[shipIndex];
        if (!currentShip) return;
        ActionConfirmUI.open({
          kicker: '舰船处置',
          title: '卖出「' + currentShip.emoji + ' ' + currentShip.name + '」？',
          message: '舰船会从船队永久移除，货舱中的全部货物也会一并清空。',
          confirmLabel: '确认卖出舰船',
          details: [
            { label: '预计回收', value: sellQuote.minPrice.toLocaleString() + ' ~ ' + sellQuote.maxPrice.toLocaleString() + ' 积分', tone: 'safe' },
            { label: '舰船货舱', value: '全部清空', tone: 'danger' },
          ],
          onConfirm: function () {
            if (onSellShip) onSellShip(shipIndex);
            setTimeout(function () {
              if (state.fleet.length <= shipIndex || state.fleet[shipIndex] !== currentShip) {
                if (_currentPortalCleanup) _currentPortalCleanup();
                _renderHangarAfterInlineClose();
                return;
              }
              _renderModModal();
            }, 50);
          },
        });
      });
    }
  }

  _renderModModal();

  // 关闭
  document.getElementById('mod-modal-close').onclick = function () {
    if (_currentPortalCleanup) _currentPortalCleanup();
    else hideBlockingSurface('mod-modal');
    _renderHangarAfterInlineClose();
  };
}

// ---------------------------------------------------------------------------
// 派遣配置弹窗
// ---------------------------------------------------------------------------

function _openDispatchModal(state, shipIndex, onAssignRoute, onCancelRoute, preset) {
  _inspectedHangarShipIndex = shipIndex;
  const modal = document.getElementById('dispatch-modal');
  if (!modal) return;

  var portalOpened = _openInlinePortal('dispatch-modal', function() {
    hideBlockingSurface('dispatch-modal');
  }, {
    labelledBy: 'dispatch-title',
    describedBy: 'dispatch-modal-desc dispatch-route-summary dispatch-primary-hint dispatch-policy-status',
    returnFocusSelector: '.fleet-dispatch-btn[data-index="' + shipIndex + '"]',
  });
  if (!portalOpened) showBlockingSurface('dispatch-modal', { focusSelector: '#dispatch-buy-system' });

  const ship = state.fleet[shipIndex];
  const effectiveShipStats = Fleet.getEffectiveShipStats(state, ship);
  const dispatchPreset = preset || null;
  const presetRecommendation = dispatchPreset && dispatchPreset.recommendation ? dispatchPreset.recommendation : null;
  _activeDispatchModalContext = {
    shipIndex: shipIndex,
    buySystemId: (presetRecommendation && presetRecommendation.buySystemId) || (dispatchPreset && dispatchPreset.buySystemId) || '',
    sellSystemId: (presetRecommendation && presetRecommendation.sellSystemId) || (dispatchPreset && dispatchPreset.sellSystemId) || '',
    goodId: (presetRecommendation && presetRecommendation.goodId) || (dispatchPreset && dispatchPreset.goodId) || '',
  };
  const isActive = shipIndex === (state.activeShipIndex || 0);
  const routeLevel = Fleet.getDispatchRouteLevel(state);
  const shipLocationSystem = SYSTEMS.find(function (sys) { return sys.id === ship.location; });
  const currentLocationSystemId = isActive ? state.currentSystem : (ship.location || state.currentSystem);
  const dispatchGalaxyId = isActive
    ? (state.currentGalaxy || 'milky_way')
    : ((shipLocationSystem && shipLocationSystem.galaxyId) || state.currentGalaxy || 'milky_way');

  document.getElementById('dispatch-title').textContent =
    (isActive ? '自动跑商' : '设置跑商') + '「' + ship.emoji + ' ' + ship.name + '」';

  // 填充星系选择
  const buySelect  = document.getElementById('dispatch-buy-system');
  const sellSelect = document.getElementById('dispatch-sell-system');
  const goodSelect = document.getElementById('dispatch-good');
  const maxBuyInput = document.getElementById('dispatch-max-buy-price');
  const minSellInput = document.getElementById('dispatch-min-sell-price');
  const minProfitInput = document.getElementById('dispatch-min-profit-rate');
  const riskModeSelect = document.getElementById('dispatch-risk-mode');
  const marketModeSelect = document.getElementById('dispatch-market-mode');
  const estimateEl = document.getElementById('dispatch-estimate');
  const confirmBtn = document.getElementById('dispatch-confirm');
  const cancelBtn = document.getElementById('dispatch-cancel');
  const primaryHintEl = document.getElementById('dispatch-primary-hint');
  const policyStatusEl = document.getElementById('dispatch-policy-status');
  const advancedPanel = document.getElementById('dispatch-advanced-panel');
  const routeSummaryEl = document.getElementById('dispatch-route-summary');
  const summaryBuyEl = document.getElementById('dispatch-summary-buy');
  const summarySellEl = document.getElementById('dispatch-summary-sell');
  const summaryGoodEl = document.getElementById('dispatch-summary-good');
  const summaryPolicyEl = document.getElementById('dispatch-summary-policy');
  var existingPolicy = dispatchPreset && dispatchPreset.tradePolicy
    ? dispatchPreset.tradePolicy
    : (presetRecommendation && presetRecommendation.recommendedTradePolicy
        ? presetRecommendation.recommendedTradePolicy
        : (ship.route && ship.route.tradePolicy ? ship.route.tradePolicy : {}));
  var galaxyNames = Object.create(null);
  GALAXIES.forEach(function (galaxy) {
    galaxyNames[galaxy.id] = galaxy.name;
  });

  function _getGalaxyName(galaxyId) {
    return galaxyNames[galaxyId] || galaxyId;
  }

  function _hasCustomTradePolicy(policy) {
    if (!policy || typeof policy !== 'object') return false;
    return Number.isFinite(policy.maxBuyPrice)
      || Number.isFinite(policy.minSellPrice)
      || Number.isFinite(policy.minProfitRate)
      || (policy.riskMode && policy.riskMode !== 'balanced')
      || (policy.marketMode && policy.marketMode !== 'open');
  }

  function _formatRiskModeLabel(riskMode) {
    if (riskMode === 'safe') return '保守';
    if (riskMode === 'aggressive') return '激进';
    return '平衡';
  }

  function _formatMarketModeLabel(marketMode) {
    return marketMode === 'black' ? '黑市' : '公开市场';
  }

  function _formatRouteRiskLabel(level) {
    if (level === 'high') return '高';
    if (level === 'medium') return '中';
    return '低';
  }

  function _formatSystemSummaryLabel(systemId) {
    var system = SYSTEMS.find(function (entry) { return entry.id === systemId; });
    return system ? system.name : (systemId || '待选择');
  }

  function _formatGoodSummaryLabel(goodId) {
    var good = GOODS.find(function (entry) { return entry.id === goodId; });
    return good ? (good.emoji + ' ' + good.name) : (goodId || '待选择');
  }

  function _syncActiveDispatchContext() {
    if (!_activeDispatchModalContext) return;
    _activeDispatchModalContext.buySystemId = buySelect.value || '';
    _activeDispatchModalContext.sellSystemId = sellSelect.value || '';
    _activeDispatchModalContext.goodId = goodSelect.value || '';
    _activeDispatchModalContext.tradePolicy = _readTradePolicy();
  }

  function _updateRouteSummary(estimate, warnings, readiness) {
    var tradePolicy = estimate && estimate.tradePolicy ? estimate.tradePolicy : _readTradePolicy();
    var hasWarnings = Array.isArray(warnings) && warnings.length > 0;
    var isBlocked = !!(readiness && !readiness.ok);

    if (summaryBuyEl) summaryBuyEl.textContent = _formatSystemSummaryLabel(buySelect.value);
    if (summarySellEl) summarySellEl.textContent = _formatSystemSummaryLabel(sellSelect.value);
    if (summaryGoodEl) summaryGoodEl.textContent = _formatGoodSummaryLabel(goodSelect.value);
    if (summaryPolicyEl) {
      summaryPolicyEl.textContent =
        _formatMarketModeLabel(tradePolicy.marketMode) + ' · ' +
        _formatRiskModeLabel(tradePolicy.riskMode) +
        (isBlocked ? ' · 暂不可启动' : (hasWarnings ? ' · 等待设置调整' : ''));
    }
    if (routeSummaryEl) {
      routeSummaryEl.dataset.routeState = estimate
        ? (isBlocked ? 'blocked' : (hasWarnings ? 'waiting' : 'ready'))
        : 'blocked';
    }
    _syncActiveDispatchContext();
  }

  function _getCurrentShip() {
    return state.fleet[shipIndex] || ship;
  }

  function _isRecommendationSelected(recommendation) {
    return !!recommendation
      && buySelect.value === recommendation.buySystemId
      && sellSelect.value === recommendation.sellSystemId
      && goodSelect.value === recommendation.goodId;
  }

  function _updatePrimaryHint(estimate, recommendation, policyValidation, readiness) {
    var matchesRecommendation = estimate && _isRecommendationSelected(recommendation);
    var hasCustomPolicy = _hasCustomTradePolicy(_readTradePolicy());
    var currentShip = _getCurrentShip();
    var hasExistingRoute = !!(currentShip && currentShip.route);
    var policyValid = !policyValidation || policyValidation.valid;

    if (!confirmBtn || !primaryHintEl) return;

    confirmBtn.textContent = readiness && !readiness.ok ? readiness.buttonLabel : '开始跑商';
    confirmBtn.disabled = !estimate || !policyValid || !!(readiness && !readiness.ok);
    confirmBtn.setAttribute('aria-disabled', confirmBtn.disabled ? 'true' : 'false');

    if (!policyValid) {
      modal.dataset.dispatchState = 'invalid';
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--danger';
      primaryHintEl.textContent = '可选设置里有无效数字，修正后才能开始。';
      return;
    }

    if (!estimate) {
      modal.dataset.dispatchState = 'blocked';
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--warning';
      primaryHintEl.textContent = recommendation
        ? '当前推荐路线暂不可用，可展开可选设置调整后再试。'
        : (hasExistingRoute
            ? '当前路线缺少可用估算；可关闭窗口，或调整设置后重新计算。'
            : '当前没有可直接使用的推荐路线，可展开可选设置调整后再试。');
      return;
    }

    if (readiness && !readiness.ok) {
      modal.dataset.dispatchState = 'blocked';
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--danger';
      primaryHintEl.textContent = readiness.reason;
      return;
    }

    if (matchesRecommendation) {
      modal.dataset.dispatchState = 'ready';
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--ready';
      primaryHintEl.textContent = hasExistingRoute
        ? '已载入当前最优路线，点击“开始跑商”可直接改派。'
        : '已载入当前最优路线，点击“开始跑商”即可启动。';
      return;
    }

    modal.dataset.dispatchState = hasCustomPolicy ? 'custom' : 'manual';
    primaryHintEl.className = 'dispatch-primary-hint';
    primaryHintEl.textContent = hasCustomPolicy
      ? '当前使用手动设置，点击“开始跑商”将按这些设置执行。'
      : (hasExistingRoute
          ? '当前显示正在使用的路线；修改后点击“开始跑商”即可改派。'
          : '当前显示手动路线；点击“开始跑商”即可执行。');
  }

  function _formatSystemOptionLabel(system) {
    return system.name + ' [' + system.typeLabel + ']';
  }

  function _buildGroupedSystemOptions(systems) {
    var groupedSystems = Object.create(null);
    var galaxyOrder = [];

    systems.forEach(function (system) {
      var galaxyId = system.galaxyId || 'unknown';
      if (!groupedSystems[galaxyId]) {
        groupedSystems[galaxyId] = [];
        galaxyOrder.push(galaxyId);
      }
      groupedSystems[galaxyId].push(system);
    });

    return galaxyOrder.map(function (galaxyId) {
      var groupLabel = _getGalaxyName(galaxyId);
      if (galaxyId === dispatchGalaxyId) groupLabel += ' · 当前星系';
      return '<optgroup label="' + _escapeHtml(groupLabel) + '">' + groupedSystems[galaxyId].map(function (system) {
        return '<option value="' + system.id + '">' + _escapeHtml(_formatSystemOptionLabel(system)) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  var playerLevel = state.playerLevel || 1;
  var dispatchAccessLevel = isActive ? playerLevel : routeLevel;
  var recommendationPlanets = [];
  var recommendationPlanetLookup = Object.create(null);
  getAccessibleGalaxies(playerLevel, state.researchedTechs || []).forEach(function (galaxy) {
    getSystemsByGalaxy(galaxy.id).forEach(function (sys) {
      var minLvl = sys.minLevel || 1;
      if (dispatchAccessLevel < minLvl || recommendationPlanetLookup[sys.id]) return;
      recommendationPlanets.push(sys);
      recommendationPlanetLookup[sys.id] = true;
    });
  });

  // 默认仍展示当前星系航线，打开弹窗时会主动搜索全部已开放星系的最优路线
  var allGalaxyPlanets = getSystemsByGalaxy(dispatchGalaxyId).filter(function (sys) {
    var minLvl = sys.minLevel || 1;
    return dispatchAccessLevel >= minLvl;
  });
  var planetLookup = Object.create(null);
  allGalaxyPlanets.forEach(function (system) {
    planetLookup[system.id] = true;
  });

  function _appendPresetSystem(systemId) {
    var system = SYSTEMS.find(function (entry) { return entry.id === systemId; });
    if (!system || planetLookup[system.id]) return;
    allGalaxyPlanets.push(system);
    planetLookup[system.id] = true;
  }

  if (dispatchPreset) {
    _appendPresetSystem(dispatchPreset.buySystemId);
    _appendPresetSystem(dispatchPreset.sellSystemId);
  }
  if (presetRecommendation) {
    _appendPresetSystem(presetRecommendation.buySystemId);
    _appendPresetSystem(presetRecommendation.sellSystemId);
  }

  maxBuyInput.value = Number.isFinite(existingPolicy.maxBuyPrice) ? existingPolicy.maxBuyPrice : '';
  minSellInput.value = Number.isFinite(existingPolicy.minSellPrice) ? existingPolicy.minSellPrice : '';
  minProfitInput.value = Number.isFinite(existingPolicy.minProfitRate) ? Math.round(existingPolicy.minProfitRate * 100) : '';
  riskModeSelect.value = existingPolicy.riskMode || 'balanced';
  marketModeSelect.value = existingPolicy.marketMode || 'open';

  function _buildMarketOptions() {
    var marketMode = marketModeSelect.value || 'open';
    var buyPlanets = marketMode === 'black'
      ? allGalaxyPlanets.filter(function (sys) { return AutoTrade.canUseMarket(state, sys.id, 'black'); })
      : allGalaxyPlanets.slice();
    var sellPlanets = allGalaxyPlanets.slice();
    var previousBuy = buySelect.value;
    var previousSell = sellSelect.value;
    var previousGood = goodSelect.value;

    buySelect.innerHTML = '';
    sellSelect.innerHTML = '';
    goodSelect.innerHTML = '';

    if (buyPlanets.length === 0 || sellPlanets.length < 2) {
      var emptyText = marketMode === 'black' ? '当前候选中无可用黑市路线' : '需要更多航线（购买席位解锁）';
      buySelect.innerHTML = '<option value="">' + emptyText + '</option>';
      sellSelect.innerHTML = '<option value="">' + emptyText + '</option>';
    } else {
      buySelect.innerHTML = _buildGroupedSystemOptions(buyPlanets);
      sellSelect.innerHTML = _buildGroupedSystemOptions(sellPlanets);
    }

    GOODS.forEach(function (g) {
      if (g.id === 'fuel' || !AutoTrade.isGoodAllowedInMarket(g, marketMode)) return;
      goodSelect.innerHTML += '<option value="' + g.id + '">' + g.emoji + ' ' + g.name + '</option>';
    });

    if (ship.route) {
      if (buySelect.querySelector('option[value="' + ship.route.buySystemId + '"]')) buySelect.value = ship.route.buySystemId;
      if (sellSelect.querySelector('option[value="' + ship.route.sellSystemId + '"]')) sellSelect.value = ship.route.sellSystemId;
      if (goodSelect.querySelector('option[value="' + ship.route.goodId + '"]')) goodSelect.value = ship.route.goodId;
    }

    if (!buySelect.value && previousBuy && buySelect.querySelector('option[value="' + previousBuy + '"]')) buySelect.value = previousBuy;
    if (!sellSelect.value && previousSell && sellSelect.querySelector('option[value="' + previousSell + '"]')) sellSelect.value = previousSell;
    if (!goodSelect.value && previousGood && goodSelect.querySelector('option[value="' + previousGood + '"]')) goodSelect.value = previousGood;

    if (!buySelect.value && buySelect.querySelector('option[value="' + currentLocationSystemId + '"]')) {
      buySelect.value = currentLocationSystemId;
    }
    if ((!sellSelect.value || sellSelect.value === buySelect.value) && sellSelect.options.length > 1) {
      sellSelect.selectedIndex = sellSelect.options[0].value === buySelect.value ? 1 : 0;
    }

    if (dispatchPreset) {
      if (dispatchPreset.buySystemId && buySelect.querySelector('option[value="' + dispatchPreset.buySystemId + '"]')) buySelect.value = dispatchPreset.buySystemId;
      if (dispatchPreset.sellSystemId && sellSelect.querySelector('option[value="' + dispatchPreset.sellSystemId + '"]')) sellSelect.value = dispatchPreset.sellSystemId;
      if (dispatchPreset.goodId && goodSelect.querySelector('option[value="' + dispatchPreset.goodId + '"]')) goodSelect.value = dispatchPreset.goodId;
    }
  }

  function _readTradePolicy() {
    var maxBuyPrice = parseFloat(maxBuyInput.value);
    var minSellPrice = parseFloat(minSellInput.value);
    var minProfitRatePercent = parseFloat(minProfitInput.value);
    return {
      maxBuyPrice: Number.isFinite(maxBuyPrice) ? maxBuyPrice : null,
      minSellPrice: Number.isFinite(minSellPrice) ? minSellPrice : null,
      minProfitRate: Number.isFinite(minProfitRatePercent) ? minProfitRatePercent / 100 : null,
      riskMode: riskModeSelect.value || 'balanced',
      marketMode: marketModeSelect.value || 'open',
    };
  }

  function _validateTradePolicyInputs() {
    var fields = [
      { element: maxBuyInput, label: '最高买入价' },
      { element: minSellInput, label: '最低卖出价' },
      { element: minProfitInput, label: '最低利润率' },
    ];
    var errors = [];
    var thresholdCount = 0;

    fields.forEach(function (field) {
      var rawValue = String(field.element.value == null ? '' : field.element.value).trim();
      var numericValue = rawValue === '' ? null : Number(rawValue);
      var valid = rawValue === '' || (Number.isFinite(numericValue) && numericValue >= 0);

      if (rawValue !== '') thresholdCount += 1;
      if (valid) field.element.removeAttribute('aria-invalid');
      else {
        field.element.setAttribute('aria-invalid', 'true');
        errors.push(field.label + '需填写 0 或更大的数字');
      }
    });

    var validation = {
      valid: errors.length === 0,
      errors: errors,
      thresholdCount: thresholdCount,
    };

    modal.dataset.dispatchPolicyState = validation.valid
      ? (thresholdCount > 0 ? 'active' : 'neutral')
      : 'invalid';
    if (policyStatusEl) {
      policyStatusEl.className = 'dispatch-policy-status' +
        (validation.valid
          ? (thresholdCount > 0 ? ' dispatch-policy-status--active' : '')
          : ' dispatch-policy-status--error');
      policyStatusEl.textContent = validation.valid
        ? (thresholdCount > 0
            ? ('已启用 ' + thresholdCount + ' 项价格限制；留空字段不限制。')
            : '价格与利润均未设置额外限制。')
        : errors.join('；') + '。';
    }

    return validation;
  }

  function _getEstimateData() {
    var buyId = buySelect.value;
    var sellId = sellSelect.value;
    var gId = goodSelect.value;
    if (!buyId || !sellId || !gId) return null;

    var tradePolicy = _readTradePolicy();
    var isBlack = tradePolicy.marketMode === 'black';
    var bp = isBlack ? Economy.getBlackMarketBuyPrice(buyId, gId, state) : Economy.getBuyPrice(buyId, gId, state);
    var sp = isBlack && Faction.canAccessBlackMarket(state, sellId) && AutoTrade.isGoodAllowedInMarket(GOODS.find(function (g) { return g.id === gId; }), 'black')
      ? Economy.getBlackMarketSellPrice(sellId, gId, state)
      : Economy.getSellPrice(sellId, gId, state);
    var cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);
    var space = effectiveShipStats.maxCargo - cargoUsed;
    var maxQty = Math.min(space, Math.floor(state.credits / bp));
    var selectedCargoQty = Number(ship.cargo && ship.cargo[gId]) || 0;
    var deliveryOnly = maxQty <= 0 && selectedCargoQty > 0;
    var travelToBuyFuel = currentLocationSystemId === buyId ? 0 : Economy.getFuelCost(currentLocationSystemId, buyId, effectiveShipStats.fuelEff, state);
    var travelToSellFuel = buyId === sellId ? 0 : Economy.getFuelCost(buyId, sellId, effectiveShipStats.fuelEff, state);
    var totalFuelCost = travelToBuyFuel + travelToSellFuel;
    var fuelUnitPrice = Economy.getBuyPrice(currentLocationSystemId, 'fuel', state);
    var profit = deliveryOnly
      ? sp * selectedCargoQty - totalFuelCost * fuelUnitPrice
      : (sp - bp) * maxQty - totalFuelCost * fuelUnitPrice;
    var profitRate = deliveryOnly ? null : (bp > 0 ? ((sp - bp) / bp) : 0);
    var good = GOODS.find(function (g) { return g.id === gId; });
    var routeRisk = AutoTrade.assessTradeRisk(good, buyId, sellId, tradePolicy.marketMode);
    var dispatchProfile = effectiveShipStats.dispatchProfile || null;
    var inspectionRisk = AutoTrade.estimateDispatchInspectionRisk(state, good, maxQty, sellId, tradePolicy.marketMode, {
      checkChanceMultiplier: dispatchProfile && dispatchProfile.inspectionRiskMultiplier,
    });

    return {
      buyId: buyId,
      sellId: sellId,
      goodId: gId,
      buyPrice: bp,
      sellPrice: sp,
      maxQty: maxQty,
      cargoSpace: space,
      selectedCargoQty: selectedCargoQty,
      deliveryOnly: deliveryOnly,
      fuelCost: totalFuelCost,
      profit: profit,
      profitRate: profitRate,
      tradePolicy: tradePolicy,
      routeRisk: routeRisk,
      inspectionRisk: inspectionRisk,
      dispatchProfile: dispatchProfile,
    };
  }

  function _getDispatchReadiness(estimate) {
    if (!estimate) {
      return { ok: false, code: 'no_route', buttonLabel: '暂不可启动', reason: '当前设置无法组成可执行路线。' };
    }

    var currentShip = _getCurrentShip();
    if (currentShip && Number(currentShip.maintenance) < 15) {
      return {
        ok: false,
        code: 'maintenance',
        buttonLabel: '需先保养',
        reason: '当前飞船维护度低于 15%，先在舰船管理中完成保养，再开始自动跑商。',
      };
    }

    if (estimate.buyId === estimate.sellId) {
      return {
        ok: false,
        code: 'same_system',
        buttonLabel: '路线无效',
        reason: '买入地和卖出地不能相同，请选择一个有明确价差的卖出地。',
      };
    }

    if (estimate.maxQty <= 0 && estimate.selectedCargoQty <= 0) {
      var selectedGood = GOODS.find(function (good) { return good.id === estimate.goodId; });
      if (estimate.cargoSpace <= 0) {
        return {
          ok: false,
          code: 'cargo_full',
          buttonLabel: '货舱已满',
          reason: '当前货舱没有可用空间，先出售或转移库存，再开始新的自动跑商路线。',
        };
      }
      return {
        ok: false,
        code: 'insufficient_credits',
        buttonLabel: '积分不足',
        reason: '启动资金不足：买入 1 单位' + (selectedGood ? ('「' + selectedGood.name + '」') : '商品') +
          '至少需要 ' + Math.ceil(estimate.buyPrice).toLocaleString() + ' 积分，当前只有 ' +
          Math.max(0, Math.floor(Number(state.credits) || 0)).toLocaleString() + '。先完成委托或出售库存筹措资金。',
      };
    }

    if (!estimate.deliveryOnly && estimate.profitRate <= 0) {
      return {
        ok: false,
        code: 'no_margin',
        buttonLabel: '路线无价差',
        reason: '当前卖价不高于买价，这条路线不会形成贸易收益。请更换买入地、卖出地或商品。',
      };
    }

    if (estimate.profit <= 0) {
      return {
        ok: false,
        code: 'no_profit',
        buttonLabel: '路线会亏损',
        reason: '扣除航程燃料后，当前路线预计单次亏损 ' +
          Math.ceil(Math.abs(estimate.profit)).toLocaleString() + ' 积分。请改用净收益为正的路线。',
      };
    }

    return { ok: true, code: 'ready', buttonLabel: '开始跑商', reason: '' };
  }

  function _formatEnforcementLabel(level) {
    if (level === 'high') return '高执法区';
    if (level === 'medium') return '中执法区';
    return '低执法区';
  }

  function _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _buildRiskSummary(estimate) {
    var routeRisk = estimate.routeRisk || { riskLevel: 'low', buyEnforcement: 'low', sellEnforcement: 'low' };
    var inspectionRisk = estimate.inspectionRisk || {
      hasContraband: false,
      protectedByBlackMarket: false,
      checkChancePercent: 0,
      contrabandGoods: [],
    };
    var highEnforcementParts = [];

    if (routeRisk.buyEnforcement === 'high') highEnforcementParts.push('买入地');
    if (routeRisk.sellEnforcement === 'high') highEnforcementParts.push('卖出地');

    return {
      highEnforcementParts: highEnforcementParts,
      buyEnforcementLabel: _formatEnforcementLabel(routeRisk.buyEnforcement),
      sellEnforcementLabel: _formatEnforcementLabel(routeRisk.sellEnforcement),
      contrabandLabel: inspectionRisk.hasContraband ? inspectionRisk.contrabandGoods.join('、') : '无',
      riskLabel: inspectionRisk.protectedByBlackMarket ? '0%（辛迪加庇护）' : inspectionRisk.checkChancePercent + '%',
      isHighEnforcement: highEnforcementParts.length > 0,
      isHighInspectionRisk: !inspectionRisk.protectedByBlackMarket && inspectionRisk.checkChancePercent >= 10,
      hasContraband: inspectionRisk.hasContraband,
    };
  }

  function _getSuggestedRecommendation() {
    return AutoTrade.findBestDispatchRoute(state, {
      currentSystem: currentLocationSystemId,
      currentGalaxy: dispatchGalaxyId,
      fuelEfficiency: effectiveShipStats.fuelEff,
      cargoFree: effectiveShipStats.maxCargo - Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0),
      credits: state.credits,
      playerLevel: playerLevel,
      systemIds: recommendationPlanets.map(function (sys) { return sys.id; }),
      allowCrossGalaxy: true,
      dispatchProfile: effectiveShipStats.dispatchProfile || null,
    }, _readTradePolicy());
  }

  function _applyRecommendationSelection(recommendation) {
    if (!recommendation) return;

    if (!planetLookup[recommendation.buySystemId] || !planetLookup[recommendation.sellSystemId]) {
      _appendPresetSystem(recommendation.buySystemId);
      _appendPresetSystem(recommendation.sellSystemId);
      _buildMarketOptions();
    }

    buySelect.value = recommendation.buySystemId;
    sellSelect.value = recommendation.sellSystemId;
    goodSelect.value = recommendation.goodId;
  }

  function _renderEstimate(estimate, recommendation, warnings, readiness) {
    var riskAssessment = estimate.routeRisk;
    var riskSummary = _buildRiskSummary(estimate);
    var dispatchProfile = estimate.dispatchProfile || (recommendation && recommendation.dispatchProfile) || effectiveShipStats.dispatchProfile || {};
    var marketLabel = estimate.tradePolicy.marketMode === 'black' ? '黑市' : '公开';
    var riskModeLabel = _formatRiskModeLabel(estimate.tradePolicy.riskMode);
    var loadingPlanLabel = estimate.deliveryOnly
      ? ('运送现有 ' + estimate.selectedCargoQty + ' 单位')
      : (marketLabel + '买 ' + estimate.maxQty + ' 单位');
    var profitRateLabel = estimate.deliveryOnly
      ? '库存变现'
      : (Math.round(estimate.profitRate * 100) + '%');
    var valueLabel = estimate.deliveryOnly ? '预计回款' : '单次利润';
    var invalidRoute = readiness && !readiness.ok && (readiness.code === 'same_system' || readiness.code === 'no_route');
    var warningHtml = warnings.length > 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">当前设置会等待：' + _escapeHtml(warnings.join('、')) + '</div>'
      : '';
    var lossHtml = !invalidRoute && estimate.profit <= 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--danger">亏损路线</div>'
      : '';
    var blockedHtml = readiness && !readiness.ok
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--danger">无法启动：' + _escapeHtml(readiness.reason) + '</div>'
      : '';
    var recommendationHtml = recommendation
      ? '<div class="dispatch-estimate-head">推荐：' + _escapeHtml(recommendation.buySystemName) + ' → ' + _escapeHtml(recommendation.sellSystemName) + '（' + _escapeHtml(recommendation.goodName) + '）</div>'
      : '';
    var strategyHtml = dispatchProfile.strategyLabel
      ? '<div class="dispatch-estimate-note">' + _escapeHtml((dispatchProfile.roleLabel || '默认跑商') + ' · ' + dispatchProfile.strategyLabel + '：' + (recommendation && recommendation.strategySummary ? recommendation.strategySummary.replace(/^.*：/, '') : (dispatchProfile.strategyNote || '按当前利润与避险程度筛选路线。'))) + '</div>'
      : '';
    var surveyIntelHtml = recommendation && recommendation.surveyIntelSummary
      ? '<div class="dispatch-estimate-note">' + _escapeHtml(recommendation.surveyIntelSummary) + '</div>'
      : '';
    var pressureHtml = dispatchProfile.faultPressure > 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">船况压力 ' + _escapeHtml(String(dispatchProfile.faultPressure)) + '，系统会下调高风险与高执法路线优先级。</div>'
      : '';
    var estimateDetailsHtml = invalidRoute
      ? ''
      : '<div class="dispatch-estimate-main" role="list" aria-label="自动跑商估算">' +
          '<span class="dispatch-estimate-metric dispatch-estimate-highlight" role="listitem"><em>装载计划</em><strong>' + loadingPlanLabel + '</strong></span>' +
          '<span class="dispatch-estimate-metric" role="listitem"><em>' + valueLabel + '</em><strong>≈ ' + Math.floor(estimate.profit) + '</strong><small>积分</small></span>' +
          '<span class="dispatch-estimate-metric" role="listitem"><em>收益判断</em><strong>' + profitRateLabel + '</strong></span>' +
          '<span class="dispatch-estimate-metric" role="listitem"><em>航程燃料</em><strong>' + estimate.fuelCost + '</strong><small>单位</small></span>' +
          '<span class="dispatch-estimate-metric" role="listitem"><em>路线风险</em><strong>' + _escapeHtml(_formatRouteRiskLabel(riskAssessment.riskLevel)) + '</strong></span>' +
          '<span class="dispatch-estimate-metric" role="listitem"><em>避险程度</em><strong>' + riskModeLabel + '</strong></span>' +
        '</div>' +
        '<div class="dispatch-risk-grid" role="list" aria-label="路线风险明细">' +
          '<div class="dispatch-risk-item ' + (riskSummary.isHighEnforcement ? 'dispatch-risk-item--danger' : '') + '" role="listitem">' +
            '<span class="dispatch-risk-label">高执法区</span>' +
            '<span class="dispatch-risk-value">' + _escapeHtml(riskSummary.highEnforcementParts.length > 0 ? riskSummary.highEnforcementParts.join('、') : '无') + '</span>' +
          '</div>' +
          '<div class="dispatch-risk-item" role="listitem">' +
            '<span class="dispatch-risk-label">执法分布</span>' +
            '<span class="dispatch-risk-value">买入 ' + _escapeHtml(riskSummary.buyEnforcementLabel) + ' / 卖出 ' + _escapeHtml(riskSummary.sellEnforcementLabel) + '</span>' +
          '</div>' +
          '<div class="dispatch-risk-item ' + (riskSummary.hasContraband ? 'dispatch-risk-item--warning' : '') + '" role="listitem">' +
            '<span class="dispatch-risk-label">违禁品</span>' +
            '<span class="dispatch-risk-value">' + _escapeHtml(riskSummary.contrabandLabel) + '</span>' +
          '</div>' +
          '<div class="dispatch-risk-item ' + (riskSummary.isHighInspectionRisk ? 'dispatch-risk-item--danger' : '') + '" role="listitem">' +
            '<span class="dispatch-risk-label">预计查获风险</span>' +
            '<span class="dispatch-risk-value">' + _escapeHtml(riskSummary.riskLabel) + '</span>' +
          '</div>' +
        '</div>';

    estimateEl.innerHTML =
      recommendationHtml +
      strategyHtml +
      surveyIntelHtml +
      estimateDetailsHtml +
      lossHtml +
      blockedHtml +
        pressureHtml +
      warningHtml;
  }

  function _applySuggestedRoute() {
    var recommendation = _getSuggestedRecommendation();

    if (!recommendation) {
      estimateEl.textContent = '没有找到符合当前设置的跑商路线。可展开可选设置调整后再试。';
      _updateRouteSummary(null, []);
      _updatePrimaryHint(null, null);
      return null;
    }

    _applyRecommendationSelection(recommendation);
    _updateEstimate(recommendation);
    return recommendation;
  }

  // 预估利润
  function _updateEstimate(recommendation) {
    var policyValidation = _validateTradePolicyInputs();
    if (!policyValidation.valid) {
      estimateEl.textContent = '请先修正可选设置中的无效数字，再查看路线估算。';
      _updateRouteSummary(null, []);
      if (summaryPolicyEl) {
        summaryPolicyEl.textContent =
          _formatMarketModeLabel(marketModeSelect.value) + ' · ' +
          _formatRiskModeLabel(riskModeSelect.value) + ' · 输入有误';
      }
      _updatePrimaryHint(null, null, policyValidation);
      return;
    }
    var estimate = _getEstimateData();
    var suggestedRecommendation = recommendation || null;
    if (!estimate) {
      estimateEl.textContent = recommendation
        ? '当前推荐路线暂不能开始，可调整设置后再试。'
        : '当前设置无法组成可执行的自动跑商路线。';
      _updateRouteSummary(null, []);
      _updatePrimaryHint(null, suggestedRecommendation, policyValidation);
      return;
    }
    var warnings = [];
    var riskAssessment = estimate.routeRisk;
    var readiness = _getDispatchReadiness(estimate);

    if (Number.isFinite(estimate.tradePolicy.maxBuyPrice) && estimate.buyPrice > estimate.tradePolicy.maxBuyPrice) warnings.push('买入价高于上限');
    if (Number.isFinite(estimate.tradePolicy.minSellPrice) && estimate.sellPrice < estimate.tradePolicy.minSellPrice) warnings.push('卖出价低于下限');
    if (!estimate.deliveryOnly && Number.isFinite(estimate.tradePolicy.minProfitRate) && estimate.profitRate < estimate.tradePolicy.minProfitRate) warnings.push('利润率低于要求');
    if (estimate.tradePolicy.riskMode === 'safe' && riskAssessment.riskLevel !== 'low') warnings.push('谨慎模式会避开这条路线');
    if (estimate.tradePolicy.marketMode === 'black' && !Faction.canAccessBlackMarket(state, estimate.buyId)) warnings.push('黑市买入权限不足');

    _updateRouteSummary(estimate, warnings, readiness);
    _renderEstimate(estimate, recommendation, warnings, readiness);
    _updatePrimaryHint(estimate, suggestedRecommendation, policyValidation, readiness);
  }

  _buildMarketOptions();
  if (advancedPanel) advancedPanel.open = _hasCustomTradePolicy(existingPolicy);
  buySelect.onchange  = function () { _updateEstimate(); };
  sellSelect.onchange = function () { _updateEstimate(); };
  goodSelect.onchange = function () { _updateEstimate(); };
  maxBuyInput.oninput = function () { _updateEstimate(); };
  minSellInput.oninput = function () { _updateEstimate(); };
  minProfitInput.oninput = function () { _updateEstimate(); };
  riskModeSelect.onchange = function () { _updateEstimate(); };
  marketModeSelect.onchange = function () {
    _buildMarketOptions();
    _updateEstimate();
  };

  var hasPresetRoute = !!(dispatchPreset && dispatchPreset.buySystemId && dispatchPreset.sellSystemId && dispatchPreset.goodId);
  var hasExistingRoute = !!ship.route;
  var initialRecommendation = presetRecommendation || null;

  if (hasPresetRoute && !initialRecommendation) {
    initialRecommendation = {
      buySystemId: dispatchPreset.buySystemId,
      sellSystemId: dispatchPreset.sellSystemId,
      goodId: dispatchPreset.goodId,
      buySystemName: (SYSTEMS.find(function (sys) { return sys.id === dispatchPreset.buySystemId; }) || {}).name || dispatchPreset.buySystemId,
      sellSystemName: (SYSTEMS.find(function (sys) { return sys.id === dispatchPreset.sellSystemId; }) || {}).name || dispatchPreset.sellSystemId,
      goodName: (GOODS.find(function (good) { return good.id === dispatchPreset.goodId; }) || {}).name || dispatchPreset.goodId,
      recommendedTradePolicy: dispatchPreset.tradePolicy || _readTradePolicy(),
    };
  }
  if (!initialRecommendation && !hasExistingRoute) {
    initialRecommendation = _applySuggestedRoute();
  }

  if (initialRecommendation) {
    _applyRecommendationSelection(initialRecommendation);
    _updateEstimate(initialRecommendation);
  } else {
    _updateEstimate(presetRecommendation);
  }

  // 确认
  confirmBtn.onclick = function () {
    var policyValidation = _validateTradePolicyInputs();
    var estimate = _getEstimateData();
    var readiness = _getDispatchReadiness(estimate);
    if (!policyValidation.valid || confirmBtn.disabled) {
      _updatePrimaryHint(estimate, initialRecommendation, policyValidation, readiness);
      return;
    }
    var result = onAssignRoute(shipIndex, buySelect.value, sellSelect.value, goodSelect.value, _readTradePolicy());
    if (result && result.ok === false) {
      var firstMessage = result.msgs && result.msgs[0] ? result.msgs[0].text : '路线启动失败，请检查飞船状态后重试。';
      modal.dataset.dispatchState = 'blocked';
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--danger';
      primaryHintEl.textContent = firstMessage;
      return;
    }
    if (_currentPortalCleanup) _currentPortalCleanup();
    else hideBlockingSurface('dispatch-modal');
    _renderHangarAfterInlineClose();
  };

  cancelBtn.onclick = function () {
    if (_currentPortalCleanup) _currentPortalCleanup();
    else hideBlockingSurface('dispatch-modal');
    _renderHangarAfterInlineClose();
  };
}
