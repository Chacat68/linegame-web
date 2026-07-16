// js/ui/RendererThreeStarmap.js — Three.js 星图渲染器
// 同一套 WebGL2 运行时承载行星局部图与星系总览；Canvas 2D 仅作为兼容回退。

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  QuadraticBezierCurve3,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from 'three';
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPlanetSurfaceData } from './PlanetSurfaceTexture.js';
import * as RouteModel from '../systems/route/RouteSystem.js';
import {
  GALAXIES,
  findSystem,
  getGalaxyAccessState,
  getSystemsByGalaxy,
  isSystemAccessible,
} from '../data/systems.js';

const GALAXY_CAMERA_HOME = new Vector3(0, 112, 192);
const GALAXY_CAMERA_TARGET = new Vector3(0, 0, 0);
const GALAXY_CAMERA_HOME_NARROW = new Vector3(0, 104, 205);
const GALAXY_CAMERA_TARGET_NARROW = new Vector3(0, -48, 0);
const PLANET_CAMERA_HOME = new Vector3(0, 276, 124);
const PLANET_CAMERA_TARGET = new Vector3(0, -4, 0);
const PLANET_CAMERA_HOME_NARROW = new Vector3(0, 350, 166);
const PLANET_CAMERA_TARGET_NARROW = new Vector3(0, -34, 0);
const GALAXY_SPAN_X = 188;
const GALAXY_SPAN_Z = 126;
const PLANET_SPAN_X = 420;
const PLANET_SPAN_Z = 294;
const PLANET_MIN_SEPARATION = 29;
const PLANET_CONNECTION_DISTANCE = 66;
const PLANET_LAYOUT_SCALE_X = PLANET_SPAN_X / 292;
const PLANET_LAYOUT_SCALE_Z = PLANET_SPAN_Z / 204;
const PLANET_LAYOUT_SCALE = (PLANET_LAYOUT_SCALE_X + PLANET_LAYOUT_SCALE_Z) * 0.5;
const PLANET_VISUAL_SCALE = 0.5;

