// js/ui/Renderer2DStarmap.js - tactical 2D starmap renderer
// Exports the same public contract as Renderer3DAdvanced so MapUI/GameManager can stay stable.

import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as RouteModel from '../systems/route/RouteSystem.js';
import {
  getRouteMotionProgress,
  getRouteVisibilityMode,
  getShipTravelVisualState,
  pruneRouteMotionStates,
  resolveRouteMotionState,
} from './StarmapRouteMotion.js';
import { FACTIONS } from '../data/factions.js';
import {
  GALAXIES,
  findSystem,
  getGalaxyAccessState,
  isSystemAccessible,
} from '../data/systems.js';

const TWO_PI = Math.PI * 2;
const BASE_DPR = 2;
const NODE_COLORS = {
  agricultural: '#5fd47a',
  technology: '#55a8ff',
  mining: '#ffb35a',
  commercial: '#d277ff',
  military: '#ff5d8f',
  medical: '#54e4ee',
  industrial: '#ff8662',
  energy: '#ffe16a',
  research: '#79e394',
  special: '#a6b8c5',
};
const SHIP_ACCENTS = {
  shuttle: '#72ddff',
  freighter: '#ffb05b',
  clipper: '#66f0a2',
  galleon: '#ff79d7',
};

let _canvas = null;
let _ctx = null;
let _isActive = false;
let _qualityLevel = 'auto';
let _motionLevel = 'full';
let _resolvedQualityLevel = null;
let _listenersBound = false;
let _dirty = true;

let _mapView = 'planets';
let _currentGalaxyId = 'milky_way';
let _currentSystem = null;
let _stateRef = null;
let _planetMetadata = [];
let _galaxyMetadata = [];
let _hoveredPlanet = null;
let _hoveredGalaxyId = null;
let _selectedPlanetId = null;
let _focusPlanetId = null;
let _secretRoutesVisible = true;
let _lastViewport = null;
let _lastCanvasKey = '';
let _stars = [];
let _flightPath = null;
const _routeMotionStates = new Map();

export function init() {
  if (typeof document === 'undefined' || !document.getElementById) {
    _isActive = false;
    return false;
  }

  _canvas = document.getElementById('map-3d-canvas');
  if (!_canvas || typeof _canvas.getContext !== 'function') {
    _isActive = false;
    return false;
  }

  _ctx = _canvas.getContext('2d');
  if (!_ctx) {
    _isActive = false;
    return false;
  }

  if (_canvas.classList && _canvas.classList.add) {
    _canvas.classList.add('starmap-2d-canvas');
  }
  if (_canvas.setAttribute) {
    _canvas.setAttribute('aria-label', '2D 星图场景');
  }
  _canvas.style.display = 'block';
  _bindEvents();
  _resizeCanvas();
  _isActive = true;
  _dirty = true;
  return true;
}

export function setQuality(level) {
  _qualityLevel = _normalizeQualityLevel(level);
  _resolvedQualityLevel = null;
  _lastCanvasKey = '';
  _dirty = true;
}

export function setMotionLevel(level) {
  _motionLevel = level === 'off' || level === 'reduced' ? level : 'full';
  _dirty = true;
}

export function isActive() {
  return _isActive;
}

export function toggleView() {
  setVisible(!_isActive);
}

export function setVisible(visible) {
  if ((!_canvas || !_ctx) && visible && !init()) return false;
  _isActive = !!visible;
  if (_canvas) _canvas.style.display = _isActive ? 'block' : 'none';
  _dirty = true;
  return _isActive;
}

export function render(state, mapView, galaxyId) {
  if (!_isActive || !_ctx || !_canvas) return;

  _stateRef = state || _stateRef || {};
  _syncFlightPathWithState(_stateRef);
  _mapView = mapView || (_stateRef && _stateRef.mapView) || 'planets';
  _currentGalaxyId = galaxyId || (_stateRef && (_stateRef.viewingGalaxy || _stateRef.currentGalaxy)) || 'milky_way';
  _currentSystem = _stateRef ? _stateRef.currentSystem : null;

  const sizeChanged = _resizeCanvas();
  const time = performance && performance.now ? performance.now() : Date.now();
  _drawScene(_stateRef, time);
  _completeFlightIfNeeded(time);
  _dirty = false;
  if (sizeChanged) _refreshHoverFromLastPointer();
}

export function focusPlanet(planetId) {
  _focusPlanetId = planetId || null;
  _dirty = true;
}

export function selectPlanet(planetId, options) {
  if (!planetId || !findSystem(planetId)) return false;
  _selectedPlanetId = planetId;
  if (!options || options.focus !== false) {
    _focusPlanetId = planetId;
  }
  _dirty = true;
  return true;
}

export function clearSelection() {
  _selectedPlanetId = null;
  _focusPlanetId = null;
  _dirty = true;
}

export function resetCamera() {
  _focusPlanetId = null;
  _dirty = true;
}

