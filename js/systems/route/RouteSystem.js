// js/systems/route/RouteSystem.js — 统一航线描述系统
// 依赖：systems/galaxy/ExplorationSystem.js
// 导出：getShipRouteDescriptor, getFleetRouteDescriptors,
//       getSecretRouteDescriptors, createFlightRouteDescriptor

import * as Exploration from '../galaxy/ExplorationSystem.js';

function _getActiveShipIndex(state) {
  return state && typeof state.activeShipIndex === 'number' ? state.activeShipIndex : 0;
}

function _getShipCurrentSystemId(state, ship, shipIndex) {
  var route = ship && ship.route ? ship.route : null;
  var activeIndex = _getActiveShipIndex(state);
  var isActive = shipIndex === activeIndex;
  var currentSystemId = isActive
    ? (state.currentSystem || ship.location)
    : (ship.location || state.currentSystem);

  if (currentSystemId) return currentSystemId;
  if (!route) return null;
  if (route.status === 'traveling_sell' || route.status === 'selling') {
    return route.buySystemId || route.sellSystemId || null;
  }
  return route.sellSystemId || route.buySystemId || null;
}

function _resolveTradeRouteSegment(route, currentSystemId) {
  if (!route) return null;

  var sameSystemRoute = route.buySystemId === route.sellSystemId;
  var atBuySystem = currentSystemId === route.buySystemId;
  var atSellSystem = currentSystemId === route.sellSystemId;
  var targetSystemId = null;
  var statusLabel = route.status;

  if (sameSystemRoute) {
    targetSystemId = currentSystemId || route.buySystemId || route.sellSystemId || null;
    statusLabel = (route.status === 'traveling_sell' || route.status === 'selling')
      ? '💰 同站卖出中'
      : '📦 同站买入中';
  } else if (atBuySystem) {
    targetSystemId = route.sellSystemId;
    statusLabel = (route.status === 'traveling_sell' || route.status === 'selling')
      ? '🚀 前往卖出地'
      : '📦 买入中';
  } else if (atSellSystem) {
    targetSystemId = route.buySystemId;
    statusLabel = (route.status === 'traveling_buy' || route.status === 'buying')
      ? '🚀 前往买入地'
      : '💰 卖出中';
  } else if (route.status === 'traveling_sell' || route.status === 'selling') {
    targetSystemId = route.sellSystemId;
    statusLabel = route.status === 'selling' ? '💰 卖出中' : '🚀 前往卖出地';
  } else {
    targetSystemId = route.buySystemId;
    statusLabel = route.status === 'buying' ? '📦 买入中' : '🚀 前往买入地';
  }

  return {
    currentSystemId: currentSystemId,
    startSystemId: currentSystemId,
    endSystemId: targetSystemId || currentSystemId || null,
    targetSystemId: targetSystemId || currentSystemId || null,
    isTraveling:
      !sameSystemRoute && (
        (route.status === 'traveling_buy' && !atBuySystem) ||
        (route.status === 'traveling_sell' && !atSellSystem)
      ),
    hasTravelSegment: !!targetSystemId && !!currentSystemId && currentSystemId !== targetSystemId,
    sameSystemRoute: sameSystemRoute,
    statusLabel: statusLabel,
  };
}

export function getShipRouteDescriptor(state, ship, shipIndex) {
  if (!ship || !ship.route) return null;

  var currentSystemId = _getShipCurrentSystemId(state, ship, shipIndex);
  var segment = _resolveTradeRouteSegment(ship.route, currentSystemId);
  if (!segment) return null;

  return {
    id: 'ship-route-' + (shipIndex != null ? shipIndex : 'active'),
    source: 'fleet',
    shipIndex: shipIndex != null ? shipIndex : null,
    shipTypeId: ship.typeId || 'shuttle',
    routeRevision: ship.routeRevision != null ? ship.routeRevision : (ship.route.revision != null ? ship.route.revision : null),
    goodId: ship.route.goodId || null,
    marketMode: ship.route.marketMode || 'open',
    currentSystemId: segment.currentSystemId,
    sourceSystemId: segment.startSystemId,
    targetSystemId: segment.targetSystemId,
    startSystemId: segment.startSystemId,
    endSystemId: segment.endSystemId,
    isTraveling: segment.isTraveling,
    hasTravelSegment: segment.hasTravelSegment,
    sameSystemRoute: segment.sameSystemRoute,
    statusLabel: segment.statusLabel,
  };
}

export function getFleetRouteDescriptors(state, options) {
  if (!state || !Array.isArray(state.fleet)) return [];

  var skipShipIndex = options && typeof options.skipShipIndex === 'number'
    ? options.skipShipIndex
    : null;

  return state.fleet
    .map(function (ship, idx) {
      if (idx === skipShipIndex) return null;
      return getShipRouteDescriptor(state, ship, idx);
    })
    .filter(function (descriptor) { return !!descriptor; });
}

export function getSecretRouteDescriptors(state) {
  return Exploration.getCurrentSystemSecretRoutes(state).map(function (route) {
    var sameSystemRoute = route.sourceSystemId === route.targetSystemId;
    return {
      id: 'secret-route-' + route.id,
      source: 'secret',
      routeId: route.id,
      currentSystemId: route.sourceSystemId,
      sourceSystemId: route.sourceSystemId,
      targetSystemId: route.targetSystemId,
      startSystemId: route.sourceSystemId,
      endSystemId: route.targetSystemId,
      isTraveling: false,
      hasTravelSegment: !sameSystemRoute,
      sameSystemRoute: sameSystemRoute,
      statusLabel: route.label || '隐藏航线',
      label: route.label,
      targetSystemName: route.targetSystemName,
      discountPercent: route.discountPercent,
      fuelMultiplier: route.fuelMultiplier,
    };
  });
}

export function createFlightRouteDescriptor(fromId, toId, flightMeta) {
  return {
    id: 'active-flight-route',
    source: 'flight',
    shipIndex: flightMeta && typeof flightMeta.shipIndex === 'number' ? flightMeta.shipIndex : 0,
    shipTypeId: flightMeta && flightMeta.shipTypeId ? flightMeta.shipTypeId : 'shuttle',
    routeRevision: flightMeta && flightMeta.routeRevision != null ? flightMeta.routeRevision : null,
    currentSystemId: fromId,
    sourceSystemId: fromId,
    targetSystemId: toId,
    startSystemId: fromId,
    endSystemId: toId,
    isTraveling: !!fromId && !!toId && fromId !== toId,
    hasTravelSegment: !!fromId && !!toId && fromId !== toId,
    sameSystemRoute: fromId === toId,
    statusLabel: '🚀 航行中',
  };
}