const PLANET_COLORS = {
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

const QUALITY = {
  high: { pixelRatio: 1.5, backgroundStars: 1100, galaxyStars: 96, textureSize: 224, curveSegments: 40, planetSegments: 30 },
  medium: { pixelRatio: 1.25, backgroundStars: 650, galaxyStars: 56, textureSize: 160, curveSegments: 28, planetSegments: 22 },
  low: { pixelRatio: 1, backgroundStars: 320, galaxyStars: 28, textureSize: 96, curveSegments: 18, planetSegments: 16 },
};

let _canvas = null;
let _renderer = null;
let _scene = null;
let _camera = null;
let _controls = null;
let _backgroundRoot = null;
let _planetRoot = null;
let _galaxyRoot = null;
let _raycaster = null;
let _pointer = null;
let _initialized = false;
let _available = false;
let _visible = false;
let _contextLost = false;
let _listenersBound = false;
let _dirty = true;
let _qualityLevel = 'auto';
let _resolvedQualityLevel = null;
let _motionLevel = 'full';
let _secretRoutesVisible = true;
let _stateRef = null;
let _renderKey = '';
let _mapView = 'planets';
let _currentGalaxyId = 'milky_way';
let _hoveredPlanetId = null;
let _hoveredGalaxyId = null;
let _selectedPlanetId = null;
let _focusPlanetId = null;
let _planetEntries = [];
let _planetHitTargets = [];
let _galaxyEntries = [];
let _galaxyHitTargets = [];
let _routeVisuals = [];
let _flightPath = null;
let _flightVisual = null;
let _availabilityHandler = null;
let _pointerDown = null;
let _pointerDragged = false;
let _lastSizeKey = '';
let _cameraFrameMode = null;
let _framedPlanetSystemId = null;
let _framedPlanetGalaxyId = null;
const _planetSurfaceMapCache = new Map();
const _persistentPlanetTextures = new Set();
const _sharedGeometryCache = new Map();
const _persistentGeometries = new Set();
let _sharedHaloTexture = null;
let _sharedStarTexture = null;
const _performanceStats = {
  samples: 0,
  lastFrameAt: 0,
  averageFrameMs: 0,
  averageCpuMs: 0,
  maxCpuMs: 0,
};

export function init() {
  if (_initialized && _renderer && !_contextLost) return true;
  if (typeof document === 'undefined' || !document.getElementById) return false;

  _canvas = document.getElementById('starmap-three-canvas');
  if (!_canvas || typeof _canvas.getContext !== 'function') return false;

  const quality = _getQualitySettings();
  const context = _canvas.getContext('webgl2', {
    alpha: false,
    antialias: quality !== QUALITY.low,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    stencil: false,
  });

  if (!context) {
    _available = false;
    _canvas.style.display = 'none';
    return false;
  }

  try {
    _renderer = new WebGLRenderer({
      canvas: _canvas,
      context: context,
      alpha: false,
      antialias: quality !== QUALITY.low,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    console.warn('[RendererThreeStarmap] WebGL2 initialization failed; using 2D fallback.', error);
    _renderer = null;
    _available = false;
    return false;
  }

  _renderer.outputColorSpace = SRGBColorSpace;
  _renderer.toneMapping = ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.08;
  _renderer.setClearColor(0x02060d, 1);
  _renderer.shadowMap.enabled = false;
  _renderer.sortObjects = true;

  _scene = new Scene();
  _scene.background = new Color(0x02060d);
  _scene.fog = new FogExp2(0x02060d, 0.00105);

  _camera = new PerspectiveCamera(48, 1, 0.1, 1400);
  _camera.position.copy(PLANET_CAMERA_HOME);

  _controls = new OrbitControls(_camera, _canvas);
  _controls.target.copy(PLANET_CAMERA_TARGET);
  _controls.enableDamping = true;
  _controls.dampingFactor = 0.07;
  _controls.enablePan = true;
  _controls.screenSpacePanning = false;
  _controls.minDistance = 76;
  _controls.maxDistance = 640;
  _controls.minPolarAngle = Math.PI * 0.08;
  _controls.maxPolarAngle = Math.PI * 0.47;
  _controls.panSpeed = 0.55;
  _controls.rotateSpeed = 0.42;
  _controls.zoomSpeed = 0.72;
  _controls.update();

  _raycaster = new Raycaster();
  _pointer = new Vector2(2, 2);
  _backgroundRoot = new Group();
  _backgroundRoot.name = 'starmapBackground';
  _planetRoot = new Group();
  _planetRoot.name = 'starmapPlanets';
  _galaxyRoot = new Group();
  _galaxyRoot.name = 'starmapGalaxies';
  _scene.add(_backgroundRoot, _planetRoot, _galaxyRoot);

  const ambient = new AmbientLight(0x9acbed, 1.7);
  const keyLight = new DirectionalLight(0xe2f4ff, 2.8);
  keyLight.position.set(-80, 140, 90);
  const rimLight = new DirectionalLight(0x547dff, 0.9);
  rimLight.position.set(110, 28, -120);
  _scene.add(ambient, keyLight, rimLight);

  _bindEvents();
  _resizeRenderer(true);
  _buildBackground();

  _canvas.dataset.renderer = 'three';
  if (_canvas.setAttribute) _canvas.setAttribute('aria-label', 'Three.js 3D 星图');
  _canvas.style.display = 'none';
  _initialized = true;
  _available = true;
  _contextLost = false;
  _dirty = true;
  return true;
}

export function setAvailabilityHandler(handler) {
  _availabilityHandler = typeof handler === 'function' ? handler : null;
}

export function isAvailable() {
  return !!(_initialized && _available && _renderer && !_contextLost);
}

export function setVisible(visible) {
  _visible = !!visible && isAvailable();
  if (_canvas) _canvas.style.display = _visible ? 'block' : 'none';
  if (_visible) _applyResponsiveCameraFrame(false);
  return _visible;
}

export function toggleView() {
  setVisible(!_visible);
}

export function isActive() {
  return isAvailable() && _visible;
}

export function render(state, mapView, galaxyId) {
  if (!isActive()) return;

  _stateRef = state || _stateRef || {};
  _syncFlightPathWithState(_stateRef);
  const nextMapView = mapView === 'galaxies' ? 'galaxies' : 'planets';
  const nextGalaxyId = galaxyId || _stateRef.viewingGalaxy || _stateRef.currentGalaxy || 'milky_way';
  const modeChanged = nextMapView !== _mapView;
  _mapView = nextMapView;
  _currentGalaxyId = nextGalaxyId;

  if (_planetRoot) _planetRoot.visible = _mapView === 'planets';
  if (_galaxyRoot) _galaxyRoot.visible = _mapView === 'galaxies';
  if (modeChanged) {
    _cameraFrameMode = null;
    if (_mapView === 'planets') _framedPlanetGalaxyId = null;
    _applyResponsiveCameraFrame(true);
  }

  const renderKey = _buildRenderKey(_stateRef, _currentGalaxyId);
  const sizeChanged = _resizeRenderer(false);
  if (_dirty || sizeChanged || renderKey !== _renderKey) {
    if (_mapView === 'galaxies') _buildGalaxyScene(_stateRef);
    else _buildPlanetScene(_stateRef, _currentGalaxyId);
    _renderKey = renderKey;
    _dirty = false;
  }

  const now = _now();
  _animateScene(now);
  _completeFlightIfNeeded(now);
  _controls.update();
  _renderer.render(_scene, _camera);
  _recordPerformance(now, _now());
}

export function setQuality(level) {
  const next = _normalizeQuality(level);
  if (_qualityLevel === next) return;
  _qualityLevel = next;
  _resolvedQualityLevel = null;
  _lastSizeKey = '';
  _dirty = true;
  _clearPlanetSurfaceMapCache();
  if (_renderer) {
    _resizeRenderer(true);
    _buildBackground();
  }
}

export function setMotionLevel(level) {
  _motionLevel = level === 'off' || level === 'reduced' ? level : 'full';
}

export function focusPlanet(planetId) {
  if (!planetId || !findSystem(planetId)) return false;
  _focusPlanetId = planetId;
  _dirty = true;
  _focusCameraOnPlanet(planetId);
  return true;
}

export function selectPlanet(planetId, options) {
  if (!planetId || !findSystem(planetId)) return false;
  _selectedPlanetId = planetId;
  if (!options || options.focus !== false) _focusPlanetId = planetId;
  _dirty = true;
  if (!options || options.focus !== false) _focusCameraOnPlanet(planetId);
  return true;
}

export function clearSelection() {
  _selectedPlanetId = null;
  _focusPlanetId = null;
  _dirty = true;
}

export function resetCamera() {
  if (!_camera || !_controls) return;
  _focusPlanetId = null;
  const current = _planetEntries.find(function (entry) { return entry.current; });
  if (_mapView === 'planets' && current) _framePlanetNeighborhood(current.group.position);
  else _applyResponsiveCameraFrame(true);
}

export function flyShipTo(fromId, toId, onComplete, shipTypeId, flightMeta) {
  if (!fromId || !toId || fromId === toId || !findSystem(fromId) || !findSystem(toId)) {
    cancelShipFlight();
    if (onComplete) onComplete();
    return;
  }

  const fromSystem = findSystem(fromId);
  const toSystem = findSystem(toId);
  const dx = (fromSystem.x || 0) - (toSystem.x || 0);
  const dy = (fromSystem.y || 0) - (toSystem.y || 0);
  const distance = Math.sqrt(dx * dx + dy * dy);
  const routeDescriptor = RouteModel.createFlightRouteDescriptor(fromId, toId, {
    shipIndex: flightMeta && typeof flightMeta.shipIndex === 'number' ? flightMeta.shipIndex : 0,
    shipTypeId: shipTypeId || 'shuttle',
    routeRevision: flightMeta && flightMeta.routeRevision != null ? flightMeta.routeRevision : null,
  });
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  _flightPath = {
    fromId,
    toId,
    shipTypeId: shipTypeId || 'shuttle',
    shipIndex: routeDescriptor.shipIndex,
    routeRevision: routeDescriptor.routeRevision,
    startTime: now,
    duration: Math.min(8200, Math.max(2800, distance * 16500)),
    onComplete: onComplete || null,
  };
  _dirty = true;
}

export function isShipFlying() {
  return !!_flightPath;
}

export function cancelShipFlight() {
  _flightPath = null;
  _flightVisual = null;
  _dirty = true;
}

export function getSystemAtPoint(x, y) {
  if (_mapView !== 'planets' || !_canvas) return null;
  const rect = _canvas.getBoundingClientRect();
  const hit = _pickAtClientPoint(rect.left + (Number(x) || 0), rect.top + (Number(y) || 0), _planetHitTargets);
  return hit && hit.userData ? hit.userData.systemId || null : null;
}

export function invalidateScene() {
  _dirty = true;
}

export function setSecretRoutesVisible(visible) {
  _secretRoutesVisible = !!visible;
  _dirty = true;
}

export function isSecretRoutesVisible() {
  return _secretRoutesVisible;
}

export function getPlanetScreenPosition(planetId) {
  if (!_camera || !_canvas) return null;
  const entry = _planetEntries.find(function (item) { return item.id === planetId; });
  if (!entry) return null;
  return _projectWorldToCanvas(entry.group.getWorldPosition(new Vector3()));
}

export function getGalaxyScreenPosition(galaxyId) {
  if (!_camera || !_canvas) return null;
  const entry = _galaxyEntries.find(function (item) { return item.id === galaxyId; });
  if (!entry) return null;
  const projected = entry.group.getWorldPosition(new Vector3()).project(_camera);
  const rect = _canvas.getBoundingClientRect();
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

export function resetRuntimeState(currentSystemId) {
  _hoveredPlanetId = null;
  _hoveredGalaxyId = null;
  _selectedPlanetId = null;
  _focusPlanetId = null;
  if (_stateRef && currentSystemId) _stateRef.currentSystem = currentSystemId;
  _flightPath = null;
  _flightVisual = null;
  _renderKey = '';
  _dirty = true;
  resetCamera();
}

export function getRendererInfo() {
  if (!_renderer) return null;
  return {
    renderer: 'three',
    quality: _getEffectiveQualityLevel(),
    calls: _renderer.info.render.calls,
    triangles: _renderer.info.render.triangles,
    points: _renderer.info.render.points,
    geometries: _renderer.info.memory.geometries,
    textures: _renderer.info.memory.textures,
    fps: _performanceStats.averageFrameMs > 0 ? 1000 / _performanceStats.averageFrameMs : 0,
    frameMs: _performanceStats.averageFrameMs,
    cpuMs: _performanceStats.averageCpuMs,
    maxCpuMs: _performanceStats.maxCpuMs,
  };
}

function _bindEvents() {
  if (_listenersBound || !_canvas) return;
  _canvas.addEventListener('pointerdown', _onPointerDown);
  _canvas.addEventListener('pointermove', _onPointerMove);
  _canvas.addEventListener('pointerup', _onPointerUp);
  _canvas.addEventListener('pointerleave', _onPointerLeave);
  _canvas.addEventListener('click', _onClick);
  _canvas.addEventListener('webglcontextlost', _onContextLost, false);
  _canvas.addEventListener('webglcontextrestored', _onContextRestored, false);
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', _onResize);
  }
  _listenersBound = true;
}

function _onResize() {
  if (_qualityLevel === 'auto') _resolvedQualityLevel = null;
  _lastSizeKey = '';
  _dirty = true;
}

function _onContextLost(event) {
  if (event && event.preventDefault) event.preventDefault();
  _contextLost = true;
  _available = false;
  _visible = false;
  if (_canvas) _canvas.style.display = 'none';
  if (_availabilityHandler) _availabilityHandler(false);
}

function _onContextRestored() {
  _contextLost = false;
  _available = !!_renderer;
  _dirty = true;
  _lastSizeKey = '';
  if (_availabilityHandler) _availabilityHandler(_available);
}

function _onPointerDown(event) {
  _pointerDown = { x: event.clientX || 0, y: event.clientY || 0 };
  _pointerDragged = false;
}

function _onPointerUp() {
  _pointerDown = null;
}

function _onPointerMove(event) {
  if (!isActive()) return;
  if (_pointerDown) {
    const dx = (event.clientX || 0) - _pointerDown.x;
    const dy = (event.clientY || 0) - _pointerDown.y;
    if (dx * dx + dy * dy > 36) _pointerDragged = true;
  }

  const hit = _pickTarget(event);
  if (_mapView === 'galaxies') {
    _setHoveredGalaxy(hit ? hit.userData.galaxyId : null);
  } else {
    _setHoveredPlanet(hit ? hit.userData.systemId : null);
  }
  if (_canvas) {
    _canvas.style.cursor = hit
      ? (hit.userData.unlocked === false ? 'not-allowed' : 'pointer')
      : 'grab';
  }
}

function _onPointerLeave() {
  _pointerDown = null;
  _pointerDragged = false;
  _setHoveredPlanet(null);
  _setHoveredGalaxy(null);
  if (_canvas) _canvas.style.cursor = 'default';
}

function _onClick(event) {
  if (!isActive()) return;
  if (_pointerDragged) {
    _pointerDragged = false;
    return;
  }
  const hit = _pickTarget(event);
  if (!hit) {
    if (typeof window !== 'undefined' && window._mapBackgroundClickCallback) {
      window._mapBackgroundClickCallback();
    }
    return;
  }
  if (_mapView === 'galaxies') {
    if (hit.userData.unlocked === false) return;
    if (typeof window !== 'undefined' && window._galaxyClickCallback) {
      window._galaxyClickCallback(hit.userData.galaxyId);
    }
    return;
  }

  const systemId = hit.userData.systemId;
  if (!systemId) return;
  _selectedPlanetId = systemId;
  _dirty = true;
  if (typeof window !== 'undefined' && window._mapClickCallback) {
    window._mapClickCallback(systemId);
  }
}

function _pickTarget(event) {
  const targets = _mapView === 'galaxies' ? _galaxyHitTargets : _planetHitTargets;
  return _pickAtClientPoint(event.clientX || 0, event.clientY || 0, targets);
}

function _pickAtClientPoint(clientX, clientY, targets) {
  if (!_raycaster || !_camera || !_canvas || !targets || targets.length === 0) return null;
  const rect = _canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, _camera);
  const hits = _raycaster.intersectObjects(targets, false);
  return hits.length > 0 ? hits[0].object : null;
}

function _setHoveredPlanet(planetId) {
  if (_hoveredPlanetId === planetId) return;
  _hoveredPlanetId = planetId || null;
  if (typeof window === 'undefined' || !window._mapHoverCallback) return;
  if (!_hoveredPlanetId) {
    window._mapHoverCallback(null);
    return;
  }
  window._mapHoverCallback({ type: 'system', id: _hoveredPlanetId });
}

function _setHoveredGalaxy(galaxyId) {
  if (_hoveredGalaxyId === galaxyId) return;
  _hoveredGalaxyId = galaxyId || null;
  if (typeof window === 'undefined' || !window._mapHoverCallback) return;
  if (!_hoveredGalaxyId) {
    window._mapHoverCallback(null);
    return;
  }
  const entry = _galaxyEntries.find(function (item) { return item.id === _hoveredGalaxyId; });
  if (entry) {
    window._mapHoverCallback(Object.assign({ type: 'galaxy', id: entry.id }, entry.data));
  }
}

function _buildRenderKey(state, galaxyId) {
  const researched = Array.isArray(state.researchedTechs) ? state.researchedTechs.slice().sort().join(',') : '';
  const fleet = Array.isArray(state.fleet)
    ? state.fleet.map(function (ship) {
      const route = ship && ship.route ? ship.route : null;
      return [
        ship && ship.location,
        ship && ship.routeRevision,
        route && route.status,
        route && route.buySystemId,
        route && route.sellSystemId,
      ].join(':');
    }).join(';')
    : '';
  return [
    _mapView,
    galaxyId || state.viewingGalaxy || state.currentGalaxy || 'milky_way',
    state.currentGalaxy || 'milky_way',
    state.currentSystem || '',
    state.playerLevel || 1,
    researched,
    fleet,
    _selectedPlanetId || '',
    _focusPlanetId || '',
    _secretRoutesVisible ? 'routes' : 'no-routes',
    _flightPath ? [_flightPath.fromId, _flightPath.toId, _flightPath.startTime].join(':') : '',
    _getEffectiveQualityLevel(),
  ].join('|');
}

function _buildPlanetScene(state, galaxyId) {
  if (!_planetRoot) return;
  _clearGroup(_planetRoot);
  _planetEntries = [];
  _planetHitTargets = [];
  _routeVisuals = [];
  _flightVisual = null;

  const systems = getSystemsByGalaxy(galaxyId);
  const positions = _createPlanetPositions(systems);

  _buildPlanetEnvironment(state);
  _buildPlanetConnections(systems, positions, state);
  _buildPlanetAmbientHalos(systems, positions, state);
  _buildOperationalRoutes(state, positions);

  const qualityLevel = _getEffectiveQualityLevel();
  systems.forEach(function (system, index) {
    const unlocked = isSystemAccessible(system.id, state.playerLevel || 1, state.researchedTechs || []);
    const current = system.id === state.currentSystem;
    const selected = system.id === _selectedPlanetId;
    const focused = system.id === _focusPlanetId;
    const baseColor = new Color(PLANET_COLORS[system.type] || system.color || '#72ddff');
    const displayColor = unlocked ? baseColor : baseColor.clone().lerp(new Color(0x52616c), 0.58);
    const radius = _getPlanetRadius(system);
    const richVisuals = qualityLevel === 'high' || current || selected || focused;
    const group = new Group();
    group.name = 'system_' + system.id;
    group.position.copy(positions.get(system.id));
    group.userData.baseY = group.position.y;
    group.userData.phase = (_hash(system.id) % 628) / 100;

    const haloMaterial = new SpriteMaterial({
      map: _getSharedHaloTexture(),
      color: displayColor,
      transparent: true,
      opacity: current ? 0.46 : (selected || focused ? 0.18 : 0.28),
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const halo = new Sprite(haloMaterial);
    const haloScale = radius * (current ? 6.4 : (selected || focused ? 4.8 : 8.4));
    halo.scale.set(haloScale, haloScale, 1);
    halo.renderOrder = 1;
    halo.visible = current || selected || focused;
    group.add(halo);

    const surfaceMaps = _createPlanetSurfaceMaps(system, baseColor, richVisuals);
    const bodyMaterial = new MeshStandardMaterial({
      color: unlocked ? 0xffffff : 0x71808a,
      map: surfaceMaps.colorMap,
      bumpMap: surfaceMaps.bumpMap,
      bumpScale: surfaceMaps.gaseous ? radius * 0.018 : radius * 0.052,
      emissive: surfaceMaps.emissiveMap
        ? displayColor.clone().lerp(new Color(0xbfefff), 0.32)
        : displayColor.clone().multiplyScalar(unlocked ? 0.34 : 0.15),
      emissiveMap: surfaceMaps.emissiveMap,
      emissiveIntensity: unlocked
        ? (surfaceMaps.emissiveMap ? (current ? 3.1 : 2.25) : (current ? 1.85 : 1.18))
        : 0.22,
      metalness: system.type === 'technology' || system.type === 'industrial' ? 0.44 : 0.14,
      roughness: system.type === 'energy' ? 0.32 : 0.68,
      transparent: !unlocked,
      opacity: unlocked ? 1 : 0.72,
    });
    const body = new Mesh(_getSharedPlanetSphereGeometry(), bodyMaterial);
    body.scale.setScalar(radius);
    body.rotation.z = ((_hash(system.id) % 21) - 10) * 0.015;
    body.rotation.y = (_hash(system.id + ':surface-offset') % 628) / 100;
    body.renderOrder = 4;
    body.userData = { systemId: system.id, unlocked };
    group.add(body);
    _planetHitTargets.push(body);

    let cloudShell = null;
    let cloudMaterial = null;
    if (richVisuals && surfaceMaps.cloudMap && (unlocked || current)) {
      cloudMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        map: surfaceMaps.cloudMap,
        transparent: true,
        opacity: surfaceMaps.gaseous ? 0.26 : (current ? 0.68 : 0.5),
        alphaTest: 0.025,
        depthWrite: false,
        metalness: 0,
        roughness: 0.86,
      });
      cloudShell = new Mesh(_getSharedPlanetSphereGeometry(), cloudMaterial);
      cloudShell.scale.setScalar(radius * 1.026);
      cloudShell.rotation.y = (_hash(system.id + ':cloud') % 628) / 100;
      cloudShell.rotation.z = body.rotation.z;
      cloudShell.renderOrder = 5;
      group.add(cloudShell);
    }

    let atmosphereMaterial = null;
    if (richVisuals && (unlocked || current)) {
      atmosphereMaterial = new MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: current ? 0.2 : 0.1,
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const atmosphere = new Mesh(_getSharedPlanetSphereGeometry(), atmosphereMaterial);
      atmosphere.scale.setScalar(radius * 1.28);
      group.add(atmosphere);
    }

    let ring = null;
    let ringMaterial = null;
    if (current || selected || focused || (qualityLevel === 'high' && unlocked)) {
      ringMaterial = new MeshBasicMaterial({
        color: current ? 0xffe9a8 : displayColor,
        transparent: true,
        opacity: current ? 0.62 : (selected || focused ? 0.26 : 0.2),
        side: DoubleSide,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      ring = new Mesh(_getSharedGeometry(
        current ? 'planet-marker-ring:current' : 'planet-marker-ring:standard',
        function () { return new RingGeometry(current ? 1.5 : 1.44, current ? 1.58 : 1.5, 48); }
      ), ringMaterial);
      ring.scale.setScalar(radius);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 5;
      group.add(ring);
    }

    let debrisRing = null;
    const hasDebrisRing = qualityLevel === 'high' && unlocked && (
      system.type === 'mining'
      || system.type === 'special'
      || (system.type === 'energy' && _hash(system.id) % 3 === 0)
    );
    if (hasDebrisRing) {
      const debrisMaterial = new MeshBasicMaterial({
        color: displayColor.clone().lerp(new Color(0xffe1ac), 0.35),
        transparent: true,
        opacity: system.type === 'special' ? 0.34 : 0.24,
        side: DoubleSide,
        depthWrite: false,
      });
      debrisRing = new Mesh(_getSharedGeometry(
        'planet-debris-ring',
        function () { return new RingGeometry(1.34, 1.76, 72, 3); }
      ), debrisMaterial);
      debrisRing.scale.setScalar(radius);
      debrisRing.rotation.set(Math.PI * 0.62, 0.16, ((_hash(system.id) % 36) - 18) * 0.018);
      debrisRing.renderOrder = 4;
      group.add(debrisRing);
    }

    if (qualityLevel === 'high' && unlocked && (system.type === 'energy' || system.type === 'commercial' || system.type === 'special')) {
      const orbitalMaterial = new MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: unlocked ? 0.3 : 0.1,
        side: DoubleSide,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const orbital = new Mesh(_getSharedGeometry(
        'planet-orbital-ring',
        function () { return new RingGeometry(1.24, 1.34, 44); }
      ), orbitalMaterial);
      orbital.scale.setScalar(radius);
      orbital.rotation.set(Math.PI * 0.58, 0.18, ((_hash(system.id) % 30) - 15) * 0.02);
      group.add(orbital);
    }

    let moonPivot = null;
    if (current || selected || focused || (qualityLevel === 'high' && _hash(system.id) % 7 === 0)) {
      moonPivot = new Group();
      moonPivot.rotation.x = 0.26 + (_hash(system.id) % 17) * 0.018;
      const moonMaterial = new MeshStandardMaterial({
        color: unlocked ? 0xc6dce8 : 0x74838d,
        emissive: displayColor,
        emissiveIntensity: unlocked ? 0.42 : 0.16,
        metalness: 0.08,
        roughness: 0.86,
      });
      const moon = new Mesh(_getSharedGeometry(
        'planet-moon',
        function () { return new SphereGeometry(1, 8, 6); }
      ), moonMaterial);
      moon.scale.setScalar(radius * 0.22);
      moon.position.x = radius * (2.15 + (_hash(system.id) % 5) * 0.12);
      moonPivot.add(moon);
      group.add(moonPivot);
    }

    const labelPriority = current || unlocked || _hash(system.id) % 4 === 0;
    const shouldCreateLabel = qualityLevel === 'high' || labelPriority || selected || focused;
    const label = shouldCreateLabel
      ? _createPlanetLabelSprite(system, displayColor, unlocked, current)
      : null;
    if (label) {
      label.position.set(0, radius * 2.25 + 1.2, 0);
      label.renderOrder = 10;
      group.add(label);
    }

    _planetEntries.push({
      id: system.id,
      system,
      unlocked,
      current,
      group,
      body,
      bodyMaterial,
      cloudShell,
      cloudMaterial,
      atmosphereMaterial,
      halo,
      haloMaterial,
      ring,
      ringMaterial,
      debrisRing,
      moonPivot,
      label,
      labelPriority,
      phase: index * 0.41,
    });
    _planetRoot.add(group);
  });

  if (_focusPlanetId) {
    _focusCameraOnPlanet(_focusPlanetId);
  } else if (
    state.currentSystem
    && (_framedPlanetSystemId !== state.currentSystem || _framedPlanetGalaxyId !== galaxyId)
  ) {
    const currentPosition = positions.get(state.currentSystem);
    if (currentPosition) _framePlanetNeighborhood(currentPosition);
    _framedPlanetSystemId = state.currentSystem;
    _framedPlanetGalaxyId = galaxyId;
  }
}

function _buildPlanetEnvironment() {
  const qualityLevel = _getEffectiveQualityLevel();
  const rng = _createRng(87211);
  const dustCount = qualityLevel === 'low' ? 90 : (qualityLevel === 'high' ? 260 : 170);
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  for (let index = 0; index < dustCount; index += 1) {
    dustPositions[index * 3] = (rng() - 0.5) * PLANET_SPAN_X * 1.18;
    dustPositions[index * 3 + 1] = -10 + rng() * 25;
    dustPositions[index * 3 + 2] = (rng() - 0.5) * PLANET_SPAN_Z * 1.18;
    const warm = rng() > 0.78;
    dustColors[index * 3] = warm ? 1 : 0.35 + rng() * 0.3;
    dustColors[index * 3 + 1] = warm ? 0.62 : 0.68 + rng() * 0.24;
    dustColors[index * 3 + 2] = warm ? 0.32 : 0.88 + rng() * 0.12;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('color', new BufferAttribute(dustColors, 3));
  const dustMaterial = new PointsMaterial({
    map: _getSharedStarTexture(),
    size: qualityLevel === 'low' ? 1.05 : 1.34,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.58,
    alphaTest: 0.015,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const dust = new Points(dustGeometry, dustMaterial);
  dust.position.y = -2;
  _planetRoot.add(dust);

  const zoneSpecs = [
    { x: -92, z: -45, radius: 42, color: 0x267ca0 },
    { x: 18, z: 8, radius: 50, color: 0x4b3d9b },
    { x: 105, z: 50, radius: 38, color: 0x8a5936 },
  ].slice(0, qualityLevel === 'high' ? 3 : (qualityLevel === 'medium' ? 2 : 1)).map(function (zone) {
    return Object.assign({}, zone, {
      x: zone.x * PLANET_LAYOUT_SCALE_X,
      z: zone.z * PLANET_LAYOUT_SCALE_Z,
      radius: zone.radius * PLANET_LAYOUT_SCALE,
    });
  });
  zoneSpecs.forEach(function (zone, index) {
    const material = new MeshBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: index === 1 ? 0.17 : 0.12,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(new RingGeometry(zone.radius - 0.34, zone.radius, 96), material);
    ring.position.set(zone.x, -8 - index, zone.z);
    ring.rotation.x = -Math.PI / 2;
    _planetRoot.add(ring);
  });

  const nebulae = (qualityLevel !== 'high'
    ? [
      { x: -58, y: -15, z: 30, color: '#184e77', scale: 76 },
      { x: 86, y: -18, z: -42, color: '#5f285f', scale: 68 },
    ]
    : [
      { x: -96, y: -18, z: 48, color: '#164e70', scale: 96 },
      { x: 15, y: -22, z: -62, color: '#4b286f', scale: 88 },
      { x: 105, y: -17, z: 42, color: '#6f3e26', scale: 78 },
      { x: 22, y: -24, z: 66, color: '#165a54', scale: 72 },
    ]).map(function (spec) {
      return Object.assign({}, spec, {
        x: spec.x * PLANET_LAYOUT_SCALE_X,
        z: spec.z * PLANET_LAYOUT_SCALE_Z,
        scale: spec.scale * PLANET_LAYOUT_SCALE,
      });
    });
  nebulae.forEach(function (spec, index) {
    const material = new SpriteMaterial({
      map: _createNebulaTexture(spec.color, index + 11),
      color: 0xffffff,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const cloud = new Sprite(material);
    cloud.position.set(spec.x, spec.y, spec.z);
    cloud.scale.set(spec.scale * 1.45, spec.scale, 1);
    cloud.renderOrder = -2;
    _planetRoot.add(cloud);
  });
}

function _buildPlanetAmbientHalos(systems, positions, state) {
  if (!systems.length) return;
  const qualityLevel = _getEffectiveQualityLevel();
  const haloPositions = new Float32Array(systems.length * 3);
  const haloColors = new Float32Array(systems.length * 3);
  systems.forEach(function (system, index) {
    const position = positions.get(system.id);
    const unlocked = isSystemAccessible(system.id, state.playerLevel || 1, state.researchedTechs || []);
    const baseColor = new Color(PLANET_COLORS[system.type] || system.color || '#72ddff');
    const color = unlocked ? baseColor : baseColor.clone().lerp(new Color(0x52616c), 0.68);
    haloPositions[index * 3] = position.x;
    haloPositions[index * 3 + 1] = position.y;
    haloPositions[index * 3 + 2] = position.z;
    haloColors[index * 3] = color.r;
    haloColors[index * 3 + 1] = color.g;
    haloColors[index * 3 + 2] = color.b;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(haloPositions, 3));
  geometry.setAttribute('color', new BufferAttribute(haloColors, 3));
  const material = new PointsMaterial({
    map: _getSharedHaloTexture(),
    size: qualityLevel === 'high' ? 34 : (qualityLevel === 'medium' ? 28 : 22),
    sizeAttenuation: true,
    transparent: true,
    opacity: qualityLevel === 'low' ? 0.34 : 0.46,
    alphaTest: 0.02,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const halos = new Points(geometry, material);
  halos.name = 'planetAmbientHalos';
  halos.renderOrder = 1;
  _planetRoot.add(halos);
}

function _buildPlanetConnections(systems, positions, state) {
  const edges = new Set();
  const activePoints = [];
  const inactivePoints = [];
  systems.forEach(function (system) {
    const source = positions.get(system.id);
    const nearest = systems
      .filter(function (candidate) { return candidate.id !== system.id; })
      .map(function (candidate) {
        const target = positions.get(candidate.id);
        const dx = source.x - target.x;
        const dz = source.z - target.z;
        return { candidate, distance: Math.sqrt(dx * dx + dz * dz) };
      })
      .filter(function (entry) { return entry.distance < PLANET_CONNECTION_DISTANCE; })
      .sort(function (a, b) { return a.distance - b.distance; })
      .slice(0, 2);

    nearest.forEach(function (entry) {
      const key = [system.id, entry.candidate.id].sort().join('|');
      if (edges.has(key)) return;
      edges.add(key);
      const from = positions.get(system.id);
      const to = positions.get(entry.candidate.id);
      const active = system.id === state.currentSystem || entry.candidate.id === state.currentSystem;
      const bucket = active ? activePoints : inactivePoints;
      bucket.push(from.clone().add(new Vector3(0, 0.22, 0)));
      bucket.push(to.clone().add(new Vector3(0, 0.22, 0)));
    });
  });

  [
    { points: inactivePoints, color: 0x315f78, opacity: 0.28 },
    { points: activePoints, color: 0x67dcff, opacity: 0.66 },
  ].forEach(function (layer) {
    if (!layer.points.length) return;
    const geometry = new BufferGeometry().setFromPoints(layer.points);
    const material = new LineBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const lines = new LineSegments(geometry, material);
    lines.renderOrder = 0;
    _planetRoot.add(lines);
  });
}

function _buildOperationalRoutes(state, positions) {
  if (_secretRoutesVisible) {
    RouteModel.getSecretRouteDescriptors(state).forEach(function (route, index) {
      _createRouteVisual(route.startSystemId, route.endSystemId, positions, '#8bd8ff', {
        opacity: 0.56,
        bend: 7 + index * 0.5,
        phase: index * 0.23,
      });
    });
  }

  const activeIndex = state && typeof state.activeShipIndex === 'number' ? state.activeShipIndex : 0;
  RouteModel.getFleetRouteDescriptors(state, {
    skipShipIndex: _flightPath ? activeIndex : null,
  }).forEach(function (route) {
    _createRouteVisual(route.startSystemId, route.endSystemId, positions, route.shipIndex === activeIndex ? '#72ddff' : '#ffbf66', {
      opacity: route.shipIndex === activeIndex ? 0.76 : 0.48,
      bend: 8,
      moving: route.isTraveling,
      shipTypeId: route.shipTypeId,
      phase: (route.shipIndex || 0) * 0.19,
    });
  });

  if (_flightPath) {
    _flightVisual = _createRouteVisual(_flightPath.fromId, _flightPath.toId, positions, '#9cf4ff', {
      opacity: 0.96,
      bend: 11,
      moving: true,
      shipTypeId: _flightPath.shipTypeId,
      activeFlight: true,
    });
  }
}

function _createRouteVisual(fromId, toId, positions, colorHex, options) {
  const from = positions.get(fromId);
  const to = positions.get(toId);
  if (!from || !to || fromId === toId) return null;
  const mid = from.clone().lerp(to, 0.5);
  mid.y += options && options.bend ? options.bend : 7;
  const curve = new QuadraticBezierCurve3(from, mid, to);
  const geometry = new BufferGeometry().setFromPoints(curve.getPoints(_getQualitySettings().curveSegments));
  const material = new LineBasicMaterial({
    color: new Color(colorHex),
    transparent: true,
    opacity: options && options.opacity != null ? options.opacity : 0.6,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const line = new Line(geometry, material);
  line.renderOrder = 3;
  _planetRoot.add(line);

  let ship = null;
  if (options && options.moving) {
    ship = _createShipMarker(options.shipTypeId || 'shuttle', colorHex);
    ship.position.copy(from);
    _planetRoot.add(ship);
  }

  const visual = {
    curve,
    line,
    material,
    ship,
    phase: options && options.phase ? options.phase : 0,
    activeFlight: !!(options && options.activeFlight),
    positionScratch: new Vector3(),
    lookAtScratch: new Vector3(),
  };
  _routeVisuals.push(visual);
  return visual;
}

function _createShipMarker(shipTypeId, colorHex) {
  const group = new Group();
  const color = new Color(SHIP_ACCENTS[shipTypeId] || colorHex || '#72ddff');
  const bodyMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const body = new Mesh(new ConeGeometry(0.82, shipTypeId === 'freighter' ? 3.8 : 3.1, 6), bodyMaterial);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const engineMaterial = new SpriteMaterial({
    map: _getSharedHaloTexture(),
    color,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const engine = new Sprite(engineMaterial);
  engine.scale.set(4.8, 4.8, 1);
  engine.position.z = 1.3;
  group.add(engine);
  group.scale.setScalar(shipTypeId === 'galleon' ? 1.35 : 1);
  group.renderOrder = 8;
  return group;
}

function _createPlanetLabelSprite(system, color, unlocked, current) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 88;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#' + color.getHexString();
  ctx.shadowBlur = current ? 16 : 9;
  ctx.fillStyle = unlocked ? (current ? '#fff0b5' : '#dff7ff') : '#7d8b95';
  ctx.font = current ? '700 28px system-ui, sans-serif' : '650 25px system-ui, sans-serif';
  ctx.fillText(system.name, canvas.width / 2, 31);
  ctx.shadowBlur = 5;
  ctx.fillStyle = unlocked ? 'rgba(157,218,239,0.76)' : 'rgba(130,145,155,0.58)';
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.fillText((system.typeLabel || '航点').toUpperCase(), canvas.width / 2, 63);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: unlocked ? 1 : 0.56,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(30, 6.9, 1);
  return sprite;
}

function _createPlanetSurfaceMaps(system, color, includeDetail) {
  const qualityLevel = _getEffectiveQualityLevel();
  const detailed = !!includeDetail && qualityLevel !== 'low';
  const cacheKey = [qualityLevel, system.type || 'special', color.getHexString(), detailed ? 'detail' : 'base'].join(':');
  if (_planetSurfaceMapCache.has(cacheKey)) return _planetSurfaceMapCache.get(cacheKey);
  const surface = createPlanetSurfaceData(
    { id: 'surface-family:' + (system.type || 'special'), type: system.type || 'special' },
    '#' + color.getHexString(),
    true,
    qualityLevel
  );
  const maps = {
    colorMap: _createPixelTexture(surface.albedo, surface.width, surface.height, true),
    bumpMap: detailed ? _createPixelTexture(surface.bump, surface.width, surface.height, false) : null,
    cloudMap: detailed && surface.hasClouds
      ? _createPixelTexture(surface.clouds, surface.width, surface.height, true)
      : null,
    emissiveMap: detailed && surface.hasLights && surface.emissive
      ? _createPixelTexture(surface.emissive, surface.width, surface.height, true)
      : null,
    gaseous: surface.gaseous,
  };
  [maps.colorMap, maps.bumpMap, maps.cloudMap, maps.emissiveMap].forEach(function (texture) {
    if (texture) _persistentPlanetTextures.add(texture);
  });
  _planetSurfaceMapCache.set(cacheKey, maps);
  return maps;
}

function _clearPlanetSurfaceMapCache() {
  _planetSurfaceMapCache.forEach(function (maps) {
    [maps.colorMap, maps.bumpMap, maps.cloudMap, maps.emissiveMap].forEach(function (texture) {
      if (!texture) return;
      _persistentPlanetTextures.delete(texture);
      texture.dispose();
    });
  });
  _planetSurfaceMapCache.clear();
}

function _createPixelTexture(pixels, width, height, colorManaged) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  const texture = new CanvasTexture(canvas);
  if (colorManaged) texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  const qualityLevel = _getEffectiveQualityLevel();
  const anisotropyLimit = qualityLevel === 'high' ? 8 : (qualityLevel === 'medium' ? 4 : 2);
  texture.anisotropy = _renderer && _renderer.capabilities
    ? Math.min(anisotropyLimit, _renderer.capabilities.getMaxAnisotropy())
    : 1;
  texture.needsUpdate = true;
  return texture;
}

function _createNebulaTexture(colorHex, seed) {
  const size = _getEffectiveQualityLevel() === 'low' ? 96 : 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const color = new Color(colorHex);
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  const rng = _createRng(seed * 7193);
  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < 18; index += 1) {
    const x = size * (0.25 + rng() * 0.5);
    const y = size * (0.24 + rng() * 0.52);
    const radius = size * (0.12 + rng() * 0.22);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(' + red + ',' + green + ',' + blue + ',' + (0.16 + rng() * 0.12) + ')');
    gradient.addColorStop(0.55, 'rgba(' + red + ',' + green + ',' + blue + ',0.075)');
    gradient.addColorStop(1, 'rgba(' + red + ',' + green + ',' + blue + ',0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function _getSystemNormalizedPosition(system) {
  return {
    x: system && system.position ? system.position.x : (system && system.x != null ? system.x : 0.5),
    y: system && system.position ? system.position.y : (system && system.y != null ? system.y : 0.5),
  };
}

function _planetPosition(system) {
  const normalized = _getSystemNormalizedPosition(system);
  return new Vector3(
    (normalized.x - 0.5) * PLANET_SPAN_X,
    Math.sin(normalized.x * Math.PI * 2) * 4.8
      + Math.cos(normalized.y * Math.PI * 2) * 3.2
      + ((_hash(system.id) % 7) - 3) * 0.8,
    (normalized.y - 0.5) * PLANET_SPAN_Z
  );
}

function _createPlanetPositions(systems) {
  const positions = new Map();
  systems.forEach(function (system) {
    positions.set(system.id, _planetPosition(system));
  });

  const limitX = PLANET_SPAN_X * 0.5;
  const limitZ = PLANET_SPAN_Z * 0.5;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    for (let leftIndex = 0; leftIndex < systems.length; leftIndex += 1) {
      const left = positions.get(systems[leftIndex].id);
      for (let rightIndex = leftIndex + 1; rightIndex < systems.length; rightIndex += 1) {
        const right = positions.get(systems[rightIndex].id);
        let dx = right.x - left.x;
        let dz = right.z - left.z;
        let distance = Math.sqrt(dx * dx + dz * dz);
        if (distance >= PLANET_MIN_SEPARATION) continue;
        if (distance < 0.001) {
          const angle = (_hash(systems[leftIndex].id + systems[rightIndex].id) % 628) / 100;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          distance = 1;
        }
        const push = (PLANET_MIN_SEPARATION - distance) * 0.52;
        const nx = dx / distance;
        const nz = dz / distance;
        left.x -= nx * push;
        left.z -= nz * push;
        right.x += nx * push;
        right.z += nz * push;
        left.x = Math.max(-limitX, Math.min(limitX, left.x));
        left.z = Math.max(-limitZ, Math.min(limitZ, left.z));
        right.x = Math.max(-limitX, Math.min(limitX, right.x));
        right.z = Math.max(-limitZ, Math.min(limitZ, right.z));
      }
    }
  }
  return positions;
}

function _getPlanetRadius(system) {
  const prices = system && system.prices ? Object.values(system.prices) : [];
  const average = prices.length
    ? prices.reduce(function (sum, value) { return sum + value; }, 0) / prices.length
    : 1;
  const base = Math.max(2.75, Math.min(4.6, 5.55 - average * 1.7));
  return base * (system && system.type === 'special' ? 1.34 : 1.12) * PLANET_VISUAL_SCALE;
}

function _buildBackground() {
  if (!_backgroundRoot) return;
  _clearGroup(_backgroundRoot);
  const settings = _getQualitySettings();
  const rng = _createRng(3045);
  const starTexture = _getSharedStarTexture();
  const positions = new Float32Array(settings.backgroundStars * 3);
  const colors = new Float32Array(settings.backgroundStars * 3);

  for (let i = 0; i < settings.backgroundStars; i += 1) {
    const radius = 230 + rng() * 470;
    const theta = rng() * Math.PI * 2;
    const y = (rng() - 0.5) * 300;
    positions[i * 3] = Math.cos(theta) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * radius;
    const cool = rng();
    colors[i * 3] = 0.48 + cool * 0.42;
    colors[i * 3 + 1] = 0.68 + cool * 0.28;
    colors[i * 3 + 2] = 0.86 + cool * 0.14;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    map: starTexture,
    size: _getEffectiveQualityLevel() === 'low' ? 1.15 : 1.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.84,
    alphaTest: 0.015,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const stars = new Points(geometry, material);
  stars.name = 'deepStarfield';
  stars.userData.rotationRate = 0.0000009;
  _backgroundRoot.add(stars);

  const nearStarCount = Math.max(36, Math.round(settings.backgroundStars * 0.12));
  const nearPositions = new Float32Array(nearStarCount * 3);
  const nearColors = new Float32Array(nearStarCount * 3);
  for (let index = 0; index < nearStarCount; index += 1) {
    const radius = 105 + rng() * 190;
    const theta = rng() * Math.PI * 2;
    nearPositions[index * 3] = Math.cos(theta) * radius;
    nearPositions[index * 3 + 1] = (rng() - 0.5) * 170;
    nearPositions[index * 3 + 2] = Math.sin(theta) * radius;
    const warm = rng() > 0.76;
    nearColors[index * 3] = warm ? 1 : 0.48 + rng() * 0.24;
    nearColors[index * 3 + 1] = warm ? 0.68 + rng() * 0.2 : 0.76 + rng() * 0.18;
    nearColors[index * 3 + 2] = warm ? 0.48 + rng() * 0.28 : 1;
  }
  const nearGeometry = new BufferGeometry();
  nearGeometry.setAttribute('position', new BufferAttribute(nearPositions, 3));
  nearGeometry.setAttribute('color', new BufferAttribute(nearColors, 3));
  const nearMaterial = new PointsMaterial({
    map: starTexture,
    size: _getEffectiveQualityLevel() === 'low' ? 1.8 : 2.45,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    alphaTest: 0.015,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const nearStars = new Points(nearGeometry, nearMaterial);
  nearStars.name = 'nearStarfield';
  nearStars.userData.rotationRate = -0.0000018;
  _backgroundRoot.add(nearStars);

  if (_getEffectiveQualityLevel() === 'high') {
    [
      { color: '#163c78', x: -180, y: 42, z: -220, width: 260, height: 160, phase: 0.4 },
      { color: '#542360', x: 210, y: -54, z: -180, width: 230, height: 150, phase: 1.8 },
      { color: '#1b594e', x: 15, y: 110, z: -310, width: 300, height: 170, phase: 3.2 },
    ].forEach(function (spec, index) {
      const nebulaMaterial = new SpriteMaterial({
        map: _createNebulaTexture(spec.color, 47 + index),
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const nebula = new Sprite(nebulaMaterial);
      nebula.position.set(spec.x, spec.y, spec.z);
      nebula.scale.set(spec.width, spec.height, 1);
      nebula.renderOrder = -10;
      nebula.userData.baseOpacity = 0.18;
      nebula.userData.pulsePhase = spec.phase;
      nebula.userData.pulseSpeed = 0.00016;
      _backgroundRoot.add(nebula);
    });
  }

  const glintCount = _getEffectiveQualityLevel() === 'high'
    ? 10
    : (_getEffectiveQualityLevel() === 'medium' ? 4 : 2);
  for (let index = 0; index < glintCount; index += 1) {
    const color = index % 4 === 0 ? new Color(0xffd3a0) : new Color(0x9de6ff);
    const glintMaterial = new SpriteMaterial({
      map: starTexture,
      color,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glint = new Sprite(glintMaterial);
    const theta = rng() * Math.PI * 2;
    const radius = 135 + rng() * 155;
    glint.position.set(Math.cos(theta) * radius, (rng() - 0.5) * 120, Math.sin(theta) * radius);
    const scale = 3.8 + rng() * 4.6;
    glint.scale.set(scale, scale, 1);
    glint.userData.baseOpacity = 0.42 + rng() * 0.22;
    glint.userData.pulsePhase = rng() * Math.PI * 2;
    glint.userData.pulseSpeed = 0.0011 + rng() * 0.0009;
    _backgroundRoot.add(glint);
  }

  const grid = new GridHelper(PLANET_SPAN_X * 1.74, 48, 0x226487, 0x0f2f48);
  grid.position.y = -18;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  grid.material.depthWrite = false;
  _backgroundRoot.add(grid);
}

function _createStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.08, 'rgba(235,248,255,0.98)');
  glow.addColorStop(0.24, 'rgba(130,210,255,0.52)');
  glow.addColorStop(1, 'rgba(80,150,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillRect(center - 0.7, 4, 1.4, size - 8);
  ctx.fillRect(4, center - 0.7, size - 8, 1.4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function _buildGalaxyScene(state) {
  if (!_galaxyRoot) return;
  _clearGroup(_galaxyRoot);
  _galaxyEntries = [];
  _galaxyHitTargets = [];

  const positions = new Map();
  GALAXIES.forEach(function (galaxy) {
    positions.set(galaxy.id, _galaxyPosition(galaxy));
  });
  _buildGalaxyAmbientHalos(positions, state);
  _buildGalaxyConnections(positions);

  GALAXIES.forEach(function (galaxy, index) {
    const access = getGalaxyAccessState(galaxy.id, state.playerLevel || 1, state.researchedTechs || []);
    const current = galaxy.id === (state.currentGalaxy || 'milky_way');
    const group = new Group();
    group.name = 'galaxy_' + galaxy.id;
    group.position.copy(positions.get(galaxy.id));
    group.userData.baseY = group.position.y;
    group.userData.phase = index * 0.73;

    const color = new Color(galaxy.color || '#55a8ff');
    const diskTexture = _createGalaxyTexture(galaxy, access.unlocked);
    const diskMaterial = new SpriteMaterial({
      map: diskTexture,
      color: access.unlocked ? color : new Color(0x7d8b99),
      transparent: true,
      opacity: access.unlocked ? 0.92 : 0.34,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const disk = new Sprite(diskMaterial);
    const size = 30 + (index % 3) * 3.2;
    disk.scale.set(size, size, 1);
    disk.renderOrder = 3;
    group.add(disk);

    const haloMaterial = new SpriteMaterial({
      map: _getSharedHaloTexture(),
      color: access.unlocked ? color : new Color(0x65727e),
      transparent: true,
      opacity: current ? 0.58 : 0.22,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const halo = new Sprite(haloMaterial);
    halo.scale.set(size * 1.48, size * 1.48, 1);
    halo.renderOrder = 2;
    halo.visible = current;
    group.add(halo);

    const particles = _createGalaxyParticles(galaxy, color, access.unlocked);
    group.add(particles);

    const ringMaterial = new MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: current ? 0.68 : 0.18,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(_getSharedGeometry(
      'galaxy-marker-ring',
      function () { return new RingGeometry(0.56, 0.59, 72); }
    ), ringMaterial);
    ring.scale.setScalar(size);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 4;
    ring.visible = current || _getEffectiveQualityLevel() === 'high';
    group.add(ring);

    const statusText = current
      ? 'CURRENT GALAXY'
      : (access.unlocked ? 'NAVIGATION ONLINE' : 'LV.' + access.requiredLevel + ' ACCESS LOCKED');
    const label = _createGalaxyLabelSprite(
      galaxy.name,
      statusText,
      galaxy.color || '#55a8ff',
      access.unlocked ? '#8bdcff' : '#8a98a7'
    );
    label.position.set(0, size * 0.55, 0);
    label.scale.set(34, 9.2, 1);
    label.renderOrder = 8;
    group.add(label);

    const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    hitMaterial.colorWrite = false;
    const hitTarget = new Mesh(_getSharedGeometry(
      'galaxy-hit-sphere',
      function () { return new SphereGeometry(1, 12, 8); }
    ), hitMaterial);
    hitTarget.scale.setScalar(size * 0.48);
    hitTarget.visible = false;
    hitTarget.userData = {
      galaxyId: galaxy.id,
      unlocked: access.unlocked,
    };
    group.add(hitTarget);
    _galaxyHitTargets.push(hitTarget);

    const data = Object.assign({}, galaxy, { accessState: access });
    _galaxyEntries.push({
      id: galaxy.id,
      data: data,
      unlocked: access.unlocked,
      current: current,
      group: group,
      disk: disk,
      diskMaterial: diskMaterial,
      halo: halo,
      haloMaterial: haloMaterial,
      ring: ring,
      ringMaterial: ringMaterial,
      particles: particles,
      alwaysShowRing: _getEffectiveQualityLevel() === 'high',
    });
    _galaxyRoot.add(group);
  });
}

function _buildGalaxyAmbientHalos(positions, state) {
  const haloPositions = new Float32Array(GALAXIES.length * 3);
  const haloColors = new Float32Array(GALAXIES.length * 3);
  GALAXIES.forEach(function (galaxy, index) {
    const position = positions.get(galaxy.id);
    const access = getGalaxyAccessState(galaxy.id, state.playerLevel || 1, state.researchedTechs || []);
    const baseColor = new Color(galaxy.color || '#55a8ff');
    const color = access.unlocked ? baseColor : baseColor.clone().lerp(new Color(0x65727e), 0.58);
    haloPositions[index * 3] = position.x;
    haloPositions[index * 3 + 1] = position.y;
    haloPositions[index * 3 + 2] = position.z;
    haloColors[index * 3] = color.r;
    haloColors[index * 3 + 1] = color.g;
    haloColors[index * 3 + 2] = color.b;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(haloPositions, 3));
  geometry.setAttribute('color', new BufferAttribute(haloColors, 3));
  const material = new PointsMaterial({
    map: _getSharedHaloTexture(),
    size: _getEffectiveQualityLevel() === 'high' ? 44 : 36,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.42,
    alphaTest: 0.02,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const halos = new Points(geometry, material);
  halos.name = 'galaxyAmbientHalos';
  halos.renderOrder = 2;
  _galaxyRoot.add(halos);
}

function _buildGalaxyConnections(positions) {
  const settings = _getQualitySettings();
  const edges = new Set();
  const linePoints = [];
  GALAXIES.forEach(function (galaxy) {
    const from = positions.get(galaxy.id);
    const nearest = GALAXIES
      .filter(function (candidate) { return candidate.id !== galaxy.id; })
      .map(function (candidate) {
        return { id: candidate.id, distance: from.distanceToSquared(positions.get(candidate.id)) };
      })
      .sort(function (a, b) { return a.distance - b.distance; })
      .slice(0, 2);

    nearest.forEach(function (candidate) {
      const key = [galaxy.id, candidate.id].sort().join('|');
      if (edges.has(key)) return;
      edges.add(key);
      const to = positions.get(candidate.id);
      const mid = from.clone().lerp(to, 0.5);
      mid.y += 7 + Math.sqrt(from.distanceTo(to)) * 0.2;
      const curve = new QuadraticBezierCurve3(from, mid, to);
      const curvePoints = curve.getPoints(settings.curveSegments);
      for (let index = 1; index < curvePoints.length; index += 1) {
        linePoints.push(curvePoints[index - 1], curvePoints[index]);
      }
    });
  });
  if (!linePoints.length) return;
  const geometry = new BufferGeometry().setFromPoints(linePoints);
  const material = new LineBasicMaterial({
    color: 0x2b86b8,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const lines = new LineSegments(geometry, material);
  lines.renderOrder = 1;
  _galaxyRoot.add(lines);
}

function _createGalaxyParticles(galaxy, color, unlocked) {
  const count = _getQualitySettings().galaxyStars;
  const rng = _createRng(_hash(galaxy.id));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.pow(rng(), 0.6) * 15;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (rng() - 0.5) * 2.8;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.48;
    const brightness = unlocked ? 0.72 + rng() * 0.28 : 0.34 + rng() * 0.12;
    colors[i * 3] = color.r * brightness + (1 - brightness) * 0.45;
    colors[i * 3 + 1] = color.g * brightness + (1 - brightness) * 0.5;
    colors[i * 3 + 2] = color.b * brightness + (1 - brightness) * 0.58;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    size: 0.82,
    transparent: true,
    opacity: unlocked ? 0.86 : 0.34,
    vertexColors: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new Points(geometry, material);
}

function _createGalaxyTexture(galaxy, unlocked) {
  const size = _getQualitySettings().textureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const color = new Color(galaxy.color || '#55a8ff');
  const rgb = {
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
  };
  const rng = _createRng(_hash(galaxy.id));

  ctx.clearRect(0, 0, size, size);
  const haze = ctx.createRadialGradient(center, center, 0, center, center, center * 0.9);
  haze.addColorStop(0, 'rgba(255,255,255,' + (unlocked ? 0.95 : 0.42) + ')');
  haze.addColorStop(0.12, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.72)');
  haze.addColorStop(0.52, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.14)');
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, size, size);

  const pointCount = _getEffectiveQualityLevel() === 'high' ? 920 : (_getEffectiveQualityLevel() === 'medium' ? 560 : 300);
  const armCount = 4;
  for (let i = 0; i < pointCount; i += 1) {
    const arm = i % armCount;
    const radius = Math.pow(rng(), 0.58) * center * 0.78;
    const angle = arm * (Math.PI * 2 / armCount) + radius * 0.055 + (rng() - 0.5) * 0.62;
    const flatten = 0.56 + rng() * 0.18;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius * flatten;
    const alpha = (1 - radius / center) * (unlocked ? 0.7 : 0.24) + 0.08;
    const dot = Math.max(0.5, size / 256 * (0.7 + rng() * 1.5));
    ctx.fillStyle = rng() > 0.82
      ? 'rgba(255,255,255,' + Math.min(0.95, alpha + 0.24) + ')'
      : 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
    ctx.beginPath();
    ctx.arc(x, y, dot, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function _createHaloTexture(colorHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const color = new Color(colorHex);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const gradient = ctx.createRadialGradient(64, 64, 24, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  gradient.addColorStop(0.62, 'rgba(' + r + ',' + g + ',' + b + ',0.08)');
  gradient.addColorStop(0.78, 'rgba(' + r + ',' + g + ',' + b + ',0.78)');
  gradient.addColorStop(0.84, 'rgba(' + r + ',' + g + ',' + b + ',0.12)');
  gradient.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function _createGalaxyLabelSprite(title, status, titleColor, statusColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 38px system-ui, sans-serif';
  ctx.shadowColor = titleColor;
  ctx.shadowBlur = 16;
  ctx.fillStyle = titleColor;
  ctx.fillText(title, canvas.width / 2, 42);
  ctx.font = '600 20px ui-monospace, monospace';
  ctx.shadowColor = statusColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = statusColor;
  ctx.fillText(status, canvas.width / 2, 93);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  return new Sprite(material);
}

function _animateScene(time) {
  const fullMotion = _motionLevel === 'full';
  const reducedMotion = _motionLevel === 'reduced';
  const wideLabels = !_canvas || (_canvas.clientWidth || _canvas.getBoundingClientRect().width || 0) >= 720;

  if (_mapView === 'planets') _planetEntries.forEach(function (entry, index) {
    const hovered = entry.id === _hoveredPlanetId;
    const selected = entry.id === _selectedPlanetId;
    const focused = entry.id === _focusPlanetId;
    const hot = hovered || selected || focused || entry.current;
    const pulse = _motionLevel === 'off' ? 0 : Math.sin(time * 0.0022 + entry.phase) * 0.06;
    const targetScale = hovered ? 1.1 : (selected || focused ? 1.03 : (entry.current ? 1.04 + pulse * 0.35 : 1));
    const scaleLerp = reducedMotion ? 0.08 : 0.15;
    entry.group.scale.x += (targetScale - entry.group.scale.x) * scaleLerp;
    entry.group.scale.y += (targetScale - entry.group.scale.y) * scaleLerp;
    entry.group.scale.z += (targetScale - entry.group.scale.z) * scaleLerp;
    entry.group.position.y = entry.group.userData.baseY + (_motionLevel === 'off' ? 0 : Math.sin(time * 0.0007 + entry.group.userData.phase) * 0.52);
    entry.halo.visible = hot;
    entry.haloMaterial.opacity = hovered ? 0.52 : (entry.current ? 0.4 + pulse * 0.25 : (selected || focused ? 0.18 : 0.18));
    if (entry.ringMaterial) {
      entry.ringMaterial.opacity = hovered ? 0.62 : (entry.current ? 0.56 + pulse * 0.25 : (selected || focused ? 0.26 : 0.18));
    }
    if (entry.atmosphereMaterial) {
      entry.atmosphereMaterial.opacity = hovered || entry.current ? 0.22 : (selected || focused ? 0.13 : 0.09);
    }
    entry.bodyMaterial.emissiveIntensity = hovered || entry.current ? 1.7 : (selected || focused ? 1.28 : 1.15);
    if (entry.label) {
      entry.label.visible = hot || (wideLabels && entry.labelPriority);
      entry.label.material.opacity = entry.unlocked ? (hot ? 1 : 0.78) : 0.46;
    }
    if (fullMotion) {
      entry.body.rotation.y += 0.0018 + (index % 7) * 0.00008;
      if (entry.cloudShell) entry.cloudShell.rotation.y += 0.00235 + (index % 5) * 0.00012;
      if (entry.ring) entry.ring.rotation.z += entry.current ? 0.0022 : 0.00075;
      if (entry.debrisRing) entry.debrisRing.rotation.z -= 0.00042 + (index % 3) * 0.00006;
      if (entry.moonPivot) entry.moonPivot.rotation.y += 0.004 + (index % 4) * 0.0005;
    }
  });

  if (_mapView === 'planets') _routeVisuals.forEach(function (visual, index) {
    if (!visual.ship || !visual.curve) return;
    let progress;
    if (visual.activeFlight && _flightPath) {
      progress = Math.max(0, Math.min(1, (time - _flightPath.startTime) / _flightPath.duration));
    } else {
      progress = _motionLevel === 'off'
        ? visual.phase
        : ((time * 0.000045 + visual.phase + index * 0.11) % 1);
    }
    visual.curve.getPoint(progress, visual.positionScratch);
    visual.curve.getPoint(Math.min(1, progress + 0.015), visual.lookAtScratch);
    visual.ship.position.copy(visual.positionScratch);
    visual.ship.lookAt(visual.lookAtScratch);
    if (_motionLevel !== 'off') {
      visual.material.opacity = Math.max(0.25, visual.material.opacity * 0.998 + (0.62 + Math.sin(time * 0.003 + index) * 0.12) * 0.002);
    }
  });

  if (_mapView === 'galaxies') _galaxyEntries.forEach(function (entry, index) {
    const hovered = entry.id === _hoveredGalaxyId;
    const pulse = _motionLevel === 'off' ? 0 : Math.sin(time * (fullMotion ? 0.0016 : 0.0008) + index) * 0.035;
    const targetScale = hovered ? 1.15 : (entry.current ? 1.04 + pulse : 1);
    const scaleLerp = reducedMotion ? 0.08 : 0.14;
    entry.group.scale.x += (targetScale - entry.group.scale.x) * scaleLerp;
    entry.group.scale.y += (targetScale - entry.group.scale.y) * scaleLerp;
    entry.group.scale.z += (targetScale - entry.group.scale.z) * scaleLerp;
    entry.group.position.y = entry.group.userData.baseY + (_motionLevel === 'off' ? 0 : Math.sin(time * 0.00055 + entry.group.userData.phase) * 1.1);
    entry.diskMaterial.opacity = entry.unlocked
      ? (hovered ? 1 : 0.9)
      : (hovered ? 0.46 : 0.3);
    entry.halo.visible = hovered || entry.current;
    entry.haloMaterial.opacity = hovered ? 0.72 : (entry.current ? 0.52 + pulse : 0.2);
    entry.ring.visible = entry.alwaysShowRing || hovered || entry.current;
    entry.ringMaterial.opacity = hovered ? 0.9 : (entry.current ? 0.62 + pulse : 0.16);
    if (fullMotion) {
      entry.disk.material.rotation += 0.00045 + index * 0.000015;
      entry.ring.rotation.z -= 0.0014;
      entry.particles.rotation.y += 0.0007;
    }
  });
  if (_backgroundRoot) {
    _backgroundRoot.children.forEach(function (child) {
      if (fullMotion && child.userData.rotationRate) {
        child.rotation.y = time * child.userData.rotationRate;
      }
      if (child.material && child.userData.baseOpacity != null && _motionLevel !== 'off') {
        const wave = Math.sin(time * child.userData.pulseSpeed + child.userData.pulsePhase);
        child.material.opacity = child.userData.baseOpacity * (0.82 + wave * 0.18);
      }
    });
  }
}

function _resizeRenderer(force) {
  if (!_renderer || !_camera || !_canvas) return false;
  const rect = _canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || _canvas.clientWidth || 1280));
  const height = Math.max(1, Math.round(rect.height || _canvas.clientHeight || 720));
  const quality = _getQualitySettings();
  const rawDpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const dpr = Math.min(quality.pixelRatio, Math.max(1, rawDpr));
  const key = width + 'x' + height + '@' + dpr;
  if (!force && key === _lastSizeKey) return false;
  _renderer.setPixelRatio(dpr);
  _renderer.setSize(width, height, false);
  _camera.aspect = width / height;
  _camera.updateProjectionMatrix();
  _lastSizeKey = key;
  _applyResponsiveCameraFrame(false);
  return true;
}

function _applyResponsiveCameraFrame(force) {
  if (!_camera || !_controls) return;
  const viewportWidth = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280;
  const viewportMode = viewportWidth <= 700 ? 'narrow' : 'wide';
  const mode = _mapView + ':' + viewportMode;
  if (!force && _cameraFrameMode === mode) return;
  _cameraFrameMode = mode;
  if (_mapView === 'galaxies' && viewportMode === 'narrow') {
    _camera.position.copy(GALAXY_CAMERA_HOME_NARROW);
    _controls.target.copy(GALAXY_CAMERA_TARGET_NARROW);
  } else if (_mapView === 'galaxies') {
    _camera.position.copy(GALAXY_CAMERA_HOME);
    _controls.target.copy(GALAXY_CAMERA_TARGET);
  } else {
    const current = _planetEntries.find(function (entry) { return entry.current; });
    _framePlanetNeighborhood(current ? current.group.position : null);
    return;
  }
  _controls.update();
}

function _framePlanetNeighborhood(position, distanceScale, exactTarget) {
  if (!_camera || !_controls) return;
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 700;
  const home = narrow ? PLANET_CAMERA_HOME_NARROW : PLANET_CAMERA_HOME;
  const baseTarget = narrow ? PLANET_CAMERA_TARGET_NARROW : PLANET_CAMERA_TARGET;
  const targetStrength = exactTarget ? 1 : (narrow ? 0.86 : 0.65);
  const target = position
    ? new Vector3(position.x * targetStrength, position.y - 3.5, position.z * targetStrength)
    : baseTarget.clone();
  const scale = distanceScale == null ? 0.76 : distanceScale;
  const offset = home.clone().sub(baseTarget).multiplyScalar(scale);
  _camera.position.copy(target).add(offset);
  _controls.target.copy(target);
  _controls.update();
}

function _focusCameraOnPlanet(planetId) {
  if (_mapView !== 'planets' || !_camera || !_controls) return false;
  const entry = _planetEntries.find(function (item) { return item.id === planetId; });
  if (!entry) return false;
  _framePlanetNeighborhood(entry.group.position, 0.64, true);
  return true;
}

function _projectWorldToCanvas(position) {
  const projected = position.clone().project(_camera);
  const rect = _canvas.getBoundingClientRect();
  return {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height,
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
  if (!_flightPath || time - _flightPath.startTime < _flightPath.duration) return;
  const callback = _flightPath.onComplete;
  _flightPath = null;
  _flightVisual = null;
  _dirty = true;
  if (callback) callback();
}

function _getEffectiveQualityLevel() {
  if (_qualityLevel !== 'auto') return _qualityLevel;
  if (_resolvedQualityLevel) return _resolvedQualityLevel;
  const canvasRect = _canvas && _canvas.getBoundingClientRect ? _canvas.getBoundingClientRect() : null;
  const viewportWidth = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280;
  const width = (_canvas && _canvas.clientWidth) || (canvasRect && canvasRect.width) || viewportWidth;
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const memory = typeof navigator !== 'undefined' && Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory : 8;
  if (width <= 680 || memory <= 3) _resolvedQualityLevel = 'low';
  else if (width <= 1100 || dpr >= 2 || memory <= 4) _resolvedQualityLevel = 'medium';
  else _resolvedQualityLevel = 'high';
  return _resolvedQualityLevel;
}

function _getQualitySettings() {
  return QUALITY[_getEffectiveQualityLevel()] || QUALITY.medium;
}

function _normalizeQuality(level) {
  return level === 'high' || level === 'medium' || level === 'low' || level === 'auto' ? level : 'auto';
}

function _galaxyPosition(galaxy) {
  return new Vector3(
    ((galaxy.gx || 0.5) - 0.5) * GALAXY_SPAN_X,
    Math.sin((galaxy.gx || 0.5) * Math.PI) * 5 - 2,
    ((galaxy.gy || 0.5) - 0.5) * GALAXY_SPAN_Z
  );
}

function _clearGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  group.traverse(function (object) {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(function (material) {
      if (!material) return;
      materials.add(material);
      ['map', 'alphaMap', 'bumpMap', 'emissiveMap', 'roughnessMap', 'metalnessMap'].forEach(function (key) {
        if (material[key]) textures.add(material[key]);
      });
    });
  });
  while (group.children.length > 0) group.remove(group.children[0]);
  textures.forEach(function (texture) {
    if (!_persistentPlanetTextures.has(texture)) texture.dispose();
  });
  materials.forEach(function (material) { material.dispose(); });
  geometries.forEach(function (geometry) {
    if (!_persistentGeometries.has(geometry)) geometry.dispose();
  });
}

function _getSharedGeometry(key, factory) {
  if (_sharedGeometryCache.has(key)) return _sharedGeometryCache.get(key);
  const geometry = factory();
  _sharedGeometryCache.set(key, geometry);
  _persistentGeometries.add(geometry);
  return geometry;
}

function _getSharedPlanetSphereGeometry() {
  const quality = _getQualitySettings();
  const heightSegments = Math.max(8, Math.round(quality.planetSegments * 0.7));
  const key = 'planet-sphere:' + quality.planetSegments + ':' + heightSegments;
  return _getSharedGeometry(key, function () {
    return new SphereGeometry(1, quality.planetSegments, heightSegments);
  });
}

function _getSharedHaloTexture() {
  if (_sharedHaloTexture) return _sharedHaloTexture;
  _sharedHaloTexture = _createHaloTexture('#ffffff');
  _persistentPlanetTextures.add(_sharedHaloTexture);
  return _sharedHaloTexture;
}

function _getSharedStarTexture() {
  if (_sharedStarTexture) return _sharedStarTexture;
  _sharedStarTexture = _createStarTexture();
  _persistentPlanetTextures.add(_sharedStarTexture);
  return _sharedStarTexture;
}

function _now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function _recordPerformance(frameStartedAt, frameCompletedAt) {
  const frameMs = _performanceStats.lastFrameAt > 0 ? frameStartedAt - _performanceStats.lastFrameAt : 0;
  const cpuMs = Math.max(0, frameCompletedAt - frameStartedAt);
  _performanceStats.lastFrameAt = frameStartedAt;
  if (frameMs <= 0 || frameMs >= 250) return;
  _performanceStats.samples += 1;
  const alpha = _performanceStats.samples < 30 ? 0.15 : 0.05;
  _performanceStats.averageFrameMs = _performanceStats.averageFrameMs > 0
    ? _performanceStats.averageFrameMs + (frameMs - _performanceStats.averageFrameMs) * alpha
    : frameMs;
  _performanceStats.averageCpuMs = _performanceStats.averageCpuMs > 0
    ? _performanceStats.averageCpuMs + (cpuMs - _performanceStats.averageCpuMs) * alpha
    : cpuMs;
  _performanceStats.maxCpuMs = Math.max(cpuMs, _performanceStats.maxCpuMs * 0.995);
}

function _hash(text) {
  let hash = 2166136261;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function _createRng(seed) {
  let value = seed >>> 0;
  return function () {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