export function flyShipTo(fromId, toId, onComplete, shipTypeId, flightMeta) {
  if (!_isActive || !fromId || !toId) {
    if (onComplete) onComplete();
    return;
  }

  if (fromId === toId) {
    cancelShipFlight();
    if (onComplete) onComplete();
    return;
  }

  const fromSystem = findSystem(fromId);
  const toSystem = findSystem(toId);
  if (!fromSystem || !toSystem) {
    if (onComplete) onComplete();
    return;
  }

  const dx = (fromSystem.x || 0) - (toSystem.x || 0);
  const dy = (fromSystem.y || 0) - (toSystem.y || 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const routeDescriptor = RouteModel.createFlightRouteDescriptor(fromId, toId, {
    shipIndex: flightMeta && typeof flightMeta.shipIndex === 'number' ? flightMeta.shipIndex : 0,
    shipTypeId: shipTypeId || 'shuttle',
    routeRevision: flightMeta && flightMeta.routeRevision != null ? flightMeta.routeRevision : null,
  });

  _flightPath = {
    fromId,
    toId,
    shipTypeId: shipTypeId || 'shuttle',
    startTime: performance && performance.now ? performance.now() : Date.now(),
    duration: _motionLevel === 'off' ? 0 : Math.min(8200, Math.max(2800, dist * 16500)),
    onComplete: onComplete || null,
    routeDescriptor,
    shipIndex: routeDescriptor.shipIndex,
    routeRevision: routeDescriptor.routeRevision,
  };
  _dirty = true;
}

export function isShipFlying() {
  return !!_flightPath;
}

export function cancelShipFlight() {
  _flightPath = null;
  _dirty = true;
}

export function getSystemAtPoint(x, y) {
  const hit = _hitTest(Number(x) || 0, Number(y) || 0);
  return hit && hit.type === 'system' ? hit.id : null;
}

export function invalidateScene() {
  _dirty = true;
}

export function setSecretRoutesVisible(visible) {
  _secretRoutesVisible = visible !== false;
  _dirty = true;
}

export function isSecretRoutesVisible() {
  return _secretRoutesVisible;
}

export function getPlanetScreenPosition(planetId) {
  const meta = _planetMetadata.find(function (item) { return item.id === planetId; });
  if (meta) return { x: meta.x, y: meta.y };

  const sys = findSystem(planetId);
  if (!_lastViewport || !sys) return null;
  return _projectNormalized(sys.x || 0.5, sys.y || 0.5, _lastViewport);
}

export function resetRuntimeState(currentSystemId) {
  _currentSystem = currentSystemId || null;
  _hoveredPlanet = null;
  _hoveredGalaxyId = null;
  _selectedPlanetId = null;
  _focusPlanetId = null;
  _routeMotionStates.clear();
  cancelShipFlight();
}

function _bindEvents() {
  if (_listenersBound || !_canvas) return;
  _canvas.addEventListener('pointermove', _onPointerMove);
  _canvas.addEventListener('pointerleave', _onPointerLeave);
  _canvas.addEventListener('click', _onClick);
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', function () {
      _lastCanvasKey = '';
      _dirty = true;
    });
  }
  _listenersBound = true;
}

function _resizeCanvas() {
  if (!_canvas || !_ctx) return false;
  const rect = _canvas.getBoundingClientRect ? _canvas.getBoundingClientRect() : null;
  const cssWidth = Math.max(1, Math.round((rect && rect.width) || _canvas.clientWidth || 1280));
  const cssHeight = Math.max(1, Math.round((rect && rect.height) || _canvas.clientHeight || 720));
  const rawDpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const dpr = Math.max(1, Math.min(BASE_DPR, rawDpr));
  const nextWidth = Math.round(cssWidth * dpr);
  const nextHeight = Math.round(cssHeight * dpr);
  const changed = _canvas.width !== nextWidth || _canvas.height !== nextHeight;

  if (changed) {
    _canvas.width = nextWidth;
    _canvas.height = nextHeight;
  }
  _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const quality = _getEffectiveQualityLevel(cssWidth, cssHeight);
  const key = cssWidth + 'x' + cssHeight + ':' + quality;
  if (key !== _lastCanvasKey) {
    _stars = _buildStars(cssWidth, cssHeight, quality);
    _lastCanvasKey = key;
  }
  return changed;
}

function _drawScene(state, time) {
  const width = _canvas.clientWidth || Math.round(_canvas.width / _getCanvasDpr());
  const height = _canvas.clientHeight || Math.round(_canvas.height / _getCanvasDpr());
  const viewport = _buildViewport(width, height, _mapView);
  _lastViewport = viewport;

  _ctx.clearRect(0, 0, width, height);
  _drawBackground(_ctx, width, height, time);
  _drawViewportFrame(_ctx, viewport, time);

  if (_mapView === 'galaxies') {
    _drawGalaxyOverview(_ctx, state, viewport, time);
  } else {
    _drawPlanetMap(_ctx, state, viewport, time);
  }
}

function _drawBackground(ctx, width, height, time) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#061015');
  bg.addColorStop(0.42, '#07131c');
  bg.addColorStop(1, '#030507');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  _fillRadial(ctx, width * 0.23, height * 0.2, width * 0.42, 'rgba(85,168,255,0.20)', 'rgba(85,168,255,0)');
  _fillRadial(ctx, width * 0.82, height * 0.3, width * 0.36, 'rgba(255,179,90,0.13)', 'rgba(255,179,90,0)');
  _fillRadial(ctx, width * 0.48, height * 0.82, width * 0.46, 'rgba(94,230,174,0.10)', 'rgba(94,230,174,0)');

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  _stars.forEach(function (star, index) {
    const flicker = _motionLevel === 'off' ? 0.7 : 0.55 + Math.sin(time * 0.0012 + index) * 0.25;
    ctx.fillStyle = 'rgba(' + star.r + ',' + star.g + ',' + star.b + ',' + (star.a * flicker).toFixed(3) + ')';
    ctx.fillRect(star.x, star.y, star.s, star.s);
  });
  ctx.restore();
}

