// js/ui/StarmapRenderer.js — 星图渲染器门面
// 行星局部图与星系总览统一优先使用 Three.js；Canvas 2D 仅负责 WebGL2 降级。

import * as Renderer2D from './Renderer2DStarmap.js';

let _initialized = false;
let _isActive = true;
let _rendererThree = null;
let _threeLoadPromise = null;
let _threeLoading = false;
let _threeAvailable = false;
let _activeRenderer = '2d';
let _lastState = null;
let _lastMapView = 'planets';
let _lastGalaxyId = 'milky_way';
let _qualityLevel = 'auto';
let _motionLevel = 'full';
let _secretRoutesVisible = true;
let _lastInfoWriteAt = 0;
let _lastInfoSignature = '';
let _fallbackFrameDrawn = false;
let _sceneReady = false;
let _sceneReadyWatcherAttached = false;
let _resolveSceneReady = null;
let _sceneReadyPromise = null;
let _lifecycleGeneration = 0;

function _resetSceneReadyPromise() {
  _sceneReady = false;
  _sceneReadyWatcherAttached = false;
  _fallbackFrameDrawn = false;
  _sceneReadyPromise = new Promise(function (resolve) {
    _resolveSceneReady = resolve;
  });
}

_resetSceneReadyPromise();

export function init() {
  const twoDimensionalReady = Renderer2D.init();
  _initialized = !!twoDimensionalReady;
  _isActive = _initialized;
  _activateRenderer('2d');
  _exposeDebugState();
  return _initialized;
}

export function setQuality(level) {
  _qualityLevel = level;
  Renderer2D.setQuality(level);
  if (_rendererThree) _rendererThree.setQuality(level);
}

export function setMotionLevel(level) {
  _motionLevel = level;
  Renderer2D.setMotionLevel(level);
  if (_rendererThree) _rendererThree.setMotionLevel(level);
}

export function isActive() {
  return _initialized && _isActive;
}

export function toggleView() {
  _isActive = !_isActive;
  if (!_isActive) {
    Renderer2D.setVisible(false);
    if (_rendererThree) _rendererThree.setVisible(false);
    return;
  }
  _activateRenderer(_selectRenderer(_lastMapView));
}

export function render(state, mapView, galaxyId) {
  if (!isActive()) return;
  _lastState = state || _lastState || {};
  _lastMapView = mapView || (_lastState && _lastState.mapView) || 'planets';
  _lastGalaxyId = galaxyId || (_lastState && (_lastState.viewingGalaxy || _lastState.currentGalaxy)) || 'milky_way';

  const threeReadyPromise = _loadThreeRenderer();

  const rendererName = _selectRenderer(_lastMapView);
  _activateRenderer(rendererName);
  if (rendererName === 'three') {
    _rendererThree.render(_lastState, _lastMapView, _lastGalaxyId);
    _writeRendererInfo(_rendererThree.getRendererInfo());
    _markSceneReady('three');
  } else {
    Renderer2D.render(_lastState, _lastMapView, _lastGalaxyId);
    _fallbackFrameDrawn = true;
    _watchPreferredRenderer(threeReadyPromise);
  }
}

export function whenSceneReady() {
  return _sceneReadyPromise;
}

export function focusPlanet(planetId, smooth) {
  Renderer2D.focusPlanet(planetId, smooth);
  if (_rendererThree) return _rendererThree.focusPlanet(planetId, smooth);
  return true;
}

export function selectPlanet(planetId, options) {
  const fallbackResult = Renderer2D.selectPlanet(planetId, options);
  return _rendererThree ? _rendererThree.selectPlanet(planetId, options) : fallbackResult;
}

export function clearSelection() {
  Renderer2D.clearSelection();
  if (_rendererThree) _rendererThree.clearSelection();
}

export function resetCamera() {
  if (_activeRenderer === 'three' && _rendererThree) _rendererThree.resetCamera();
  else Renderer2D.resetCamera();
}

export function flyShipTo(fromId, toId, onComplete, shipTypeId, flightMeta) {
  if (_activeRenderer === 'three' && _rendererThree) {
    Renderer2D.flyShipTo(fromId, toId, null, shipTypeId, flightMeta);
    return _rendererThree.flyShipTo(fromId, toId, onComplete, shipTypeId, flightMeta);
  }
  if (_rendererThree) _rendererThree.flyShipTo(fromId, toId, null, shipTypeId, flightMeta);
  return Renderer2D.flyShipTo(fromId, toId, onComplete, shipTypeId, flightMeta);
}

export function isShipFlying() {
  return _activeRenderer === 'three' && _rendererThree
    ? _rendererThree.isShipFlying()
    : Renderer2D.isShipFlying();
}

