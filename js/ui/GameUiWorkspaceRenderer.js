// js/ui/GameUiWorkspaceRenderer.js — Market/Fleet/Archive/Save 区域渲染端口

import { UI_REGION } from '../core/ActionPresentation.js';

export const MARKET_RENDER_REGIONS = Object.freeze([
  UI_REGION.MARKET_CHROME,
  UI_REGION.MARKET_SPOT,
  UI_REGION.MARKET_CAPITAL,
  UI_REGION.MARKET_OPERATIONS,
]);

export const FLEET_RENDER_REGIONS = Object.freeze([
  UI_REGION.FLEET_HANGAR,
  UI_REGION.FLEET_SHOP,
]);

export const ARCHIVE_RENDER_REGIONS = Object.freeze([
  UI_REGION.ARCHIVE_QUEST,
  UI_REGION.ARCHIVE_EXPLORATION,
  UI_REGION.ARCHIVE_RESEARCH,
  UI_REGION.ARCHIVE_FACTION,
  UI_REGION.ARCHIVE_ACHIEVEMENT,
]);

export const WORKSPACE_RENDER_REGIONS = Object.freeze([].concat(
  MARKET_RENDER_REGIONS,
  FLEET_RENDER_REGIONS,
  ARCHIVE_RENDER_REGIONS,
  [UI_REGION.SAVE]
));