function _drawViewportFrame(ctx, viewport, time) {
  const pulse = _motionLevel === 'off' ? 0.35 : 0.35 + Math.sin(time * 0.002) * 0.12;
  ctx.save();
  ctx.strokeStyle = 'rgba(114,221,255,' + (0.12 + pulse * 0.12).toFixed(3) + ')';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 14]);
  for (let x = viewport.left; x <= viewport.right; x += Math.max(54, viewport.width / 8)) {
    _line(ctx, x, viewport.top, x, viewport.bottom);
  }
  for (let y = viewport.top; y <= viewport.bottom; y += Math.max(46, viewport.height / 6)) {
    _line(ctx, viewport.left, y, viewport.right, y);
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(114,221,255,0.32)';
  ctx.lineWidth = 1.5;
  _cornerFrame(ctx, viewport.left, viewport.top, viewport.right, viewport.bottom, 28);

  ctx.fillStyle = 'rgba(212,238,246,0.52)';
  ctx.font = '600 11px Rajdhani, PingFang SC, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(_mapView === 'galaxies' ? 'GALAXY LATTICE' : 'LOCAL ROUTE CHART', viewport.left + 10, viewport.top + 9);
  ctx.fillText('2D TACTICAL', viewport.right - 92, viewport.bottom - 24);
  ctx.restore();
}

function _drawPlanetMap(ctx, state, viewport, time) {
  const hierarchy = GalaxyData.getGalaxyHierarchy(_currentGalaxyId);
  const systems = hierarchy && Array.isArray(hierarchy.allPlanets) ? hierarchy.allPlanets : [];
  _planetMetadata = systems.map(function (system) {
    return _buildPlanetMeta(system, state, viewport);
  });
  _galaxyMetadata = [];

  _drawFactionAuras(ctx, _planetMetadata);
  _drawLocalConnections(ctx, _planetMetadata);
  _drawRouteDescriptors(ctx, state, time);
  _planetMetadata.forEach(function (meta) {
    _drawPlanetNode(ctx, meta, state, time);
  });
  _drawFlightPath(ctx, time);
  _drawPlanetLabels(ctx);
}

function _drawGalaxyOverview(ctx, state, viewport, time) {
  _planetMetadata = [];
  _galaxyMetadata = GALAXIES.map(function (galaxy) {
    const pos = _projectNormalized(galaxy.gx || 0.5, galaxy.gy || 0.5, viewport);
    const access = getGalaxyAccessState(galaxy.id, state.playerLevel || 1, state.researchedTechs || []);
    const seed = _hash(galaxy.id);
    const radius = 24 + (seed % 11);
    return {
      type: 'galaxy',
      id: galaxy.id,
      name: galaxy.name,
      color: galaxy.color || '#55a8ff',
      x: pos.x,
      y: pos.y,
      radius,
      unlocked: access.unlocked,
      requiredLevel: access.requiredLevel,
      current: galaxy.id === (state.currentGalaxy || 'milky_way'),
      access,
    };
  });

  _drawGalaxyLinks(ctx, _galaxyMetadata);
  _galaxyMetadata.forEach(function (meta) {
    _drawGalaxyNode(ctx, meta, time);
  });
}

function _buildPlanetMeta(system, state, viewport) {
  const pos = _projectNormalized(system.position ? system.position.x : system.x, system.position ? system.position.y : system.y, viewport);
  const color = NODE_COLORS[system.type] || system.color || '#72ddff';
  const priceValues = system.prices ? Object.values(system.prices) : [];
  const avgPrice = priceValues.length ? priceValues.reduce(function (sum, value) { return sum + value; }, 0) / priceValues.length : 1;
  const baseRadius = Math.max(5.5, Math.min(10.5, 12.5 - avgPrice * 2.2));
  const specialBoost = system.type === 'special' ? 2 : 0;
  const unlocked = isSystemAccessible(system.id, state.playerLevel || 1, state.researchedTechs || []);
  return {
    type: 'system',
    id: system.id,
    name: system.name,
    system,
    x: pos.x,
    y: pos.y,
    nx: system.position ? system.position.x : system.x,
    ny: system.position ? system.position.y : system.y,
    radius: baseRadius + specialBoost,
    color,
    unlocked,
    current: system.id === state.currentSystem,
    selected: system.id === _selectedPlanetId,
    focused: system.id === _focusPlanetId,
    hovered: _hoveredPlanet && _hoveredPlanet.id === system.id,
    owner: system.owner,
  };
}