export function cancelShipFlight() {
  Renderer2D.cancelShipFlight();
  if (_rendererThree) _rendererThree.cancelShipFlight();
}

export function getSystemAtPoint(x, y) {
  return _activeRenderer === 'three' && _rendererThree
    ? _rendererThree.getSystemAtPoint(x, y)
    : Renderer2D.getSystemAtPoint(x, y);
}

export function invalidateScene() {
  Renderer2D.invalidateScene();
  if (_rendererThree) _rendererThree.invalidateScene();
}

export function setSecretRoutesVisible(visible) {
  _secretRoutesVisible = !!visible;
  Renderer2D.setSecretRoutesVisible(visible);
  if (_rendererThree) _rendererThree.setSecretRoutesVisible(visible);
}

export function isSecretRoutesVisible() {
  return Renderer2D.isSecretRoutesVisible();
}

export function getPlanetScreenPosition(planetId) {
  return _activeRenderer === 'three' && _rendererThree
    ? _rendererThree.getPlanetScreenPosition(planetId)
    : Renderer2D.getPlanetScreenPosition(planetId);
}

export function resetRuntimeState(currentSystemId) {
  Renderer2D.resetRuntimeState(currentSystemId);
  if (_rendererThree) _rendererThree.resetRuntimeState(currentSystemId);
}

/** 释放渲染器资源，并为下一次 init 建立新的场景就绪周期。 */
export function dispose() {
  const hadRuntime = !!(
    _initialized || _rendererThree || _threeLoadPromise || _lastState ||
    Renderer2D.isActive()
  );
  _lifecycleGeneration += 1;

  if (_resolveSceneReady) {
    _resolveSceneReady({ renderer: 'disposed', disposed: true });
    _resolveSceneReady = null;
  }
  Renderer2D.dispose();
  if (_rendererThree) {
    if (typeof _rendererThree.setAvailabilityHandler === 'function') {
      _rendererThree.setAvailabilityHandler(null);
    }
    if (typeof _rendererThree.dispose === 'function') _rendererThree.dispose();
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    const container = document.getElementById('map-container');
    if (container && container.dataset) {
      [
        'starmapRenderer', 'starmapThreeAvailable', 'starmapSceneReady',
        'starmapReadyRenderer', 'starmapCalls', 'starmapTriangles',
        'starmapPoints', 'starmapGeometries', 'starmapTextures',
        'starmapQuality', 'starmapFps', 'starmapFrameMs',
        'starmapCpuMs', 'starmapMaxCpuMs',
      ].forEach(function (key) { delete container.dataset[key]; });
    }
  }

  _initialized = false;
  _isActive = false;
  _rendererThree = null;
  _threeLoadPromise = null;
  _threeLoading = false;
  _threeAvailable = false;
  _activeRenderer = '2d';
  _lastState = null;
  _lastMapView = 'planets';
  _lastGalaxyId = 'milky_way';
  _lastInfoWriteAt = 0;
  _lastInfoSignature = '';
  if (typeof globalThis !== 'undefined' && globalThis.__linegameStarmapRenderer) {
    delete globalThis.__linegameStarmapRenderer;
  }
  _resetSceneReadyPromise();
  return hadRuntime;
}

export function getActiveRendererName() {
  return _activeRenderer;
}

export function getRendererInfo() {
  if (_activeRenderer === 'three' && _rendererThree) return _rendererThree.getRendererInfo();
  return { renderer: '2d', quality: null };
}

export function whenThreeReady() {
  return _threeLoadPromise || Promise.resolve(false);
}

function _selectRenderer(mapView) {
  return _rendererThree && _threeAvailable && _rendererThree.isAvailable()
    ? 'three'
    : '2d';
}

function _activateRenderer(rendererName) {
  const nextRenderer = rendererName === 'three' ? 'three' : '2d';
  _activeRenderer = nextRenderer;
  if (_rendererThree) {
    _rendererThree.setVisible(_isActive && nextRenderer === 'three');
  } else if (typeof document !== 'undefined' && document.getElementById) {
    const threeCanvas = document.getElementById('starmap-three-canvas');
    if (threeCanvas) threeCanvas.style.display = 'none';
  }
  Renderer2D.setVisible(_isActive && nextRenderer === '2d');

  if (typeof document !== 'undefined' && document.getElementById) {
    const container = document.getElementById('map-container');
    if (container && container.dataset) {
      container.dataset.starmapRenderer = nextRenderer;
      container.dataset.starmapThreeAvailable = _threeAvailable ? 'true' : 'false';
    }
  }
  _exposeDebugState();
}

