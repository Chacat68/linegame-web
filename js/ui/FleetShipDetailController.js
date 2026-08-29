// js/ui/FleetShipDetailController.js — 舰船 Context/L4 详情模型与宿主投影 owner

import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Crew from '../systems/fleet/CrewSystem.js';
import { getFleetCargoUsed } from './FleetHangarPresenter.js';
import {
  buildFleetShipContextView,
  buildFleetShipDetailView,
} from './FleetShipDetailPresenter.js';

export function createFleetShipDetailController(options) {
  var ports = options || {};
  var fleet = ports.fleet || Fleet;
  var crew = ports.crew || Crew;
  var contextRenderCount = 0;
  var detailRenderCount = 0;

  function _buildModel(state, shipIndex) {
    var ship = state && Number.isInteger(shipIndex) ? (state.fleet || [])[shipIndex] : null;
    if (!ship) return null;
    var shipType = fleet.getShipType(ship.typeId) || {};
    var stats = fleet.getEffectiveShipStats(state, ship);
    var routeDisplay = ship.route && fleet.getRouteDisplayInfo
      ? fleet.getRouteDisplayInfo(state, ship, shipIndex)
      : null;
    var routeLabel = ship.route
      ? ((routeDisplay && routeDisplay.statusLabel) || ship.route.status || '自动跑商中')
      : '停靠待命';
    return {
      ship: ship,
      shipIndex: shipIndex,
      shipType: shipType,
      role: stats.roleProfile || fleet.getShipRoleProfile(state, ship),
      maintenance: stats.maintenance || fleet.getShipMaintenanceSummary(state, ship),
      operating: fleet.getShipOperatingSummary(state, ship),
      cargoUsed: getFleetCargoUsed(ship.cargo),
      maxCargo: Math.max(1, stats.maxCargo || ship.maxCargo || 1),
      maxFuel: Math.max(1, stats.maxFuel || ship.maxFuel || 1),
      maxHull: Math.max(1, stats.maxHull || ship.maxHull || 1),
      crewCount: crew.getShipCrew(state, ship).length,
      modCount: (ship.mods || []).length,
      skillCount: fleet.getShipSkills(ship).length,
      faultCount: fleet.getShipFaultSummaries(ship).length,
      active: shipIndex === (state.activeShipIndex || 0),
      routeLabel: routeLabel,
    };
  }

  function renderContextInspector(request) {
    var context = request && request.context;
    var state = request && request.state;
    var container = request && request.container;
    var shipIndex = context ? Number(context.id) : NaN;
    if (!context || context.type !== 'ship' || !state || !container) return false;
    var view = buildFleetShipContextView(_buildModel(state, shipIndex));
    if (!view) return false;
    container.innerHTML = view.html;
    contextRenderCount += 1;
    return { title: view.title };
  }

  function renderWorkspaceDetail(request) {
    var detail = request && request.detail;
    var state = request && request.state;
    var container = request && request.container;
    var shipIndex = detail ? Number(detail.id) : NaN;
    if (!detail || detail.type !== 'fleet-ship' || !state || !container || !Number.isInteger(shipIndex)) return false;
    var view = buildFleetShipDetailView(_buildModel(state, shipIndex));
    if (!view) return false;
    container.innerHTML = view.html;
    detailRenderCount += 1;
    return { title: view.title };
  }

  function getDiagnostics() {
    return Object.freeze({
      contextRenderCount: contextRenderCount,
      detailRenderCount: detailRenderCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    renderContextInspector: renderContextInspector,
    renderWorkspaceDetail: renderWorkspaceDetail,
  });
}