function _drawFactionAuras(ctx, metas) {
  const byOwner = new Map();
  metas.forEach(function (meta) {
    if (!meta.owner || meta.owner === 'player') return;
    if (!byOwner.has(meta.owner)) byOwner.set(meta.owner, []);
    byOwner.get(meta.owner).push(meta);
  });

  ctx.save();
  byOwner.forEach(function (items, ownerId) {
    const faction = FACTIONS.find(function (item) { return item.id === ownerId; });
    const color = faction && faction.color ? faction.color : '#72ddff';
    ctx.fillStyle = _alpha(color, 0.07);
    ctx.strokeStyle = _alpha(color, 0.14);
    ctx.lineWidth = 1;
    items.forEach(function (meta) {
      ctx.beginPath();
      ctx.ellipse(meta.x, meta.y, meta.radius * 4.8, meta.radius * 3.2, 0, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
    });
  });
  ctx.restore();
}

function _drawLocalConnections(ctx, metas) {
  const links = [];
  metas.forEach(function (left, i) {
    const nearest = metas
      .filter(function (_, j) { return j !== i; })
      .map(function (right) {
        const dx = left.nx - right.nx;
        const dy = left.ny - right.ny;
        return { right, d: Math.sqrt(dx * dx + dy * dy) };
      })
      .filter(function (entry) { return entry.d < 0.17; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 2);
    nearest.forEach(function (entry) {
      const key = [left.id, entry.right.id].sort().join(':');
      if (!links.some(function (link) { return link.key === key; })) {
        links.push({ key, from: left, to: entry.right, distance: entry.d });
      }
    });
  });

  ctx.save();
  links.forEach(function (link) {
    const active = link.from.current || link.to.current || link.from.selected || link.to.selected;
    ctx.strokeStyle = active ? 'rgba(114,221,255,0.32)' : 'rgba(134,170,185,0.13)';
    ctx.lineWidth = active ? 1.4 : 1;
    ctx.setLineDash(active ? [] : [2, 8]);
    _line(ctx, link.from.x, link.from.y, link.to.x, link.to.y);
  });
  ctx.restore();
}

function _drawRouteDescriptors(ctx, state, time) {
  if (_secretRoutesVisible) {
    RouteModel.getSecretRouteDescriptors(state).forEach(function (route, index) {
      _drawRoute(ctx, route.startSystemId, route.endSystemId, {
        color: '#8bd8ff',
        alpha: 0.62,
        width: 1.8,
        dash: [7, 7],
        label: index < 2 ? '暗线' : '',
        time,
      });
    });
  }

  const activeIndex = state && typeof state.activeShipIndex === 'number' ? state.activeShipIndex : 0;
  const routeMotionIds = new Set();
  RouteModel.getFleetRouteDescriptors(state, {
    skipShipIndex: _flightPath ? activeIndex : null,
  }).forEach(function (route) {
    const motion = resolveRouteMotionState(_routeMotionStates, route, time);
    const displayRoute = motion.route;
    const active = displayRoute.shipIndex === activeIndex;
    routeMotionIds.add(route.id);
    _drawRoute(ctx, displayRoute.startSystemId, displayRoute.endSystemId, {
      color: active ? '#72ddff' : '#ffbf66',
      alpha: active ? 0.74 : 0.48,
      width: active ? 2.1 : 1.5,
      dash: active ? [] : [8, 5],
      shipTypeId: displayRoute.shipTypeId,
      movingMarker: displayRoute.isTraveling,
      markerStartTime: motion.startTime,
      time,
    });
  });
  pruneRouteMotionStates(_routeMotionStates, routeMotionIds);
}

function _drawPlanetNode(ctx, meta, state, time) {
  const isHot = meta.current || meta.selected || meta.focused || meta.hovered;
  const pulse = _motionLevel === 'off' ? 0.5 : 0.5 + Math.sin(time * 0.004 + _hash(meta.id)) * 0.5;
  const alpha = meta.unlocked ? 1 : 0.42;

  ctx.save();
  ctx.globalAlpha = alpha;
  _fillRadial(ctx, meta.x, meta.y, meta.radius * (isHot ? 8.5 : 5.2), _alpha(meta.color, isHot ? 0.32 : 0.16), _alpha(meta.color, 0));

  ctx.strokeStyle = _alpha(meta.color, isHot ? 0.64 : 0.28);
  ctx.lineWidth = isHot ? 2 : 1;
  ctx.beginPath();
  ctx.arc(meta.x, meta.y, meta.radius * (1.9 + pulse * 0.12), 0, TWO_PI);
  ctx.stroke();

  if (meta.current) {
    ctx.strokeStyle = 'rgba(255,232,169,0.82)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(meta.x, meta.y, meta.radius * (2.8 + pulse * 0.28), 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const body = ctx.createRadialGradient(
    meta.x - meta.radius * 0.32,
    meta.y - meta.radius * 0.36,
    1,
    meta.x,
    meta.y,
    meta.radius * 1.25
  );
  body.addColorStop(0, '#f8fbff');
  body.addColorStop(0.22, _mix(meta.color, '#ffffff', 0.18));
  body.addColorStop(1, _mix(meta.color, '#020607', 0.42));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(meta.x, meta.y, meta.radius, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = meta.selected ? 'rgba(255,224,132,0.96)' : _alpha(meta.color, 0.75);
  ctx.lineWidth = meta.selected ? 2.6 : 1.3;
  ctx.beginPath();
  ctx.arc(meta.x, meta.y, meta.radius + 2, 0, TWO_PI);
  ctx.stroke();

  if (!meta.unlocked) {
    ctx.strokeStyle = 'rgba(212,224,232,0.34)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(meta.x, meta.y, meta.radius + 6, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawTypeGlyph(ctx, meta);
  ctx.restore();
}

function _drawPlanetLabels(ctx) {
  const showAll = (_canvas.clientWidth || 0) >= 760;
  ctx.save();
  _planetMetadata.forEach(function (meta) {
    const important = meta.current || meta.selected || meta.focused || meta.hovered;
    if (!showAll && !important) return;

    const text = meta.name;
    ctx.font = important ? '700 13px Rajdhani, PingFang SC, sans-serif' : '600 11px Rajdhani, PingFang SC, sans-serif';
    const width = Math.ceil(ctx.measureText(text).width);
    const labelX = Math.round(meta.x + meta.radius + 8);
    const labelY = Math.round(meta.y - (important ? 14 : 11));
    const bgWidth = width + 12;
    const bgHeight = important ? 20 : 17;
    ctx.fillStyle = important ? 'rgba(4,14,20,0.74)' : 'rgba(4,14,20,0.48)';
    _roundRect(ctx, labelX - 5, labelY - 2, bgWidth, bgHeight, 4);
    ctx.fill();
    ctx.fillStyle = meta.unlocked ? (important ? '#f4fbff' : 'rgba(211,237,247,0.76)') : 'rgba(190,203,211,0.54)';
    ctx.textBaseline = 'top';
    ctx.fillText(text, labelX, labelY);
  });
  ctx.restore();
}

function _drawGalaxyLinks(ctx, metas) {
  ctx.save();
  const current = metas.find(function (meta) { return meta.current; });
  metas.forEach(function (meta) {
    if (!current || meta.id === current.id) return;
    ctx.strokeStyle = meta.unlocked ? 'rgba(114,221,255,0.22)' : 'rgba(149,164,176,0.10)';
    ctx.lineWidth = meta.unlocked ? 1.5 : 1;
    ctx.setLineDash(meta.unlocked ? [] : [4, 8]);
    _line(ctx, current.x, current.y, meta.x, meta.y);
  });
  ctx.restore();
}

function _drawGalaxyNode(ctx, meta, time) {
  const hovered = _hoveredGalaxyId === meta.id;
  const pulse = _motionLevel === 'off' ? 0.5 : 0.5 + Math.sin(time * 0.003 + _hash(meta.id)) * 0.5;
  const alpha = meta.unlocked ? 1 : 0.35;
  const radius = meta.radius * (hovered ? 1.12 : meta.current ? 1.06 : 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  _fillRadial(ctx, meta.x, meta.y, radius * 3.7, _alpha(meta.color, hovered ? 0.38 : 0.23), _alpha(meta.color, 0));

  ctx.translate(meta.x, meta.y);
  ctx.rotate((_hash(meta.id) % 628) / 100 + (time * (_motionLevel === 'off' ? 0 : 0.00012)));
  for (let arm = 0; arm < 3; arm++) {
    ctx.strokeStyle = _alpha(meta.color, 0.28);
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let t = 0; t < 1; t += 0.045) {
      const angle = arm * TWO_PI / 3 + t * Math.PI * 1.8;
      const r = radius * (0.2 + t * 1.25);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.58;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.rotate(-((_hash(meta.id) % 628) / 100 + (time * (_motionLevel === 'off' ? 0 : 0.00012))));
  ctx.translate(-meta.x, -meta.y);

  const core = ctx.createRadialGradient(meta.x, meta.y, 0, meta.x, meta.y, radius);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.26, _mix(meta.color, '#ffffff', 0.18));
  core.addColorStop(1, _alpha(meta.color, 0.08));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(meta.x, meta.y, radius, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = meta.current ? 'rgba(255,224,132,0.92)' : _alpha(meta.color, hovered ? 0.8 : 0.45);
  ctx.lineWidth = meta.current || hovered ? 2.4 : 1.4;
  ctx.beginPath();
  ctx.arc(meta.x, meta.y, radius * (1.45 + pulse * 0.08), 0, TWO_PI);
  ctx.stroke();

  ctx.font = hovered || meta.current ? '700 15px Rajdhani, PingFang SC, sans-serif' : '600 13px Rajdhani, PingFang SC, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = meta.unlocked ? '#edfaff' : 'rgba(203,214,222,0.62)';
  ctx.fillText(meta.name, meta.x, meta.y + radius + 11);
  if (!meta.unlocked) {
    ctx.font = '600 11px Rajdhani, PingFang SC, sans-serif';
    ctx.fillStyle = 'rgba(255,210,139,0.76)';
    ctx.fillText('Lv.' + meta.requiredLevel + ' 开放', meta.x, meta.y + radius + 29);
  }
  ctx.restore();
}

function _drawFlightPath(ctx, time) {
  if (!_flightPath) return;
  const routeScene = _getRouteSceneGeometry(_flightPath.fromId, _flightPath.toId, 0.18);
  if (!routeScene) return;

  const elapsed = Math.max(0, time - _flightPath.startTime);
  const t = _flightPath.duration > 0 ? Math.min(1, elapsed / _flightPath.duration) : 1;
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const p = _quadPoint(routeScene.from, routeScene.mid, routeScene.to, eased);
  const ahead = _quadPoint(routeScene.from, routeScene.mid, routeScene.to, Math.min(1, eased + 0.02));
  const color = SHIP_ACCENTS[_flightPath.shipTypeId] || SHIP_ACCENTS.shuttle;
  const visual = getShipTravelVisualState(t, _motionLevel, routeScene.visibilityMode);

  _drawRoute(ctx, _flightPath.fromId, _flightPath.toId, {
    color,
    alpha: 0.88,
    width: 2.5,
    dash: [],
    time,
  });
  _drawShipGlyph(
    ctx,
    p.x,
    p.y,
    Math.atan2(ahead.y - p.y, ahead.x - p.x),
    color,
    1.25,
    _flightPath.shipTypeId,
    visual,
    time
  );
}

function _drawRoute(ctx, fromId, toId, options) {
  if (!fromId || !toId || fromId === toId) return;
  const routeScene = _getRouteSceneGeometry(fromId, toId, 0.14);
  if (!routeScene) return;

  ctx.save();
  ctx.strokeStyle = _alpha(options.color, options.alpha == null ? 0.6 : options.alpha);
  ctx.lineWidth = options.width || 1.5;
  ctx.setLineDash(options.dash || []);
  ctx.beginPath();
  ctx.moveTo(routeScene.from.x, routeScene.from.y);
  ctx.quadraticCurveTo(routeScene.mid.x, routeScene.mid.y, routeScene.to.x, routeScene.to.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (options.label) {
    const labelPoint = _quadPoint(routeScene.from, routeScene.mid, routeScene.to, 0.56);
    ctx.fillStyle = _alpha(options.color, 0.72);
    ctx.font = '600 11px Rajdhani, PingFang SC, sans-serif';
    ctx.fillText(options.label, labelPoint.x + 6, labelPoint.y - 6);
  }

  if (options.movingMarker) {
    const raw = getRouteMotionProgress(options.time, options.markerStartTime, _motionLevel);
    const p = _quadPoint(routeScene.from, routeScene.mid, routeScene.to, raw);
    const ahead = _quadPoint(routeScene.from, routeScene.mid, routeScene.to, Math.min(1, raw + 0.03));
    const visual = getShipTravelVisualState(raw, _motionLevel, routeScene.visibilityMode);
    _drawShipGlyph(
      ctx,
      p.x,
      p.y,
      Math.atan2(ahead.y - p.y, ahead.x - p.x),
      options.color,
      0.78,
      options.shipTypeId,
      visual,
      options.time
    );
  }
  ctx.restore();
}

function _drawShipGlyph(ctx, x, y, angle, color, scale, shipTypeId, visualState, time) {
  const visual = visualState || { opacity: 1, scale: 1, engine: 0.7, flash: 0 };
  if (visual.opacity <= 0.01) return;
  const typeId = SHIP_ACCENTS[shipTypeId] ? shipTypeId : 'shuttle';
  const pulse = _motionLevel === 'off' ? 0 : 0.5 + Math.sin((Number(time) || 0) * 0.012) * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const visualScale = (scale || 1) * visual.scale;
  ctx.scale(visualScale, visualScale);
  ctx.globalAlpha = visual.opacity;

  const trail = ctx.createLinearGradient(-22, 0, -4, 0);
  trail.addColorStop(0, _alpha(color, 0));
  trail.addColorStop(0.72, _alpha(color, 0.2 * visual.engine));
  trail.addColorStop(1, _alpha(color, 0.92 * visual.engine));
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(-5, -2.4);
  ctx.lineTo(-22 - pulse * 3, 0);
  ctx.lineTo(-5, 2.4);
  ctx.closePath();
  ctx.fill();

  if (visual.flash > 0.01) {
    ctx.strokeStyle = _alpha(color, visual.flash * 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 13 + visual.flash * 7, 0, TWO_PI);
    ctx.stroke();
  }

  ctx.fillStyle = _alpha(color, typeId === 'galleon' ? 0.62 : 0.52);
  ctx.beginPath();
  if (typeId === 'freighter') {
    ctx.moveTo(4, -7);
    ctx.lineTo(-9, -7);
    ctx.lineTo(-12, -3.5);
    ctx.lineTo(-12, 3.5);
    ctx.lineTo(-9, 7);
    ctx.lineTo(4, 7);
  } else if (typeId === 'clipper') {
    ctx.moveTo(3, -2.2);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-7, -1.2);
    ctx.lineTo(-7, 1.2);
    ctx.lineTo(-10, 10);
    ctx.lineTo(3, 2.2);
  } else if (typeId === 'galleon') {
    ctx.moveTo(6, -5);
    ctx.lineTo(-6, -10);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-12, 8);
    ctx.lineTo(-6, 10);
    ctx.lineTo(6, 5);
  } else {
    ctx.moveTo(3, -3);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-5, -1.5);
    ctx.lineTo(-5, 1.5);
    ctx.lineTo(-8, 7);
    ctx.lineTo(3, 3);
  }
  ctx.closePath();
  ctx.fill();

  const hullColor = _mix(color, '#effcff', typeId === 'galleon' ? 0.34 : 0.5);
  ctx.fillStyle = hullColor;
  ctx.strokeStyle = 'rgba(255,255,255,0.82)';
  ctx.lineWidth = typeId === 'galleon' ? 1.25 : 1;
  ctx.beginPath();
  if (typeId === 'freighter') {
    ctx.moveTo(12, 0);
    ctx.lineTo(5, -4.5);
    ctx.lineTo(-9, -4.5);
    ctx.lineTo(-12, -2);
    ctx.lineTo(-12, 2);
    ctx.lineTo(-9, 4.5);
    ctx.lineTo(5, 4.5);
  } else if (typeId === 'clipper') {
    ctx.moveTo(16, 0);
    ctx.lineTo(-6, -2.8);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-6, 2.8);
  } else if (typeId === 'galleon') {
    ctx.moveTo(14, 0);
    ctx.lineTo(7, -5.6);
    ctx.lineTo(-9, -6.2);
    ctx.lineTo(-13, -3.2);
    ctx.lineTo(-13, 3.2);
    ctx.lineTo(-9, 6.2);
    ctx.lineTo(7, 5.6);
  } else {
    ctx.moveTo(12, 0);
    ctx.lineTo(-7, -4.2);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 4.2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(4,20,30,0.78)';
  ctx.beginPath();
  ctx.ellipse(typeId === 'clipper' ? 5 : 4, 0, typeId === 'galleon' ? 3.2 : 2.5, 1.5, 0, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = _alpha(color, 0.92);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.fillStyle = _alpha(color, 0.82 * visual.engine);
  const engineWidth = typeId === 'galleon' || typeId === 'freighter' ? 3.4 : 2.4;
  ctx.fillRect(typeId === 'clipper' ? -11 : -13, -engineWidth, 3, 1.8);
  ctx.fillRect(typeId === 'clipper' ? -11 : -13, engineWidth - 1.8, 3, 1.8);
  ctx.restore();
}

function _drawTypeGlyph(ctx, meta) {
  ctx.save();
  ctx.strokeStyle = 'rgba(5,11,15,0.72)';
  ctx.lineWidth = 1.4;
  ctx.translate(meta.x, meta.y);
  const r = Math.max(3, meta.radius * 0.48);
  if (meta.system.type === 'commercial') {
    _line(ctx, -r, 0, r, 0);
    _line(ctx, 0, -r, 0, r);
  } else if (meta.system.type === 'military') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.closePath();
    ctx.stroke();
  } else if (meta.system.type === 'energy') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.stroke();
    _line(ctx, -r * 1.35, 0, r * 1.35, 0);
  } else if (meta.system.type === 'mining' || meta.system.type === 'industrial') {
    ctx.strokeRect(-r, -r, r * 2, r * 2);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.restore();
}

function _onPointerMove(event) {
  if (!_isActive || !_canvas) return;
  const point = _eventPoint(event);
  const hit = _hitTest(point.x, point.y);
  _applyHover(hit);
}

function _onPointerLeave() {
  _applyHover(null);
}

function _onClick(event) {
  if (!_isActive || !_canvas) return;
  const point = _eventPoint(event);
  const hit = _hitTest(point.x, point.y);

  if (_mapView === 'galaxies') {
    if (hit && hit.type === 'galaxy' && hit.unlocked !== false && window._galaxyClickCallback) {
      window._galaxyClickCallback(hit.id);
    }
    return;
  }

  if (!hit || hit.type !== 'system') {
    if (window._mapBackgroundClickCallback) window._mapBackgroundClickCallback();
    return;
  }

  _selectedPlanetId = hit.id;
  _focusPlanetId = hit.id;
  if (window._mapClickCallback) window._mapClickCallback(hit.id);
  _dirty = true;
}

function _applyHover(hit) {
  const prevPlanet = _hoveredPlanet && _hoveredPlanet.id;
  const prevGalaxy = _hoveredGalaxyId;
  _hoveredPlanet = hit && hit.type === 'system' ? hit : null;
  _hoveredGalaxyId = hit && hit.type === 'galaxy' ? hit.id : null;
  if (_canvas && _canvas.style) {
    _canvas.style.cursor = hit && hit.unlocked !== false ? 'pointer' : (hit ? 'not-allowed' : 'crosshair');
  }

  if (hit && hit.type === 'system' && window._mapHoverCallback) {
    window._mapHoverCallback({ type: 'system', id: hit.id });
  } else if (hit && hit.type === 'galaxy' && window._mapHoverCallback) {
    window._mapHoverCallback({ type: 'galaxy', id: hit.id, name: hit.name, accessState: hit.access });
  } else if ((prevPlanet || prevGalaxy) && window._mapHoverCallback) {
    window._mapHoverCallback(null);
  }

  if (prevPlanet !== (_hoveredPlanet && _hoveredPlanet.id) || prevGalaxy !== _hoveredGalaxyId) {
    _dirty = true;
  }
}

function _refreshHoverFromLastPointer() {
  _hoveredPlanet = null;
  _hoveredGalaxyId = null;
}

function _hitTest(x, y) {
  const targets = _mapView === 'galaxies' ? _galaxyMetadata : _planetMetadata;
  let best = null;
  let bestDistance = Infinity;
  targets.forEach(function (target) {
    const dx = x - target.x;
    const dy = y - target.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = Math.max(16, target.radius * (_mapView === 'galaxies' ? 1.6 : 2.1));
    if (d <= hitRadius && d < bestDistance) {
      best = target;
      bestDistance = d;
    }
  });
  return best;
}

function _eventPoint(event) {
  if (event && Number.isFinite(event.offsetX) && Number.isFinite(event.offsetY)) {
    return { x: event.offsetX, y: event.offsetY };
  }
  const rect = _canvas.getBoundingClientRect ? _canvas.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    x: (event.clientX || 0) - rect.left,
    y: (event.clientY || 0) - rect.top,
  };
}

function _syncFlightPathWithState(state) {
  if (!_flightPath || _flightPath.routeRevision == null) return;
  const activeIndex = state && typeof state.activeShipIndex === 'number' ? state.activeShipIndex : 0;
  const activeShip = state && state.fleet ? state.fleet[activeIndex] : null;
  const currentRevision = activeShip && activeShip.route ? (activeShip.routeRevision || 0) : null;
  if (_flightPath.shipIndex !== activeIndex || currentRevision !== _flightPath.routeRevision) {
    cancelShipFlight();
  }
}

function _completeFlightIfNeeded(time) {
  if (!_flightPath) return;
  if (time - _flightPath.startTime < _flightPath.duration) return;
  const cb = _flightPath.onComplete;
  _flightPath = null;
  _dirty = true;
  if (cb) cb();
}

function _getVisibleSystemPoint(systemId) {
  const meta = _planetMetadata.find(function (item) { return item.id === systemId; });
  if (meta) return { x: meta.x, y: meta.y };
  const sys = findSystem(systemId);
  if (!_lastViewport || !sys || sys.galaxyId !== _currentGalaxyId) return null;
  return _projectNormalized(sys.x || 0.5, sys.y || 0.5, _lastViewport);
}

function _getRouteSceneGeometry(fromId, toId, bend) {
  const visibleFrom = _getVisibleSystemPoint(fromId);
  const visibleTo = _getVisibleSystemPoint(toId);
  const visibilityMode = getRouteVisibilityMode(!!visibleFrom, !!visibleTo);
  if (visibilityMode === 'hidden') return null;

  const from = visibleFrom || _getGalaxyBoundaryPoint(fromId);
  const to = visibleTo || _getGalaxyBoundaryPoint(toId);
  if (!from || !to) return null;
  return {
    from,
    to,
    mid: _routeGeometry(from, to, bend).mid,
    visibilityMode,
  };
}

function _getGalaxyBoundaryPoint(systemId) {
  if (!_lastViewport) return null;
  const system = findSystem(systemId);
  const currentGalaxy = GALAXIES.find(function (galaxy) { return galaxy.id === _currentGalaxyId; });
  const externalGalaxy = system
    ? GALAXIES.find(function (galaxy) { return galaxy.id === system.galaxyId; })
    : null;
  let dx = externalGalaxy && currentGalaxy ? (externalGalaxy.gx || 0.5) - (currentGalaxy.gx || 0.5) : 0;
  let dy = externalGalaxy && currentGalaxy ? (externalGalaxy.gy || 0.5) - (currentGalaxy.gy || 0.5) : 0;

  if (Math.abs(dx) + Math.abs(dy) < 0.001) {
    const angle = (_hash(systemId) % 628) / 100;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  }

  const magnitude = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  dx /= magnitude;
  dy /= magnitude;
  const centerX = (_lastViewport.left + _lastViewport.right) * 0.5;
  const centerY = (_lastViewport.top + _lastViewport.bottom) * 0.5;
  const halfWidth = Math.max(1, _lastViewport.width * 0.5 - 18);
  const halfHeight = Math.max(1, _lastViewport.height * 0.5 - 18);
  const edgeScale = Math.min(
    Math.abs(dx) > 0.001 ? halfWidth / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.001 ? halfHeight / Math.abs(dy) : Infinity
  );
  return { x: centerX + dx * edgeScale, y: centerY + dy * edgeScale };
}

function _routeGeometry(from, to, bend) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const sign = ((Math.round(from.x + to.y) % 2) === 0) ? 1 : -1;
  return {
    mid: {
      x: (from.x + to.x) / 2 + (-dy / dist) * dist * bend * sign,
      y: (from.y + to.y) / 2 + (dx / dist) * dist * bend * sign,
    },
  };
}

function _quadPoint(from, mid, to, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * from.x + 2 * inv * t * mid.x + t * t * to.x,
    y: inv * inv * from.y + 2 * inv * t * mid.y + t * t * to.y,
  };
}

function _buildViewport(width, height, mapView) {
  const narrow = width < 720;
  const left = narrow ? 34 : Math.min(122, Math.max(86, width * 0.085));
  const rightPad = narrow ? 32 : Math.min(300, Math.max(160, width * 0.22));
  const top = narrow ? 72 : 86;
  const bottomPad = narrow ? 88 : 108;
  const right = Math.max(left + 220, width - rightPad);
  const bottom = Math.max(top + 180, height - bottomPad);
  const viewport = {
    left,
    top,
    right: Math.min(width - 18, right),
    bottom: Math.min(height - 28, bottom),
  };
  viewport.width = Math.max(1, viewport.right - viewport.left);
  viewport.height = Math.max(1, viewport.bottom - viewport.top);
  viewport.mode = mapView;
  return viewport;
}

function _projectNormalized(nx, ny, viewport) {
  return {
    x: viewport.left + _clamp(Number(nx) || 0.5, 0.02, 0.98) * viewport.width,
    y: viewport.top + _clamp(Number(ny) || 0.5, 0.02, 0.98) * viewport.height,
  };
}

function _normalizeQualityLevel(level) {
  if (level === 'high' || level === 'medium' || level === 'low' || level === 'auto') return level;
  return 'auto';
}

function _getEffectiveQualityLevel(width, height) {
  if (_qualityLevel !== 'auto') return _qualityLevel;
  if (_resolvedQualityLevel) return _resolvedQualityLevel;
  const pixels = (width || 1280) * (height || 720);
  if ((width || 0) < 720 || pixels < 520000) _resolvedQualityLevel = 'low';
  else if ((width || 0) < 1100 || pixels < 1100000) _resolvedQualityLevel = 'medium';
  else _resolvedQualityLevel = 'high';
  return _resolvedQualityLevel;
}

function _buildStars(width, height, quality) {
  const count = quality === 'high' ? 520 : quality === 'medium' ? 320 : 180;
  const rng = _rng(width * 31 + height * 17 + count);
  const stars = [];
  for (let i = 0; i < count; i++) {
    const warm = rng() > 0.78;
    stars.push({
      x: rng() * width,
      y: rng() * height,
      s: rng() > 0.92 ? 1.8 : 1,
      a: 0.18 + rng() * 0.62,
      r: warm ? 255 : 185 + Math.floor(rng() * 60),
      g: warm ? 214 : 220 + Math.floor(rng() * 30),
      b: warm ? 160 : 255,
    });
  }
  return stars;
}

function _getCanvasDpr() {
  const cssWidth = _canvas && _canvas.clientWidth ? _canvas.clientWidth : 1;
  return _canvas && _canvas.width ? Math.max(1, _canvas.width / cssWidth) : 1;
}

function _fillRadial(ctx, x, y, radius, inner, outer) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function _cornerFrame(ctx, left, top, right, bottom, len) {
  _line(ctx, left, top, left + len, top);
  _line(ctx, left, top, left, top + len);
  _line(ctx, right, top, right - len, top);
  _line(ctx, right, top, right, top + len);
  _line(ctx, left, bottom, left + len, bottom);
  _line(ctx, left, bottom, left, bottom - len);
  _line(ctx, right, bottom, right - len, bottom);
  _line(ctx, right, bottom, right, bottom - len);
}

function _line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function _roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _alpha(hex, alpha) {
  const rgb = _hexToRgb(hex);
  return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
}

function _mix(hexA, hexB, weightB) {
  const a = _hexToRgb(hexA);
  const b = _hexToRgb(hexB);
  const wb = _clamp(weightB, 0, 1);
  const wa = 1 - wb;
  return 'rgb(' +
    Math.round(a.r * wa + b.r * wb) + ',' +
    Math.round(a.g * wa + b.g * wb) + ',' +
    Math.round(a.b * wa + b.b * wb) + ')';
}

function _hexToRgb(hex) {
  let value = String(hex || '#72ddff').replace('#', '').trim();
  if (value.length === 3) {
    value = value.split('').map(function (char) { return char + char; }).join('');
  }
  const parsed = parseInt(value.slice(0, 6), 16);
  if (!Number.isFinite(parsed)) return { r: 114, g: 221, b: 255 };
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function _clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function _hash(text) {
  let h = 2166136261;
  const source = String(text || '');
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _rng(seed) {
  let s = (seed | 0) || 1;
  return function () {
    s = Math.imul(48271, s) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}