function _writeRendererInfo(info) {
  if (!info || typeof document === 'undefined' || !document.getElementById) return;
  const container = document.getElementById('map-container');
  if (!container || !container.dataset) return;
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const signature = [info.renderer, info.quality].join(':');
  if (signature === _lastInfoSignature && now - _lastInfoWriteAt < 500) return;
  _lastInfoSignature = signature;
  _lastInfoWriteAt = now;
  container.dataset.starmapCalls = String(info.calls || 0);
  container.dataset.starmapTriangles = String(info.triangles || 0);
  container.dataset.starmapPoints = String(info.points || 0);
  container.dataset.starmapGeometries = String(info.geometries || 0);
  container.dataset.starmapTextures = String(info.textures || 0);
  container.dataset.starmapQuality = info.quality || 'unknown';
  container.dataset.starmapFps = Number(info.fps || 0).toFixed(1);
  container.dataset.starmapFrameMs = Number(info.frameMs || 0).toFixed(2);
  container.dataset.starmapCpuMs = Number(info.cpuMs || 0).toFixed(2);
  container.dataset.starmapMaxCpuMs = Number(info.maxCpuMs || 0).toFixed(2);
}

function _loadThreeRenderer() {
  if (_threeLoadPromise) return _threeLoadPromise;
  if (!_canAttemptWebGL2()) {
    _threeLoading = false;
    _threeLoadPromise = Promise.resolve(false);
    _exposeDebugState();
    return _threeLoadPromise;
  }

  _threeLoading = true;
  _exposeDebugState();
  const loadGeneration = _lifecycleGeneration;
  _threeLoadPromise = import('./RendererThreeStarmap.js')
    .then(function (module) {
      if (loadGeneration !== _lifecycleGeneration || !_initialized) return false;
      _rendererThree = module;
      _rendererThree.setAvailabilityHandler(_handleThreeAvailability);
      _rendererThree.setQuality(_qualityLevel);
      _rendererThree.setMotionLevel(_motionLevel);
      _rendererThree.setSecretRoutesVisible(_secretRoutesVisible);
      _threeAvailable = _rendererThree.init();
      _threeLoading = false;
      if (_threeAvailable && _isActive) {
        _activateRenderer('three');
        _rendererThree.render(_lastState || {}, _lastMapView, _lastGalaxyId);
        _writeRendererInfo(_rendererThree.getRendererInfo());
        _markSceneReady('three');
      }
      _exposeDebugState();
      return _threeAvailable;
    })
    .catch(function (error) {
      if (loadGeneration !== _lifecycleGeneration) return false;
      _rendererThree = null;
      _threeAvailable = false;
      _threeLoading = false;
      console.warn('[StarmapRenderer] Three.js renderer failed to load; using 2D fallback.', error);
      _exposeDebugState();
      return false;
    });
  return _threeLoadPromise;
}

function _watchPreferredRenderer(threeReadyPromise) {
  if (_sceneReady || _sceneReadyWatcherAttached || !threeReadyPromise) return;
  _sceneReadyWatcherAttached = true;
  threeReadyPromise.then(function (threeAvailable) {
    if (!threeAvailable && _fallbackFrameDrawn) {
      _markSceneReady('2d');
    }
  });
}

function _markSceneReady(rendererName) {
  if (_sceneReady) return;
  _sceneReady = true;

  if (typeof document !== 'undefined' && document.getElementById) {
    const container = document.getElementById('map-container');
    if (container && container.dataset) {
      container.dataset.starmapSceneReady = 'true';
      container.dataset.starmapReadyRenderer = rendererName;
    }
  }
  if (_resolveSceneReady) {
    _resolveSceneReady({ renderer: rendererName });
    _resolveSceneReady = null;
  }
}

function _canAttemptWebGL2() {
  if (typeof document === 'undefined' || !document.getElementById) return false;
  const canvas = document.getElementById('starmap-three-canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return false;
  try {
    return !!canvas.getContext('webgl2');
  } catch (error) {
    return false;
  }
}

function _handleThreeAvailability(available) {
  _threeAvailable = !!available;
  if (!_threeAvailable && _activeRenderer === 'three') {
    _activateRenderer('2d');
    if (_lastState) Renderer2D.render(_lastState, _lastMapView, _lastGalaxyId);
  }
}

function _exposeDebugState() {
  if (typeof globalThis === 'undefined') return;
  globalThis.__linegameStarmapRenderer = {
    active: _activeRenderer,
    threeAvailable: _threeAvailable,
    threeLoading: _threeLoading,
    mapView: _lastMapView,
    getInfo: getRendererInfo,
  };
}