function _call(target, methodName, args) {
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

function _action(actions, groupName, actionName) {
  var group = actions && actions[groupName];
  if (group && Object.prototype.hasOwnProperty.call(group, actionName)) return group[actionName];
  return actions && Object.prototype.hasOwnProperty.call(actions, actionName)
    ? actions[actionName]
    : undefined;
}

function _callAction(actions, groupName, actionName, args) {
  var callback = _action(actions, groupName, actionName);
  if (typeof callback !== 'function') return undefined;
  return callback.apply(null, args || []);
}

function _normalizeMarketMode(value) {
  return value === 'black' ? 'black' : 'open';
}

export function createGameUiWorkspaceRenderer(options) {
  var ports = options || {};
  var getState = typeof ports.getState === 'function' ? ports.getState : function () { return null; };
  var getLoadedFeature = typeof ports.getLoadedFeature === 'function'
    ? ports.getLoadedFeature
    : function () { return null; };
  var recordRender = typeof ports.recordRender === 'function' ? ports.recordRender : function () {};
  var actions = ports.actions || {};
  var marketWorkspace = ports.marketWorkspace || null;
  var contextAdapters = ports.contextAdapters || null;

  function _createMarketRequest(state) {
    var systemId = _call(marketWorkspace, 'getViewSystem', [state])
      || _call(marketWorkspace, 'getMarketViewSystem', [state]);
    var galaxyId = _call(marketWorkspace, 'getViewGalaxy', [state])
      || _call(marketWorkspace, 'getMarketViewGalaxy', [state]);
    return {
      state: state,
      systemId: systemId || state.currentSystem,
      marketMode: _normalizeMarketMode(_callAction(actions, 'market', 'getMode', [state])),
      galaxyId: galaxyId || state.currentGalaxy,
      onCommand: _action(actions, 'market', 'onCommand'),
    };
  }

  function _afterMarketRender(module, state, mode) {
    _call(contextAdapters, 'connectMarket', [module]);
    _callAction(actions, 'market', 'onAfterRender', [module, state, mode]);
  }

  function renderMarket(MarketUI, stateOverride) {
    var module = MarketUI || getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state || typeof module.render !== 'function') return false;
    var request = _createMarketRequest(state);
    module.render(request);
    _afterMarketRender(module, state, request.marketMode);
    recordRender(MARKET_RENDER_REGIONS);
    return true;
  }

  function renderMarketRegions(module, state, regions) {
    if (!module || !state) return false;
    var requested = Array.from(new Set(regions || [])).filter(function (region) {
      return MARKET_RENDER_REGIONS.indexOf(region) !== -1;
    });
    if (requested.length === 0) return false;
    var request = _createMarketRequest(state);
    var rendered = false;
    var completedRegions = [];

    if (typeof module.renderRegions === 'function') {
      rendered = module.renderRegions(request, requested) !== false;
      if (rendered) completedRegions = requested.slice();
    } else {
      var methodByRegion = {};
      methodByRegion[UI_REGION.MARKET_CHROME] = 'renderChrome';
      methodByRegion[UI_REGION.MARKET_SPOT] = 'renderSpot';
      methodByRegion[UI_REGION.MARKET_CAPITAL] = 'renderCapital';
      methodByRegion[UI_REGION.MARKET_OPERATIONS] = 'renderOperations';
      requested.forEach(function (region) {
        var methodName = methodByRegion[region];
        if (typeof module[methodName] !== 'function') return;
        module[methodName](request);
        completedRegions.push(region);
        rendered = true;
      });
      if (!rendered && typeof module.render === 'function') {
        module.render(request);
        completedRegions = MARKET_RENDER_REGIONS.slice();
        rendered = true;
      }
    }

    if (rendered) {
      _afterMarketRender(module, state, request.marketMode);
      recordRender(completedRegions);
    }
    return rendered;
  }

  function _renderMarketRegion(region, MarketUI, stateOverride, hasStateOverride) {
    var module = MarketUI || getLoadedFeature('market');
    var state = hasStateOverride ? stateOverride : getState();
    return renderMarketRegions(module, state, [region]);
  }

  function renderMarketChrome(MarketUI, stateOverride) {
    return _renderMarketRegion(UI_REGION.MARKET_CHROME, MarketUI, stateOverride, arguments.length > 1);
  }

  function renderMarketSpot(MarketUI, stateOverride) {
    return _renderMarketRegion(UI_REGION.MARKET_SPOT, MarketUI, stateOverride, arguments.length > 1);
  }

  function renderMarketCapital(MarketUI, stateOverride) {
    return _renderMarketRegion(UI_REGION.MARKET_CAPITAL, MarketUI, stateOverride, arguments.length > 1);
  }

  function renderMarketOperations(MarketUI, stateOverride) {
    return _renderMarketRegion(UI_REGION.MARKET_OPERATIONS, MarketUI, stateOverride, arguments.length > 1);
  }

  function renderFleetRegions(module, state, regions) {
    if (!module || !state) return false;
    if (typeof module.setLifecycleActions === 'function') {
      module.setLifecycleActions({ requestRender: function () { return renderFleetHangar(module); } });
    }
    var rendered = false;
    var completedRegions = [];
    var onCommand = _action(actions, 'fleet', 'handleCommand');
    var requested = new Set(regions || []);
    if (requested.has(UI_REGION.FLEET_HANGAR) && typeof module.render === 'function') {
      module.render({ state: state, onCommand: onCommand });
      completedRegions.push(UI_REGION.FLEET_HANGAR);
      rendered = true;
    }
    if (requested.has(UI_REGION.FLEET_SHOP) && typeof module.renderShop === 'function') {
      module.renderShop({ state: state, onCommand: onCommand });
      completedRegions.push(UI_REGION.FLEET_SHOP);
      rendered = true;
    }
    _call(contextAdapters, 'connectFleet', [module]);
    recordRender(completedRegions);
    return rendered;
  }

  function _renderFleetRegion(regions, FleetUI, stateOverride, hasStateOverride) {
    var module = FleetUI || getLoadedFeature('fleet');
    var state = hasStateOverride ? stateOverride : getState();
    return renderFleetRegions(module, state, regions);
  }

  function renderFleetHangar(FleetUI, stateOverride) {
    return _renderFleetRegion([UI_REGION.FLEET_HANGAR], FleetUI, stateOverride, arguments.length > 1);
  }

  function renderFleetShop(FleetUI, stateOverride) {
    return _renderFleetRegion([UI_REGION.FLEET_SHOP], FleetUI, stateOverride, arguments.length > 1);
  }

  function renderFleet(FleetUI, stateOverride) {
    return _renderFleetRegion(FLEET_RENDER_REGIONS, FleetUI, stateOverride, arguments.length > 1);
  }

  function renderArchiveRegions(module, state, regions) {
    if (!module || !state) return false;
    var ResearchUI = module.ResearchUI || module.research;
    var FactionUI = module.FactionUI || module.faction;
    var QuestUI = module.QuestUI || module.quest;
    var ExplorationUI = module.ArchiveExplorationUI || module.exploration;
    var AchievementUI = module.AchievementUI || module.achievement;
    var requested = new Set(regions || []);
    var needsDispatchContext = requested.has(UI_REGION.ARCHIVE_RESEARCH)
      || requested.has(UI_REGION.ARCHIVE_QUEST);
    var dispatchContext = needsDispatchContext
      ? (_callAction(actions, 'archive', 'getDispatchContext', [state]) || null)
      : null;
    var onCommand = _action(actions, 'archive', 'handleCommand');
    var rendered = false;
    var completedRegions = [];

    if (requested.has(UI_REGION.ARCHIVE_RESEARCH) && ResearchUI && typeof ResearchUI.render === 'function') {
      ResearchUI.render({ state: state, dispatchContext: dispatchContext, onCommand: onCommand });
      completedRegions.push(UI_REGION.ARCHIVE_RESEARCH);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_FACTION) && FactionUI && typeof FactionUI.render === 'function') {
      FactionUI.render({ state: state, onCommand: onCommand });
      completedRegions.push(UI_REGION.ARCHIVE_FACTION);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_QUEST) && QuestUI && typeof QuestUI.render === 'function') {
      QuestUI.render({ state: state, dispatchContext: dispatchContext, onCommand: onCommand });
      completedRegions.push(UI_REGION.ARCHIVE_QUEST);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_EXPLORATION) && ExplorationUI && typeof ExplorationUI.render === 'function') {
      ExplorationUI.render(state);
      completedRegions.push(UI_REGION.ARCHIVE_EXPLORATION);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_ACHIEVEMENT) && AchievementUI && typeof AchievementUI.render === 'function') {
      AchievementUI.render(state);
      completedRegions.push(UI_REGION.ARCHIVE_ACHIEVEMENT);
      rendered = true;
    }
    _call(contextAdapters, 'connectArchive', [module]);
    recordRender(completedRegions);
    return rendered;
  }

  function _renderArchiveRegion(regions, ArchiveUI, stateOverride, hasStateOverride) {
    var module = ArchiveUI || getLoadedFeature('archive');
    var state = hasStateOverride ? stateOverride : getState();
    return renderArchiveRegions(module, state, regions);
  }

  function renderArchiveQuest(ArchiveUI, stateOverride) {
    return _renderArchiveRegion([UI_REGION.ARCHIVE_QUEST], ArchiveUI, stateOverride, arguments.length > 1);
  }

  function renderArchiveExploration(ArchiveUI, stateOverride) {
    return _renderArchiveRegion([UI_REGION.ARCHIVE_EXPLORATION], ArchiveUI, stateOverride, arguments.length > 1);
  }

  function renderArchiveResearch(ArchiveUI, stateOverride) {
    return _renderArchiveRegion([UI_REGION.ARCHIVE_RESEARCH], ArchiveUI, stateOverride, arguments.length > 1);
  }

  function renderArchiveFaction(ArchiveUI, stateOverride) {
    return _renderArchiveRegion([UI_REGION.ARCHIVE_FACTION], ArchiveUI, stateOverride, arguments.length > 1);
  }

  function renderArchiveAchievement(ArchiveUI, stateOverride) {
    return _renderArchiveRegion([UI_REGION.ARCHIVE_ACHIEVEMENT], ArchiveUI, stateOverride, arguments.length > 1);
  }

  function renderArchive(ArchiveUI, stateOverride) {
    return _renderArchiveRegion(ARCHIVE_RENDER_REGIONS, ArchiveUI, stateOverride, arguments.length > 1);
  }

  function renderSave(SaveUI, stateOverride) {
    var module = SaveUI || getLoadedFeature('save');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state || typeof module.render !== 'function') return false;
    module.render({
      state: state,
      onCommand: _action(actions, 'save', 'handleCommand'),
    });
    recordRender([UI_REGION.SAVE]);
    return true;
  }

  return Object.freeze({
    renderArchive: renderArchive,
    renderArchiveAchievement: renderArchiveAchievement,
    renderArchiveExploration: renderArchiveExploration,
    renderArchiveFaction: renderArchiveFaction,
    renderArchiveQuest: renderArchiveQuest,
    renderArchiveRegions: renderArchiveRegions,
    renderArchiveResearch: renderArchiveResearch,
    renderFleet: renderFleet,
    renderFleetHangar: renderFleetHangar,
    renderFleetRegions: renderFleetRegions,
    renderFleetShop: renderFleetShop,
    renderMarket: renderMarket,
    renderMarketCapital: renderMarketCapital,
    renderMarketChrome: renderMarketChrome,
    renderMarketOperations: renderMarketOperations,
    renderMarketRegions: renderMarketRegions,
    renderMarketSpot: renderMarketSpot,
    renderSave: renderSave,
  });
}
