// js/ui/Renderer3DAdvanced.js — 增强型 3D 星图渲染器 (Babylon.js)
// 依赖：babylon.js (global), GalaxyDataLayer, ExplorationSystem, data/systems.js, data/factions.js
// 导出：init, render, focusPlanet, setQuality, setMotionLevel, isActive, toggleView,
//       getSystemAtPoint, getPlanetScreenPosition, invalidateScene, resetRuntimeState,
//       resetCamera, flyShipTo, isShipFlying, cancelShipFlight

/**
 * 高级 3D 星图渲染系统 (Babylon.js)
 *
 * 特性：
 * - Thin Instances 批量渲染星球（高性能）
 * - 分层背景系统（远景恒星、星云、银河盘面）
 * - 势力边界可视化（领地光环 + 桥接平面）
 * - 航线与跃迁通道动画
 * - 飞船飞行动画（贝塞尔曲线）
 * - 派遣航线可视化
 * - 星球文本标签
 * - 星系总览视图
 * - 当前星球脉冲动画
 * - 画质等级管理
 */

import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import { FACTIONS } from '../data/factions.js';
import { GALAXIES, getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';

// 渲染上下文
let _engine, _scene, _camera, _canvas;
let _isActive = false;

// 渲染对象
let _planetMeshes = [];             // Individual planet sphere meshes
let _planetMetadata = [];           // { id, index, position, size, color, mesh, label }
let _backgroundLayers = null;       // { stars, nebula, disk }
let _factionBoundaries = [];        // Faction boundary meshes
let _connectionLines = [];          // Trade routes + glow meshes
let _secretRouteVisuals = [];       // 当前星球已发现暗线的可视化对象
let _selectionRing = null;          // Selection indicator
let _galaxyMeshes = [];             // Galaxy meshes for galaxy view
let _galaxyPCS = [];                // Galaxy PointsCloudSystems (async meshes)
let _textLabels = [];               // Text label meshes
let _mapView = 'planets';           // 'planets' or 'galaxies'

// 飞船
let _shipMesh = null;
let _shipTrail = null;
let _flightPath = null;
let _shipVisible = false;
let _flightRouteLine = null;   // 飞行轨迹线
let _flightTargetGlow = null;  // 目标星球选中光环
let _currentShipType = null;   // 当前飞船类型 ID

// 派遣航线
let _dispatchRouteLines = [];
let _dispatchShipMarkers = [];

// 状态
let _currentGalaxyId = 'milky_way';
let _currentSystem = null;
let _hoveredPlanet = null;
let _selectedPlanet = null;
let _motionLevel = 'full';
let _qualityLevel = 'high';
let _cameraTarget = null;
let _cameraTransitionProgress = 0;
let _lastRenderedGalaxyId = null;
let _lastRenderedSystem = null;
let _lastRenderedMapView = null;
let _dirty = true;

// 质量设置
const _QUALITY_SETTINGS = {
  high: {
    planetSegments: 32,
    starCount: 5000,
    enableGlow: true,
    enableRings: true,
    enableBoundaries: true,
    lodDistances: [50, 100, 200],
  },
  medium: {
    planetSegments: 16,
    starCount: 2000,
    enableGlow: true,
    enableRings: false,
    enableBoundaries: true,
    lodDistances: [40, 80, 150],
  },
  low: {
    planetSegments: 8,
    starCount: 1000,
    enableGlow: false,
    enableRings: false,
    enableBoundaries: false,
    lodDistances: [30, 60, 100],
  },
};

// 颜色方案
const _COLORS = {
  bgTop: new BABYLON.Color4(0.008, 0.031, 0.09, 1),
  starGlow: new BABYLON.Color3(0.22, 0.74, 0.97),
  current: new BABYLON.Color3(0.40, 0.91, 0.98),
  hover: new BABYLON.Color3(1, 1, 1),
  selected: new BABYLON.Color3(1, 1, 0),
  neutral: new BABYLON.Color3(0.376, 0.490, 0.545),
};

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export function init() {
  _canvas = document.getElementById('map-3d-canvas');
  if (!_canvas) {
    console.error('3D canvas not found');
    return;
  }

  // Create engine
  _engine = new BABYLON.Engine(_canvas, _qualityLevel !== 'low', {
    preserveDrawingBuffer: true,
    stencil: true,
    powerPreference: 'high-performance',
  });

  // Disable parallel shader compile to avoid GL_INVALID_VALUE warnings
  const caps = _engine.getCaps();
  if (caps.parallelShaderCompile) {
    caps.parallelShaderCompile = undefined;
  }

  // Create scene
  _scene = new BABYLON.Scene(_engine);
  _scene.clearColor = _COLORS.bgTop;
  _scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  _scene.fogColor = new BABYLON.Color3(0.008, 0.031, 0.09);
  _scene.fogStart = 200;
  _scene.fogEnd = 800;

  // Create ArcRotateCamera
  _camera = new BABYLON.ArcRotateCamera(
    'advCamera',
    -Math.PI / 2,
    Math.PI / 3,
    250,
    new BABYLON.Vector3(0, 0, 0),
    _scene
  );
  _camera.attachControl(_canvas, true);
  _camera.inertia = 0.9;
  _camera.lowerRadiusLimit = 50;
  _camera.upperRadiusLimit = 500;
  _camera.upperBetaLimit = Math.PI / 1.8;
  _camera.minZ = 0.1;
  _camera.maxZ = 2000;
  _camera.panningSensibility = 30;

  // Clamp pan target to ±160
  const PAN_LIMIT = 160;
  _scene.registerBeforeRender(() => {
    const t = _camera.target;
    t.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, t.x));
    t.y = Math.max(-30, Math.min(60, t.y));
    t.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, t.z));
  });

  // Zoom-out trigger to switch to galaxy view
  let _zoomOutTriggerPending = false;
  _canvas.addEventListener('wheel', (e) => {
    if (!_isActive || _mapView !== 'planets') return;
    if (e.deltaY > 0) {
      const dist = _camera.radius;
      if (dist >= _camera.upperRadiusLimit - 10) {
        if (!_zoomOutTriggerPending) {
          _zoomOutTriggerPending = true;
          if (window._switchToGalaxyView) {
            window._switchToGalaxyView();
          }
          setTimeout(() => { _zoomOutTriggerPending = false; }, 800);
        }
      }
    }
  }, { passive: true });

  // Lights — three for full spherical coverage
  const ambientLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), _scene);
  ambientLight.intensity = 0.35;

  const pointLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 200, 200), _scene);
  pointLight.diffuse = new BABYLON.Color3(0.22, 0.74, 0.97);
  pointLight.intensity = 1.5;
  pointLight.range = 1000;

  const dirLight = new BABYLON.DirectionalLight('dirLight', new BABYLON.Vector3(-1, -0.5, -1), _scene);
  dirLight.diffuse = new BABYLON.Color3(1, 1, 1);
  dirLight.intensity = 0.4;

  // Create background layers
  _createBackgroundLayers();

  // Create selection ring
  _createSelectionRing();

  // Setup event listeners
  window.addEventListener('resize', () => _engine.resize());

  // Pointer events for hover & click
  _canvas.addEventListener('pointermove', _onPointerMove);
  _canvas.addEventListener('click', _onClick);

  console.log('Renderer3DAdvanced initialized (Babylon.js)');
}

export function setQuality(level) {
  _qualityLevel = level;
  _dirty = true;
  _applyQualitySettings();
}

export function setMotionLevel(level) {
  _motionLevel = level;
}

export function isActive() {
  return _isActive;
}

export function toggleView() {
  if (!_engine || !_scene) return;
  _isActive = !_isActive;
  const canvas2d = document.getElementById('map-canvas');
  const canvasWebgl = document.getElementById('webgl-canvas');

  if (_isActive) {
    _canvas.style.display = 'block';
    if (canvas2d) canvas2d.style.display = 'none';
    if (canvasWebgl) canvasWebgl.style.display = 'none';
    _engine.resize();
    _startAnimation();
  } else {
    _canvas.style.display = 'none';
    if (canvas2d) canvas2d.style.display = 'block';
    if (canvasWebgl) canvasWebgl.style.display = 'block';
    _stopAnimation();
  }
}

// ---------------------------------------------------------------------------
// 背景系统（三层）
// ---------------------------------------------------------------------------

function _createBackgroundLayers() {
  _backgroundLayers = {
    stars: _createDistantStars(),
    nebula: _createNebula(),
    disk: _createGalaxyDisk(),
  };
}

function _createDistantStars() {
  const quality = _QUALITY_SETTINGS[_qualityLevel];
  const pcs = new BABYLON.PointsCloudSystem('distantStars', 2, _scene);

  pcs.addPoints(quality.starCount, function (particle) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const radius = 300 + Math.random() * 200;

    particle.position = new BABYLON.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );

    const colorVariation = Math.random();
    if (colorVariation < 0.7) {
      particle.color = new BABYLON.Color4(0.8, 0.9, 1, 0.8);
    } else if (colorVariation < 0.9) {
      particle.color = new BABYLON.Color4(1, 0.9, 0.7, 0.8);
    } else {
      particle.color = new BABYLON.Color4(1, 0.7, 0.6, 0.8);
    }
  });

  const placeholder = { rotation: { y: 0 }, dispose: () => {}, isPickable: false };
  pcs.buildMeshAsync().then(() => {
    if (!pcs.mesh) return;
    const mesh = pcs.mesh;
    mesh.rotation.y = placeholder.rotation.y;
    mesh.isPickable = false;
    if (_backgroundLayers) {
      _backgroundLayers.stars = mesh;
    }
  }).catch(err => console.error('[Renderer3DAdvanced] star buildMeshAsync error:', err));

  return placeholder;
}

function _createNebula() {
  const dtex = new BABYLON.DynamicTexture('nebulaTex', { width: 512, height: 512 }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();

  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.3)');
  gradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const imageData = ctx.getImageData(0, 0, 512, 512);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random() * 30;
    data[i] = Math.min(255, data[i] + noise);
    data[i + 1] = Math.min(255, data[i + 1] + noise);
    data[i + 2] = Math.min(255, data[i + 2] + noise);
  }
  ctx.putImageData(imageData, 0, 0);
  dtex.update();

  const nebula = BABYLON.MeshBuilder.CreateSphere('nebula', {
    diameter: 800, segments: 32, sideOrientation: BABYLON.Mesh.BACKSIDE,
  }, _scene);

  const mat = new BABYLON.StandardMaterial('nebulaMat', _scene);
  mat.diffuseTexture = dtex;
  mat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.4);
  mat.disableLighting = true;
  mat.alpha = 0.3;
  mat.backFaceCulling = false;
  nebula.material = mat;
  nebula.isPickable = false;

  return nebula;
}

function _createGalaxyDisk() {
  const dtex = new BABYLON.DynamicTexture('diskTex', { width: 1024, height: 1024 }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();
  const centerX = 512, centerY = 512;

  ctx.clearRect(0, 0, 1024, 1024);

  for (let arm = 0; arm < 3; arm++) {
    const armAngle = (arm / 3) * Math.PI * 2;
    ctx.strokeStyle = `rgba(103, 232, 249, ${0.1 + Math.random() * 0.1})`;
    ctx.lineWidth = 40;

    ctx.beginPath();
    for (let t = 0; t < Math.PI * 4; t += 0.1) {
      const r = 50 + t * 80;
      const angle = armAngle + t;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  dtex.update();

  const disk = BABYLON.MeshBuilder.CreatePlane('galaxyDisk', {
    width: 500, height: 500, sideOrientation: BABYLON.Mesh.DOUBLESIDE,
  }, _scene);
  disk.rotation.x = Math.PI / 2;
  disk.position.y = -5;

  const mat = new BABYLON.StandardMaterial('diskMat', _scene);
  mat.diffuseTexture = dtex;
  mat.emissiveColor = new BABYLON.Color3(0.3, 0.5, 0.6);
  mat.disableLighting = true;
  mat.alpha = 0.15;
  mat.backFaceCulling = false;
  mat.useAlphaFromDiffuseTexture = true;
  disk.material = mat;
  disk.isPickable = false;

  return disk;
}

// ---------------------------------------------------------------------------
// 主渲染入口
// ---------------------------------------------------------------------------

export function render(state, mapView, galaxyId) {
  if (!_isActive || !_scene || !_engine) return;

  _syncFlightPathWithState(state);

  const gid = galaxyId || 'milky_way';
  const sys = state.currentSystem;
  const mv = mapView || 'planets';

  // Only rebuild meshes when data actually changes
  if (!_dirty && gid === _lastRenderedGalaxyId && sys === _lastRenderedSystem && mv === _lastRenderedMapView) return;

  _currentGalaxyId = gid;
  _currentSystem = sys;
  _mapView = mv;
  _lastRenderedGalaxyId = gid;
  _lastRenderedSystem = sys;
  _lastRenderedMapView = mv;
  _dirty = false;

  // Clear existing meshes
  _clearPlanetMeshes();
  _clearGalaxyMeshes();

  if (_mapView === 'galaxies') {
    _renderGalaxies(state);
  } else {
    const hierarchy = GalaxyData.getGalaxyHierarchy(_currentGalaxyId);
    if (!hierarchy) return;

    _renderPlanetsInstanced(hierarchy.allPlanets, state);
    _renderSecretRoutes(state);
    _renderFactionBoundaries(hierarchy.allPlanets);
    _renderDispatchRoutes(state);
  }
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

function _clearPlanetMeshes() {
  _planetMeshes.forEach(m => {
    if (m.material) m.material.dispose();
    m.dispose();
  });
  _planetMeshes = [];
  _connectionLines.forEach(m => m.dispose());
  _connectionLines = [];
  _secretRouteVisuals = [];
  _factionBoundaries.forEach(m => m.dispose());
  _factionBoundaries = [];
  _textLabels.forEach(m => {
    if (m.material && m.material.diffuseTexture) m.material.diffuseTexture.dispose();
    if (m.material) m.material.dispose();
    m.dispose();
  });
  _textLabels = [];
  _dispatchRouteLines.forEach(m => m.dispose());
  _dispatchRouteLines = [];
  _dispatchShipMarkers.forEach(m => {
    m.getChildMeshes().forEach(c => c.dispose());
    m.dispose();
  });
  _dispatchShipMarkers = [];
}

function _clearGalaxyMeshes() {
  // Dispose async PointsCloudSystem meshes first
  _galaxyPCS.forEach(pcs => {
    try {
      if (pcs.mesh) pcs.mesh.dispose();
      pcs.dispose();
    } catch (e) { /* ignore */ }
  });
  _galaxyPCS = [];

  _galaxyMeshes.forEach(node => {
    node.getChildMeshes(false).forEach(c => {
      if (c.material) {
        if (c.material.diffuseTexture) c.material.diffuseTexture.dispose();
        c.material.dispose();
      }
      c.dispose();
    });
    node.dispose();
  });
  _galaxyMeshes = [];
}

// ---------------------------------------------------------------------------
// 星系总览渲染
// ---------------------------------------------------------------------------

function _createNebulaTexture(colorHex, seed, size) {
  const res = size || 256;
  const dtex = new BABYLON.DynamicTexture('nebTex_' + seed, { width: res, height: res }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();

  const cx = res / 2, cy = res / 2;
  const c3 = BABYLON.Color3.FromHexString(colorHex);
  const ri = Math.floor(c3.r * 255), gi = Math.floor(c3.g * 255), bi = Math.floor(c3.b * 255);

  const rng = (i) => {
    const v = Math.sin(seed + i * 9873.1) * 43758.5453;
    return v - Math.floor(v);
  };

  ctx.clearRect(0, 0, res, res);

  // 1) Base radial glow
  const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  baseGrad.addColorStop(0, `rgba(${ri},${gi},${bi},0.7)`);
  baseGrad.addColorStop(0.15, `rgba(${ri},${gi},${bi},0.35)`);
  baseGrad.addColorStop(0.5, `rgba(${ri},${gi},${bi},0.08)`);
  baseGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, res, res);

  // 2) Spiral arms
  ctx.globalCompositeOperation = 'lighter';
  const armCount = 2 + Math.floor(rng(0) * 2);
  for (let arm = 0; arm < armCount; arm++) {
    const armAngle = (arm / armCount) * Math.PI * 2 + rng(arm + 5) * 0.5;
    const twist = 2.5 + rng(arm + 10) * 2;
    for (let t = 0; t < Math.PI * twist; t += 0.08) {
      const radius = (t / (Math.PI * twist)) * cx * 0.85;
      const angle = armAngle + t;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      const width = 8 + 15 * (1 - t / (Math.PI * twist)) * (0.6 + rng(arm * 100 + Math.floor(t * 10)) * 0.4);
      const alpha = 0.12 * (1 - t / (Math.PI * twist));
      const armGrad = ctx.createRadialGradient(px, py, 0, px, py, width);
      armGrad.addColorStop(0, `rgba(${ri},${gi},${bi},${alpha})`);
      armGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = armGrad;
      ctx.fillRect(px - width, py - width, width * 2, width * 2);
    }
  }

  // 3) Star-forming knots
  const knotCount = 15 + Math.floor(rng(20) * 20);
  for (let k = 0; k < knotCount; k++) {
    const angle = rng(k + 30) * Math.PI * 2;
    const dist = rng(k + 40) * cx * 0.7;
    const kx = cx + dist * Math.cos(angle);
    const ky = cy + dist * Math.sin(angle);
    const kSize = 1.5 + rng(k + 50) * 4;
    const kAlpha = 0.15 + rng(k + 60) * 0.25;
    const kGrad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kSize);
    kGrad.addColorStop(0, `rgba(255,255,255,${kAlpha})`);
    kGrad.addColorStop(0.4, `rgba(${ri},${gi},${bi},${kAlpha * 0.4})`);
    kGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = kGrad;
    ctx.fillRect(kx - kSize, ky - kSize, kSize * 2, kSize * 2);
  }

  // 4) Core hotspot
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.12);
  coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  coreGrad.addColorStop(0.5, `rgba(${ri},${gi},${bi},0.5)`);
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, res, res);

  ctx.globalCompositeOperation = 'source-over';
  dtex.update();
  return dtex;
}

function _renderGalaxies(state) {
  GALAXIES.forEach((galaxy) => {
    const x = (galaxy.gx - 0.5) * 200;
    const z = (galaxy.gy - 0.5) * 200;
    const y = Math.sin(galaxy.gx * 3.14) * 15;

    const isUnlocked = galaxy.unlocked ||
      (state.researchedTechs && state.researchedTechs.includes(galaxy.techRequired));
    const baseOpacity = isUnlocked ? 1.0 : 0.3;

    // Deterministic seed from galaxy id
    let seed = 0;
    for (let c = 0; c < galaxy.id.length; c++) seed = ((seed << 5) - seed) + galaxy.id.charCodeAt(c);
    const rng = (i) => {
      const v = Math.sin(seed + i * 9873.1) * 43758.5453;
      return v - Math.floor(v);
    };

    const parent = new BABYLON.TransformNode('galaxy_' + galaxy.id, _scene);
    parent.position = new BABYLON.Vector3(x, y, z);
    parent.metadata = { type: 'galaxy', id: galaxy.id, data: galaxy };

    const galaxySize = 18 + rng(0) * 10;

    // 1) Main galaxy sprite — billboard plane with procedural texture
    const diskTex = _createNebulaTexture(galaxy.color || '#4FC3F7', seed, 512);
    const diskPlane = BABYLON.MeshBuilder.CreatePlane('gDisk_' + galaxy.id, {
      width: galaxySize * 2, height: galaxySize * 2,
    }, _scene);
    diskPlane.parent = parent;
    diskPlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    const diskMat = new BABYLON.StandardMaterial('gDiskMat_' + galaxy.id, _scene);
    diskMat.diffuseTexture = diskTex;
    diskMat.emissiveColor = BABYLON.Color3.FromHexString(galaxy.color || '#4FC3F7').scale(0.5);
    diskMat.disableLighting = true;
    diskMat.alpha = baseOpacity * 0.85;
    diskMat.backFaceCulling = false;
    diskMat.useAlphaFromDiffuseTexture = true;
    diskPlane.material = diskMat;
    diskPlane.isPickable = true;
    diskPlane.metadata = { type: 'galaxy', id: galaxy.id, data: galaxy };

    // 2) Second nebula layer
    const disk2Tex = _createNebulaTexture(galaxy.color || '#4FC3F7', seed + 777, 256);
    const disk2Plane = BABYLON.MeshBuilder.CreatePlane('gDisk2_' + galaxy.id, {
      width: galaxySize * 2.4, height: galaxySize * 2.4,
    }, _scene);
    disk2Plane.parent = parent;
    disk2Plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    disk2Plane.position.z = 0.1;
    const disk2Mat = new BABYLON.StandardMaterial('gDisk2Mat_' + galaxy.id, _scene);
    disk2Mat.diffuseTexture = disk2Tex;
    disk2Mat.emissiveColor = BABYLON.Color3.FromHexString(galaxy.color || '#4FC3F7').scale(0.3);
    disk2Mat.disableLighting = true;
    disk2Mat.alpha = baseOpacity * 0.3;
    disk2Mat.backFaceCulling = false;
    disk2Mat.useAlphaFromDiffuseTexture = true;
    disk2Plane.material = disk2Mat;
    disk2Plane.isPickable = false;

    // 3) Scattered star particles
    const starCount = 30 + Math.floor(rng(1) * 30);
    const starPCS = new BABYLON.PointsCloudSystem('gStars_' + galaxy.id, 1, _scene);
    const galColor = BABYLON.Color3.FromHexString(galaxy.color || '#4FC3F7');
    starPCS.addPoints(starCount, function (particle, i) {
      const angle = rng(i + 100) * Math.PI * 2;
      const dist = rng(i + 200) * galaxySize * 0.8;
      particle.position = new BABYLON.Vector3(
        x + dist * Math.cos(angle),
        y + (rng(i + 300) - 0.5) * galaxySize * 0.15,
        z + dist * Math.sin(angle)
      );
      const mix = rng(i + 400);
      particle.color = new BABYLON.Color4(
        0.8 + mix * galColor.r * 0.2,
        0.8 + mix * galColor.g * 0.2,
        0.9 + mix * galColor.b * 0.1,
        baseOpacity * 0.8
      );
    });
    _galaxyPCS.push(starPCS);
    starPCS.buildMeshAsync().then(() => {
      if (starPCS.mesh) {
        starPCS.mesh.isPickable = false;
      }
    }).catch(() => {});

    _galaxyMeshes.push(parent);

    // Text label
    _addTextLabel(galaxy.name, new BABYLON.Vector3(x, y + galaxySize + 3, z), 10);
  });
}

// ---------------------------------------------------------------------------
// 星球渲染（Thin Instances）
// ---------------------------------------------------------------------------

function _renderPlanetsInstanced(planets, state) {
  const quality = _QUALITY_SETTINGS[_qualityLevel];
  _planetMetadata = [];

  if (planets.length === 0) return;

  planets.forEach((planet, i) => {
    // 3D position — wide spread (300×300)
    const x = (planet.position.x - 0.5) * 300;
    const z = (planet.position.y - 0.5) * 300;
    const y = Math.sin(planet.position.x * Math.PI * 2) * 25 +
              Math.cos(planet.position.y * Math.PI * 2) * 15;
    const position = new BABYLON.Vector3(x, y, z);

    // Size based on resource richness
    const prices = planet.prices || {};
    const priceValues = Object.values(prices);
    const totalPrice = priceValues.length > 0
      ? priceValues.reduce((s, v) => s + v, 0) / priceValues.length
      : 1.0;
    const baseSize = Math.max(1.5, Math.min(3.0, 4.0 - totalPrice));
    const sizeMultiplier = planet.type === 'special' ? 1.3 : 1.0;
    const finalSize = baseSize * sizeMultiplier;

    // Create individual sphere mesh
    const sphere = BABYLON.MeshBuilder.CreateSphere('planet_' + planet.id, {
      diameter: 2, segments: quality.planetSegments,
    }, _scene);
    sphere.position = position;
    sphere.scaling = new BABYLON.Vector3(finalSize, finalSize, finalSize);

    const hexColor = _getSystemColor(planet.type);
    const color = BABYLON.Color3.FromHexString(hexColor);
    const mat = _createPlanetMaterial(planet.id, planet.type, color);
    sphere.material = mat;
    sphere.metadata = { type: 'planet', id: planet.id };
    _planetMeshes.push(sphere);

    // Name label below the planet
    const label = _createPlanetLabel(planet.name, position, finalSize);

    _planetMetadata.push({
      id: planet.id,
      index: i,
      position: position.clone(),
      size: finalSize,
      baseSize: finalSize,
      color: color,
      type: planet.type,
      owner: planet.owner,
      mesh: sphere,
      label: label,
    });
  });

  // Current system glow halo
  const currentMeta = _planetMetadata.find(m => m.id === state.currentSystem);
  if (currentMeta) {
    const glow = BABYLON.MeshBuilder.CreateSphere('currentGlow', {
      diameter: (currentMeta.size + 0.8) * 2, segments: 24,
    }, _scene);
    glow.position = currentMeta.position.clone();
    const glowMat = new BABYLON.StandardMaterial('glowMat', _scene);
    glowMat.emissiveColor = _COLORS.current;
    glowMat.disableLighting = true;
    glowMat.alpha = 0.25;
    glow.material = glowMat;
    glow.isPickable = false;
    _connectionLines.push(glow);
  }
}

function _createPlanetLabel(text, planetPos, planetSize) {
  const dtex = new BABYLON.DynamicTexture('labelTex_' + text + '_' + Math.random(), { width: 1024, height: 192 }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();
  ctx.clearRect(0, 0, 1024, 192);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'Bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 512, 130);
  dtex.update();

  const w = planetSize * 6;
  const plane = BABYLON.MeshBuilder.CreatePlane('label_' + text + '_' + Math.random(), {
    width: w, height: w * 0.18,
  }, _scene);
  // Place label above the planet
  plane.position = new BABYLON.Vector3(planetPos.x, planetPos.y + planetSize + 2.0, planetPos.z);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  const mat = new BABYLON.StandardMaterial('labelMat_' + Math.random(), _scene);
  mat.diffuseTexture = dtex;
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.useAlphaFromDiffuseTexture = true;
  plane.material = mat;
  plane.isPickable = false;

  _textLabels.push(plane);
  return plane;
}

function _addTextLabel(text, position, width) {
  const dtex = new BABYLON.DynamicTexture('labelTex_' + text + '_' + Math.random(), { width: 256, height: 64 }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'Bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 40);
  dtex.update();

  const w = width || 10;
  const plane = BABYLON.MeshBuilder.CreatePlane('label_' + text + '_' + Math.random(), {
    width: w, height: w * 0.25,
  }, _scene);
  plane.position = position.clone();
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;

  const mat = new BABYLON.StandardMaterial('labelMat_' + Math.random(), _scene);
  mat.diffuseTexture = dtex;
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.useAlphaFromDiffuseTexture = true;
  plane.material = mat;
  plane.isPickable = false;

  _textLabels.push(plane);
  return plane;
}

function _getSystemColor(type) {
  const colors = {
    agricultural: '#4CAF50',
    technology: '#2196F3',
    mining: '#FF9800',
    commercial: '#9C27B0',
    military: '#E91E63',
    medical: '#00BCD4',
    industrial: '#FF7043',
    energy: '#FFEE58',
    research: '#66BB6A',
    special: '#607D8B',
  };
  return colors[type] || '#4FC3F7';
}

// Procedural planet texture based on type
function _createPlanetMaterial(id, type, color) {
  var mat = new BABYLON.StandardMaterial('pMat_' + id, _scene);
  var S = 512;
  var dtex = new BABYLON.DynamicTexture('pTex_' + id + '_' + Math.random(), { width: S, height: S }, _scene);
  var ctx = dtex.getContext();

  var R = Math.round(color.r * 255), G = Math.round(color.g * 255), B = Math.round(color.b * 255);
  ctx.fillStyle = 'rgb(' + R + ',' + G + ',' + B + ')';
  ctx.fillRect(0, 0, S, S);

  var seed = _hashStr(id);
  var rng = function() { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 0x7fffffff; };
  var clamp = function(v) { return Math.min(255, Math.max(0, Math.round(v))); };
  var rgba = function(r, g, b, a) { return 'rgba(' + clamp(r) + ',' + clamp(g) + ',' + clamp(b) + ',' + a + ')'; };

  if (type === 'agricultural') {
    // 农业星：绿色宜居星球，蓝色海洋 + 大面积绿色陆地 + 白色云层
    // 海洋底色
    ctx.fillStyle = rgba(30, 80, 160, 1);
    ctx.fillRect(0, 0, S, S);
    // 大陆（绿色/棕色）
    for (var c = 0; c < 5; c++) {
      var cx = rng() * S, cy = rng() * S;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (var p = 0; p < 12; p++) {
        cx += (rng() - 0.5) * 120;
        cy += (rng() - 0.5) * 100;
        ctx.quadraticCurveTo(cx + (rng() - 0.5) * 40, cy + (rng() - 0.5) * 40, cx, cy);
      }
      ctx.closePath();
      var landG = 100 + rng() * 80;
      ctx.fillStyle = rgba(40 + rng() * 40, landG, 30 + rng() * 30, 0.85);
      ctx.fill();
    }
    // 冰盖（极地白色区域）
    ctx.fillStyle = rgba(220, 235, 245, 0.6);
    ctx.fillRect(0, 0, S, 30 + rng() * 20);
    ctx.fillRect(0, S - 30 - rng() * 20, S, 50);
    // 云层
    for (var cl = 0; cl < 8; cl++) {
      var clx = rng() * S, cly = rng() * S;
      ctx.beginPath();
      ctx.ellipse(clx, cly, 30 + rng() * 60, 8 + rng() * 15, rng() * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(255, 255, 255, 0.2 + rng() * 0.15);
      ctx.fill();
    }
    mat.specularPower = 50;
    mat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.5);

  } else if (type === 'technology') {
    // 科技星：深蓝金属表面 + 高亮发光电路网格 + 光点城市群
    ctx.fillStyle = rgba(15, 25, 60, 1);
    ctx.fillRect(0, 0, S, S);
    // 金属底纹
    for (var n = 0; n < 60; n++) {
      var nx = rng() * S, ny = rng() * S;
      ctx.fillStyle = rgba(20 + rng() * 30, 40 + rng() * 40, 80 + rng() * 50, 0.4);
      ctx.fillRect(nx, ny, 5 + rng() * 30, 5 + rng() * 30);
    }
    // 电路网格线
    ctx.strokeStyle = rgba(30, 140, 255, 0.4);
    ctx.lineWidth = 1;
    for (var gx = 0; gx < S; gx += 20 + Math.floor(rng() * 15)) {
      if (rng() > 0.4) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx + (rng() - 0.5) * 30, S); ctx.stroke(); }
    }
    for (var gy = 0; gy < S; gy += 20 + Math.floor(rng() * 15)) {
      if (rng() > 0.4) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(S, gy + (rng() - 0.5) * 30); ctx.stroke(); }
    }
    // 发光节点 / 城市群
    for (var ci = 0; ci < 30; ci++) {
      var cix = rng() * S, ciy = rng() * S, cir = 1 + rng() * 4;
      ctx.beginPath();
      ctx.arc(cix, ciy, cir, 0, Math.PI * 2);
      ctx.fillStyle = rgba(80, 180, 255, 0.6 + rng() * 0.4);
      ctx.fill();
    }
    // 主发光板块
    for (var bl = 0; bl < 3; bl++) {
      var bx = rng() * S, by2 = rng() * S;
      ctx.beginPath();
      ctx.ellipse(bx, by2, 20 + rng() * 40, 15 + rng() * 25, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = rgba(40, 120, 220, 0.25);
      ctx.fill();
    }
    mat.specularPower = 80;
    mat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.7);

  } else if (type === 'mining') {
    // 矿业星：干燥岩石表面，大量陨石坑，矿脉条纹，橙褐色调
    ctx.fillStyle = rgba(R - 20, G - 30, B - 40, 1);
    ctx.fillRect(0, 0, S, S);
    // 岩石地形（密集随机色块）
    for (var t = 0; t < 80; t++) {
      var tx = rng() * S, ty = rng() * S;
      var dr = (rng() - 0.5) * 60, dg = (rng() - 0.5) * 50, db = (rng() - 0.5) * 40;
      ctx.fillStyle = rgba(R + dr, G + dg - 20, B + db - 30, 0.5);
      ctx.fillRect(tx, ty, 6 + rng() * 35, 6 + rng() * 35);
    }
    // 矿脉（明亮条纹）
    for (var v = 0; v < 6; v++) {
      ctx.beginPath();
      var vx = rng() * S, vy = rng() * S;
      ctx.moveTo(vx, vy);
      for (var vs = 0; vs < 5; vs++) {
        vx += (rng() - 0.3) * 80;
        vy += (rng() - 0.5) * 60;
        ctx.lineTo(vx, vy);
      }
      ctx.strokeStyle = rgba(255, 200 + rng() * 55, 80, 0.5 + rng() * 0.3);
      ctx.lineWidth = 2 + rng() * 3;
      ctx.stroke();
    }
    // 陨石坑（大量、各尺寸）
    for (var cr = 0; cr < 15; cr++) {
      var crx = rng() * S, cry = rng() * S, crr = 6 + rng() * 25;
      // 坑内阴影
      ctx.beginPath();
      ctx.arc(crx, cry, crr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(R - 50, G - 60, B - 60, 0.5);
      ctx.fill();
      // 坑缘高光
      ctx.beginPath();
      ctx.arc(crx - 2, cry - 2, crr + 2, -0.8, 1.5);
      ctx.strokeStyle = rgba(R + 50, G + 40, B + 20, 0.4);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    mat.specularPower = 15;
    mat.specularColor = new BABYLON.Color3(0.25, 0.2, 0.1);

  } else if (type === 'commercial') {
    // 商业星：繁华城市星球，夜景灯光网格，紫色大气层
    // 深色表面
    ctx.fillStyle = rgba(30, 15, 50, 1);
    ctx.fillRect(0, 0, S, S);
    // 陆地板块
    for (var lp = 0; lp < 4; lp++) {
      var lpx = rng() * S, lpy = rng() * S;
      ctx.beginPath();
      ctx.moveTo(lpx, lpy);
      for (var lpp = 0; lpp < 10; lpp++) {
        lpx += (rng() - 0.5) * 100;
        lpy += (rng() - 0.5) * 80;
        ctx.lineTo(lpx, lpy);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(50 + rng() * 30, 30 + rng() * 20, 60 + rng() * 30, 0.7);
      ctx.fill();
    }
    // 城市灯光网格
    for (var lg = 0; lg < 120; lg++) {
      var lx = rng() * S, ly = rng() * S;
      ctx.beginPath();
      ctx.arc(lx, ly, 0.5 + rng() * 2.5, 0, Math.PI * 2);
      var bright = rng();
      ctx.fillStyle = bright > 0.5
        ? rgba(255, 220, 100, 0.5 + rng() * 0.5)
        : rgba(200, 150, 255, 0.4 + rng() * 0.4);
      ctx.fill();
    }
    // 发光航道线
    for (var rt = 0; rt < 5; rt++) {
      ctx.beginPath();
      ctx.moveTo(rng() * S, rng() * S);
      ctx.lineTo(rng() * S, rng() * S);
      ctx.strokeStyle = rgba(200, 160, 255, 0.15);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 紫色大气光晕
    var atmoGrad = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.52);
    atmoGrad.addColorStop(0, 'rgba(150, 80, 200, 0)');
    atmoGrad.addColorStop(1, 'rgba(150, 80, 200, 0.15)');
    ctx.fillStyle = atmoGrad;
    ctx.fillRect(0, 0, S, S);
    mat.specularPower = 40;
    mat.specularColor = new BABYLON.Color3(0.35, 0.25, 0.45);

  } else if (type === 'military') {
    // 军事星：红色荒漠，火山裂缝，熔岩河流，弹坑
    ctx.fillStyle = rgba(100, 30, 30, 1);
    ctx.fillRect(0, 0, S, S);
    // 红色荒漠地形
    for (var dt = 0; dt < 60; dt++) {
      var dtx = rng() * S, dty = rng() * S;
      ctx.fillStyle = rgba(R + (rng() - 0.5) * 80, G + (rng() - 0.5) * 40 - 20, B + (rng() - 0.5) * 30 - 20, 0.5);
      ctx.fillRect(dtx, dty, 8 + rng() * 40, 8 + rng() * 40);
    }
    // 熔岩裂缝（发光红色/橙色线条）
    for (var lv = 0; lv < 8; lv++) {
      ctx.beginPath();
      var lvx = rng() * S, lvy = rng() * S;
      ctx.moveTo(lvx, lvy);
      for (var ls = 0; ls < 6; ls++) {
        lvx += (rng() - 0.5) * 80;
        lvy += (rng() - 0.5) * 60;
        ctx.lineTo(lvx, lvy);
      }
      ctx.strokeStyle = rgba(255, 100 + rng() * 80, 20, 0.6 + rng() * 0.3);
      ctx.lineWidth = 1 + rng() * 3;
      ctx.stroke();
      // 裂缝发光
      ctx.strokeStyle = rgba(255, 160, 50, 0.15);
      ctx.lineWidth += 4;
      ctx.stroke();
    }
    // 弹坑 / 火山口
    for (var vc = 0; vc < 10; vc++) {
      var vcx = rng() * S, vcy = rng() * S, vcr = 5 + rng() * 20;
      ctx.beginPath();
      ctx.arc(vcx, vcy, vcr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(60, 15, 15, 0.6);
      ctx.fill();
      // 内部熔岩发光
      if (rng() > 0.5) {
        ctx.beginPath();
        ctx.arc(vcx, vcy, vcr * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(255, 120, 30, 0.4);
        ctx.fill();
      }
    }
    mat.specularPower = 20;
    mat.specularColor = new BABYLON.Color3(0.3, 0.1, 0.05);

  } else if (type === 'medical') {
    // 医疗星：洁净海洋星球，大片碧蓝海洋 + 白色岛链 + 极地冰层
    ctx.fillStyle = rgba(0, 140, 180, 1);
    ctx.fillRect(0, 0, S, S);
    // 深浅海域变化
    for (var ow = 0; ow < 20; ow++) {
      var owx = rng() * S, owy = rng() * S;
      ctx.beginPath();
      ctx.ellipse(owx, owy, 30 + rng() * 80, 20 + rng() * 50, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0, 160 + rng() * 60, 200 + rng() * 55, 0.3);
      ctx.fill();
    }
    // 白色/浅色岛链
    for (var il = 0; il < 8; il++) {
      var ix = rng() * S, iy = rng() * S;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      for (var ip = 0; ip < 5; ip++) {
        ix += (rng() - 0.5) * 40;
        iy += (rng() - 0.5) * 30;
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(200 + rng() * 55, 235, 230, 0.6);
      ctx.fill();
    }
    // 极地冰盖
    ctx.fillStyle = rgba(210, 240, 250, 0.7);
    ctx.fillRect(0, 0, S, 20 + rng() * 30);
    ctx.fillRect(0, S - 20 - rng() * 30, S, 50);
    // 云层
    for (var mc = 0; mc < 6; mc++) {
      ctx.beginPath();
      ctx.ellipse(rng() * S, rng() * S, 40 + rng() * 50, 6 + rng() * 12, rng() * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(255, 255, 255, 0.15 + rng() * 0.1);
      ctx.fill();
    }
    mat.specularPower = 70;
    mat.specularColor = new BABYLON.Color3(0.5, 0.55, 0.6);

  } else if (type === 'industrial') {
    // 工业星：污染大气、棕黄色表面、烟雾层、工厂灯光密布
    ctx.fillStyle = rgba(120, 80, 50, 1);
    ctx.fillRect(0, 0, S, S);
    // 粗糙地面变化
    for (var ig = 0; ig < 70; ig++) {
      var igx = rng() * S, igy = rng() * S;
      ctx.fillStyle = rgba(R + (rng() - 0.5) * 70, G + (rng() - 0.5) * 50 - 10, B + (rng() - 0.5) * 40 - 20, 0.45);
      ctx.fillRect(igx, igy, 5 + rng() * 25, 5 + rng() * 25);
    }
    // 工业区方块（规则结构）
    for (var ib = 0; ib < 12; ib++) {
      var ibx = rng() * S, iby = rng() * S;
      ctx.fillStyle = rgba(80 + rng() * 40, 60 + rng() * 30, 40 + rng() * 20, 0.5);
      ctx.fillRect(ibx, iby, 15 + rng() * 30, 15 + rng() * 30);
      // 工厂灯光
      ctx.fillStyle = rgba(255, 180 + rng() * 75, 50, 0.7);
      ctx.fillRect(ibx + rng() * 10, iby + rng() * 10, 2, 2);
    }
    // 烟雾/污染大气层
    for (var sm = 0; sm < 10; sm++) {
      ctx.beginPath();
      ctx.ellipse(rng() * S, rng() * S, 50 + rng() * 80, 15 + rng() * 25, rng() * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(150, 120, 80, 0.12 + rng() * 0.08);
      ctx.fill();
    }
    // 棕色大气边缘
    var indGrad = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.52);
    indGrad.addColorStop(0, 'rgba(180, 130, 70, 0)');
    indGrad.addColorStop(1, 'rgba(180, 130, 70, 0.2)');
    ctx.fillStyle = indGrad;
    ctx.fillRect(0, 0, S, S);
    mat.specularPower = 20;
    mat.specularColor = new BABYLON.Color3(0.2, 0.15, 0.1);

  } else if (type === 'energy') {
    // 能源星：气态巨行星，木星式横纹色带 + 大红斑式风暴
    // 渐变底色
    for (var ey = 0; ey < S; ey++) {
      var ef = ey / S;
      ctx.fillStyle = rgba(R + Math.sin(ef * 12) * 30, G + Math.cos(ef * 8) * 25, B - 20 + ef * 40, 1);
      ctx.fillRect(0, ey, S, 1);
    }
    // 粗色带
    for (var eb = 0; eb < 16; eb++) {
      var eby = Math.floor(rng() * S);
      var ebh = 10 + Math.floor(rng() * 28);
      var edr = (rng() - 0.5) * 70, edg = (rng() - 0.5) * 60, edb = (rng() - 0.5) * 50;
      for (var epx = 0; epx < S; epx++) {
        var ew = Math.sin(epx * 0.03 + rng() * 2) * 6 + Math.sin(epx * 0.08) * 3;
        ctx.fillStyle = rgba(R + edr, G + edg, B + edb, 0.6);
        ctx.fillRect(epx, eby + ew, 1, ebh);
      }
    }
    // 大风暴斑
    for (var es = 0; es < 3; es++) {
      var esx = rng() * S, esy = rng() * S;
      var esrx = 15 + rng() * 35, esry = esrx * (0.4 + rng() * 0.3);
      ctx.beginPath();
      ctx.ellipse(esx, esy, esrx, esry, rng() * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(R + 50, G + 30, B - 20, 0.45);
      ctx.fill();
      // 风暴内部旋涡
      ctx.beginPath();
      ctx.ellipse(esx, esy, esrx * 0.6, esry * 0.6, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = rgba(R + 70, G + 50, B, 0.3);
      ctx.fill();
    }
    mat.specularPower = 8;
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

  } else if (type === 'research') {
    // 研究星：神秘绿色星球，浓密丛林 + 生物发光海洋 + 迷雾
    ctx.fillStyle = rgba(15, 60, 30, 1);
    ctx.fillRect(0, 0, S, S);
    // 丛林/生物区域
    for (var rb = 0; rb < 50; rb++) {
      var rbx = rng() * S, rby = rng() * S;
      ctx.beginPath();
      ctx.arc(rbx, rby, 5 + rng() * 20, 0, Math.PI * 2);
      ctx.fillStyle = rgba(30 + rng() * 60, 100 + rng() * 100, 30 + rng() * 50, 0.4);
      ctx.fill();
    }
    // 生物发光海洋区域
    for (var rl = 0; rl < 6; rl++) {
      var rlx = rng() * S, rly = rng() * S;
      ctx.beginPath();
      ctx.ellipse(rlx, rly, 30 + rng() * 60, 20 + rng() * 40, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = rgba(20, 180 + rng() * 60, 140 + rng() * 60, 0.25);
      ctx.fill();
    }
    // 发光孢子/萤火点
    for (var rs = 0; rs < 40; rs++) {
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, 0.5 + rng() * 2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(100 + rng() * 100, 255, 100 + rng() * 100, 0.5 + rng() * 0.5);
      ctx.fill();
    }
    // 迷雾
    for (var rf = 0; rf < 6; rf++) {
      ctx.beginPath();
      ctx.ellipse(rng() * S, rng() * S, 60 + rng() * 80, 15 + rng() * 20, rng() * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(80, 200, 120, 0.06 + rng() * 0.06);
      ctx.fill();
    }
    mat.specularPower = 25;
    mat.specularColor = new BABYLON.Color3(0.2, 0.35, 0.2);

  } else if (type === 'special') {
    // 特殊星：异星球，灰蓝基调 + 几何结构 + 神秘光芒
    ctx.fillStyle = rgba(60, 70, 85, 1);
    ctx.fillRect(0, 0, S, S);
    // 异常地形（多角形晶体结构）
    for (var sc = 0; sc < 12; sc++) {
      var scx = rng() * S, scy = rng() * S, scn = 4 + Math.floor(rng() * 4);
      ctx.beginPath();
      for (var sp = 0; sp < scn; sp++) {
        var sa = (sp / scn) * Math.PI * 2;
        var sr2 = 10 + rng() * 30;
        var px = scx + Math.cos(sa) * sr2, py = scy + Math.sin(sa) * sr2;
        sp === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(R + (rng() - 0.5) * 60, G + (rng() - 0.5) * 60, B + (rng() - 0.5) * 60, 0.4);
      ctx.fill();
      ctx.strokeStyle = rgba(R + 50, G + 50, B + 50, 0.25);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 神秘发光裂纹
    for (var sl = 0; sl < 5; sl++) {
      ctx.beginPath();
      var slx = rng() * S, sly = rng() * S;
      ctx.moveTo(slx, sly);
      for (var sls = 0; sls < 4; sls++) {
        slx += (rng() - 0.5) * 80;
        sly += (rng() - 0.5) * 60;
        ctx.lineTo(slx, sly);
      }
      ctx.strokeStyle = rgba(180, 200, 255, 0.4 + rng() * 0.3);
      ctx.lineWidth = 1 + rng() * 2;
      ctx.stroke();
      // 光芒扩散
      ctx.strokeStyle = rgba(150, 180, 230, 0.1);
      ctx.lineWidth += 6;
      ctx.stroke();
    }
    // 能量脉冲点
    for (var se = 0; se < 8; se++) {
      var sex = rng() * S, sey = rng() * S, ser = 3 + rng() * 8;
      var grad = ctx.createRadialGradient(sex, sey, 0, sex, sey, ser);
      grad.addColorStop(0, rgba(200, 220, 255, 0.6));
      grad.addColorStop(1, rgba(200, 220, 255, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(sex - ser, sey - ser, ser * 2, ser * 2);
    }
    mat.specularPower = 50;
    mat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.5);

  } else {
    // Fallback: 简单岩石
    for (var ft = 0; ft < 40; ft++) {
      ctx.fillStyle = rgba(R + (rng() - 0.5) * 50, G + (rng() - 0.5) * 50, B + (rng() - 0.5) * 50, 0.5);
      ctx.fillRect(rng() * S, rng() * S, 10 + rng() * 30, 10 + rng() * 30);
    }
    mat.specularPower = 30;
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
  }

  dtex.update();
  mat.diffuseTexture = dtex;
  mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  mat.emissiveColor = color.scale(0.3);
  return mat;
}

function _hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h = h & 0x7fffffff;
  }
  return h || 1;
}

// ---------------------------------------------------------------------------
// 势力边界渲染（领地光环 + 桥接平面）
// ---------------------------------------------------------------------------

function _renderFactionBoundaries(planets) {
  const quality = _QUALITY_SETTINGS[_qualityLevel];
  if (!quality.enableBoundaries) return;

  const posMap = new Map();
  _planetMetadata.forEach(m => posMap.set(m.id, m));

  const factionPlanets = {};
  planets.forEach(planet => {
    if (planet.owner && planet.owner !== 'player') {
      if (!factionPlanets[planet.owner]) factionPlanets[planet.owner] = [];
      factionPlanets[planet.owner].push(planet);
    }
  });

  const ADJACENCY_DIST = 0.15;
  const AURA_RADIUS = 12;

  Object.entries(factionPlanets).forEach(([factionId, fPlanets]) => {
    const faction = FACTIONS.find(f => f.id === factionId);
    if (!faction) return;

    // 1) Translucent disc aura under each faction planet — use planet's own color
    fPlanets.forEach(planet => {
      const meta = posMap.get(planet.id);
      if (!meta) return;

      // Use planet color instead of faction color for visual consistency
      const pColor = meta.color || BABYLON.Color3.FromHexString(faction.color || '#4FC3F7');

      const disc = BABYLON.MeshBuilder.CreateDisc('aura_' + planet.id, {
        radius: AURA_RADIUS, tessellation: 48, sideOrientation: BABYLON.Mesh.DOUBLESIDE,
      }, _scene);
      disc.rotation.x = Math.PI / 2;
      disc.position = new BABYLON.Vector3(meta.position.x, meta.position.y - 0.5, meta.position.z);

      const discMat = new BABYLON.StandardMaterial('auraMat_' + planet.id, _scene);
      discMat.emissiveColor = pColor;
      discMat.disableLighting = true;
      discMat.alpha = 0.10;
      discMat.backFaceCulling = false;
      disc.material = discMat;
      disc.isPickable = false;
      _factionBoundaries.push(disc);
    });

    // 2) Bridge planes between adjacent same-faction planets
    for (let i = 0; i < fPlanets.length; i++) {
      for (let j = i + 1; j < fPlanets.length; j++) {
        const a = fPlanets[i], b = fPlanets[j];
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= ADJACENCY_DIST) continue;

        const posA = posMap.get(a.id)?.position;
        const posB = posMap.get(b.id)?.position;
        if (!posA || !posB) continue;

        const midPoint = posA.add(posB).scale(0.5);
        const direction = posB.subtract(posA);
        const length = direction.length();

        const bridge = BABYLON.MeshBuilder.CreatePlane('bridge_' + a.id + '_' + b.id, {
          width: length, height: AURA_RADIUS * 1.2,
          sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        }, _scene);
        bridge.position = new BABYLON.Vector3(midPoint.x, midPoint.y - 0.5, midPoint.z);
        bridge.rotation.x = Math.PI / 2;
        bridge.rotation.z = -Math.atan2(direction.z, direction.x);

        // Blend colors of both endpoint planets for bridge
        const metaA = posMap.get(a.id);
        const metaB = posMap.get(b.id);
        const bridgeColor = (metaA && metaB)
          ? BABYLON.Color3.Lerp(metaA.color, metaB.color, 0.5)
          : BABYLON.Color3.FromHexString(faction.color || '#4FC3F7');
        const bridgeMat = new BABYLON.StandardMaterial('bridgeMat_' + a.id + '_' + b.id, _scene);
        bridgeMat.emissiveColor = bridgeColor;
        bridgeMat.disableLighting = true;
        bridgeMat.alpha = 0.06;
        bridgeMat.backFaceCulling = false;
        bridge.material = bridgeMat;
        bridge.isPickable = false;
        _factionBoundaries.push(bridge);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 连接线渲染
// ---------------------------------------------------------------------------

function _renderConnections(planets) {
  const posMap = new Map();
  _planetMetadata.forEach(m => posMap.set(m.id, m.position));

  for (let i = 0; i < planets.length; i++) {
    const a = planets[i];
    const posA = posMap.get(a.id);
    if (!posA) continue;

    for (let j = i + 1; j < planets.length; j++) {
      const b = planets[j];
      const dx = a.position.x - b.position.x;
      const dy = a.position.y - b.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.12) {
        const posB = posMap.get(b.id);
        if (!posB) continue;

        const line = BABYLON.MeshBuilder.CreateLines('conn_' + a.id + '_' + b.id, {
          points: [posA, posB],
          updatable: false,
        }, _scene);
        line.color = new BABYLON.Color3(0.22, 0.74, 0.97);
        line.alpha = 0.15;
        line.isPickable = false;
        _connectionLines.push(line);
      }
    }
  }
}

function _renderSecretRoutes(state) {
  var routes = Exploration.getCurrentSystemSecretRoutes(state);
  if (!routes || routes.length === 0) return;

  const posMap = new Map();
  const metaMap = new Map();
  _planetMetadata.forEach(function (meta) {
    posMap.set(meta.id, meta.position);
    metaMap.set(meta.id, meta);
  });

  const sourcePos = posMap.get(state.currentSystem);
  const sourceMeta = metaMap.get(state.currentSystem);
  if (!sourcePos || !sourceMeta) return;

  routes.forEach(function (route, index) {
    const targetPos = posMap.get(route.targetSystemId);
    const targetMeta = metaMap.get(route.targetSystemId);
    if (!targetPos || !targetMeta) return;

    const curve = _createArcCurve(sourcePos, targetPos, 40);
    const points = curve.getPoints();
    const routeLine = BABYLON.MeshBuilder.CreateDashedLines('secretRoute_' + route.id, {
      points: points,
      dashSize: 2.0,
      gapSize: 1.3,
      dashNb: 46,
    }, _scene);
    routeLine.color = new BABYLON.Color3(0.49, 0.83, 0.99);
    routeLine.alpha = 0.7;
    routeLine.isPickable = false;
    _connectionLines.push(routeLine);

    const targetRing = BABYLON.MeshBuilder.CreateTorus('secretRouteTarget_' + route.id, {
      diameter: Math.max((targetMeta.size + 0.9) * 2, 4.5),
      thickness: 0.12,
      tessellation: 32,
    }, _scene);
    targetRing.position = targetPos.clone();
    targetRing.rotation.x = Math.PI / 2;
    const ringMat = new BABYLON.StandardMaterial('secretRouteTargetMat_' + route.id, _scene);
    ringMat.emissiveColor = new BABYLON.Color3(0.49, 0.83, 0.99);
    ringMat.disableLighting = true;
    ringMat.alpha = 0.45;
    targetRing.material = ringMat;
    targetRing.isPickable = false;
    _connectionLines.push(targetRing);

    const labelAnchor = BABYLON.Vector3.Lerp(sourcePos, targetPos, 0.62);
    labelAnchor.y += Math.max(BABYLON.Vector3.Distance(sourcePos, targetPos) * 0.08, 3.2) + index * 1.2;
    const label = _addTextLabel('暗线→' + route.targetSystemName + ' -' + route.discountPercent + '%', labelAnchor, Math.max(13, route.targetSystemName.length * 1.4 + 9));

    _secretRouteVisuals.push({
      routeId: route.id,
      targetSystemId: route.targetSystemId,
      line: routeLine,
      ring: targetRing,
      ringMaterial: ringMat,
      label: label,
      baseLabelScale: label.scaling.clone(),
      baseLabelY: label.position.y,
    });
  });
}

function _updateSecretRouteHighlights(time) {
  if (_secretRouteVisuals.length === 0) return;

  const hoveredId = _hoveredPlanet ? _hoveredPlanet.id : null;
  const pulse = 1 + Math.sin(time * 0.006) * 0.08;

  _secretRouteVisuals.forEach(function (visual) {
    const active = hoveredId != null && visual.targetSystemId === hoveredId;

    if (visual.line) {
      visual.line.alpha = active ? 0.95 : 0.7;
      visual.line.color = active
        ? new BABYLON.Color3(0.96, 0.99, 1.0)
        : new BABYLON.Color3(0.49, 0.83, 0.99);
    }

    if (visual.ring && visual.ringMaterial) {
      visual.ringMaterial.emissiveColor = active
        ? new BABYLON.Color3(0.96, 0.99, 1.0)
        : new BABYLON.Color3(0.49, 0.83, 0.99);
      visual.ringMaterial.alpha = active ? 0.92 : 0.45;
      const ringScale = active ? pulse * 1.14 : 1;
      visual.ring.scaling = new BABYLON.Vector3(ringScale, ringScale, ringScale);
    }

    if (visual.label && visual.label.material) {
      visual.label.material.emissiveColor = active
        ? new BABYLON.Color3(1, 1, 1)
        : new BABYLON.Color3(1, 1, 1);
      visual.label.material.alpha = active ? 1 : 0.82;
      const labelScale = active ? pulse * 1.06 : 1;
      visual.label.scaling = new BABYLON.Vector3(
        visual.baseLabelScale.x * labelScale,
        visual.baseLabelScale.y * labelScale,
        visual.baseLabelScale.z * labelScale
      );
      visual.label.position.y = visual.baseLabelY + (active ? Math.sin(time * 0.008) * 0.35 : 0);
    }
  });
}

// ---------------------------------------------------------------------------
// 派遣航线可视化
// ---------------------------------------------------------------------------

function _getDispatchCurrentSystemId(state, ship, isActive) {
  if (isActive) return state.currentSystem;
  return ship.location || state.currentSystem;
}

function _resolveDispatchRouteState(route, currentSystemId) {
  const sameSystemRoute = route.buySystemId === route.sellSystemId;
  const atBuySystem = currentSystemId === route.buySystemId;
  const atSellSystem = currentSystemId === route.sellSystemId;

  if (sameSystemRoute) {
    return {
      targetSystemId: currentSystemId,
      isTraveling: false,
      sameSystemRoute: true,
    };
  }

  let targetSystemId;
  if (atBuySystem) {
    targetSystemId = route.sellSystemId;
  } else if (atSellSystem) {
    targetSystemId = route.buySystemId;
  } else if (route.status === 'traveling_sell' || route.status === 'selling') {
    targetSystemId = route.sellSystemId;
  } else {
    targetSystemId = route.buySystemId;
  }

  const isTraveling =
    (route.status === 'traveling_buy' && !atBuySystem) ||
    (route.status === 'traveling_sell' && !atSellSystem);

  return {
    targetSystemId: targetSystemId,
    isTraveling: isTraveling,
    sameSystemRoute: false,
  };
}

function _createArcCurve(fromPos, toPos, segments) {
  const mid = BABYLON.Vector3.Lerp(fromPos, toPos, 0.5);
  const dist = BABYLON.Vector3.Distance(fromPos, toPos);
  mid.y += Math.max(dist * 0.15, 3);
  return BABYLON.Curve3.CreateQuadraticBezier(fromPos, mid, toPos, segments || 48);
}

function _renderDispatchRoutes(state) {
  if (!state.fleet || state.fleet.length < 1) return;

  const posMap = new Map();
  _planetMetadata.forEach(m => posMap.set(m.id, m.position));

  state.fleet.forEach(function (ship, idx) {
    if (!ship.route) return;

    // 当飞行动画进行中时，跳过活跃飞船的派遣航线（避免重复绘制）
    const isActive = idx === (state.activeShipIndex || 0);
    if (isActive && _flightPath) return;

    const currentSystemId = _getDispatchCurrentSystemId(state, ship, isActive);
    const currentPos = posMap.get(currentSystemId);
    if (!currentPos) return;

    const routeState = _resolveDispatchRouteState(ship.route, currentSystemId);
    const targetPos = posMap.get(routeState.targetSystemId);
    const hasTravelSegment = !!targetPos && currentSystemId !== routeState.targetSystemId;

    const routeColorHex = isActive ? '#22d3ee' : '#fbbf24';
    const routeColor = BABYLON.Color3.FromHexString(routeColorHex);

    let curve = null;
    let points = null;
    if (hasTravelSegment) {
      curve = _createArcCurve(currentPos, targetPos, 48);
      points = curve.getPoints();

      const routeLine = BABYLON.MeshBuilder.CreateDashedLines('dispatch_' + idx, {
        points: points,
        dashSize: 1.5,
        gapSize: 1.0,
        dashNb: 60,
      }, _scene);
      routeLine.color = routeColor;
      routeLine.alpha = 0.35;
      routeLine.isPickable = false;
      _dispatchRouteLines.push(routeLine);
    }

    // Ship model marker (type-specific)
    var shipTypeId = ship.typeId || 'shuttle';
    const shipModel = _createDispatchShipMesh(routeColor, shipTypeId);
    shipModel.metadata = shipModel.metadata || {};
    shipModel.metadata._phaseOffset = idx * 1.1;
    shipModel.position = currentPos.clone();

    if (targetPos && hasTravelSegment) {
      shipModel.lookAt(targetPos);
    }

    if (routeState.isTraveling && curve && points) {
      shipModel.metadata._dispatchCurve = curve;
      shipModel.metadata._direction = 1;
      shipModel.position = points[0].clone();

      // Trail (updatable lines)
      const trailPositions = [];
      const initPos = points[0];
      for (let ti = 0; ti < 30; ti++) {
        trailPositions.push(initPos.clone());
      }
      const trailLine = BABYLON.MeshBuilder.CreateLines('dispTrail_' + idx, {
        points: trailPositions,
        updatable: true,
      }, _scene);
      trailLine.color = routeColor;
      trailLine.alpha = 0.5;
      trailLine.isPickable = false;
      shipModel.metadata._trail = trailLine;
      shipModel.metadata._trailPositions = trailPositions;
      shipModel.metadata._trailHead = 0;
      _dispatchRouteLines.push(trailLine);
    }

    _dispatchShipMarkers.push(shipModel);
  });
}

function _createDispatchShipMesh(tintColor, typeId) {
  var v = _SHIP_VISUALS[typeId] || _SHIP_VISUALS.shuttle;
  var parent = new BABYLON.TransformNode('dispShip_' + Math.random(), _scene);
  var sc = v.scale * 0.7;

  // Body
  var body;
  if (typeId === 'freighter') {
    body = BABYLON.MeshBuilder.CreateBox('dShipBody', { width: v.bodyD * 1.0, height: v.bodyD * 0.6, depth: v.bodyH * 0.8 }, _scene);
  } else if (typeId === 'galleon') {
    body = BABYLON.MeshBuilder.CreateCylinder('dShipBody', { diameterTop: 0.15, diameterBottom: v.bodyD * 0.8, height: v.bodyH * 0.8, tessellation: 8 }, _scene);
    body.rotation.x = Math.PI / 2;
  } else if (typeId === 'clipper') {
    body = BABYLON.MeshBuilder.CreateCylinder('dShipBody', { diameterTop: 0, diameterBottom: v.bodyD * 0.8, height: v.bodyH * 0.8, tessellation: 4 }, _scene);
    body.rotation.x = Math.PI / 2;
  } else {
    body = BABYLON.MeshBuilder.CreateCylinder('dShipBody', { diameterTop: 0, diameterBottom: v.bodyD * 0.8, height: v.bodyH * 0.8, tessellation: 6 }, _scene);
    body.rotation.x = Math.PI / 2;
  }
  body.parent = parent;
  var bodyMat = new BABYLON.StandardMaterial('dShipBodyMat_' + Math.random(), _scene);
  bodyMat.diffuseColor = new BABYLON.Color3(v.bodyColor[0], v.bodyColor[1], v.bodyColor[2]);
  bodyMat.emissiveColor = tintColor.scale(0.15);
  body.material = bodyMat;
  body.isPickable = false;

  // Wings
  var wings = BABYLON.MeshBuilder.CreateBox('dShipWings', { width: v.wingW * 0.7, height: 0.04, depth: v.wingD * 0.7 }, _scene);
  wings.position.z = -0.15;
  wings.parent = parent;
  var wingMat = new BABYLON.StandardMaterial('dShipWingMat_' + Math.random(), _scene);
  wingMat.diffuseColor = new BABYLON.Color3(v.wingColor[0], v.wingColor[1], v.wingColor[2]);
  wingMat.emissiveColor = tintColor.scale(0.1);
  wings.material = wingMat;
  wings.isPickable = false;

  // Cockpit
  var cockpit = BABYLON.MeshBuilder.CreateSphere('dShipCockpit', { diameter: 0.25, segments: 6 }, _scene);
  cockpit.position = new BABYLON.Vector3(0, 0.1, 0.2);
  cockpit.parent = parent;
  var cockpitMat = new BABYLON.StandardMaterial('dShipCockpitMat_' + Math.random(), _scene);
  cockpitMat.emissiveColor = tintColor;
  cockpitMat.disableLighting = true;
  cockpitMat.alpha = 0.7;
  cockpit.material = cockpitMat;
  cockpit.isPickable = false;

  // Engine nozzles
  var engineMat = new BABYLON.StandardMaterial('dShipEngineMat_' + Math.random(), _scene);
  engineMat.emissiveColor = new BABYLON.Color3(v.engineColor[0], v.engineColor[1], v.engineColor[2]);
  engineMat.disableLighting = true;
  engineMat.alpha = 0.9;
  var flames = [];
  var nCount = v.engineCount;
  for (var ei = 0; ei < nCount; ei++) {
    var ex = nCount === 1 ? 0 : ((ei / (nCount - 1)) - 0.5) * v.wingW * 0.4;
    var eng = BABYLON.MeshBuilder.CreateSphere('dEng' + ei, { diameter: v.engineSize * 0.8, segments: 6 }, _scene);
    eng.position = new BABYLON.Vector3(ex, 0, -v.bodyH * 0.35);
    eng.parent = parent;
    eng.material = ei === 0 ? engineMat : engineMat.clone('dEngMat' + ei + '_' + Math.random());
    eng.isPickable = false;
    flames.push(eng);
  }

  parent.scaling = new BABYLON.Vector3(sc, sc, sc);
  parent.metadata = parent.metadata || {};
  parent.metadata._flames = flames;

  return parent;
}

// ---------------------------------------------------------------------------
// 选择环
// ---------------------------------------------------------------------------

function _createSelectionRing() {
  _selectionRing = BABYLON.MeshBuilder.CreateTorus('selectionRing', {
    diameter: 7, thickness: 0.5, tessellation: 32,
  }, _scene);
  _selectionRing.rotation.x = Math.PI / 2;

  const mat = new BABYLON.StandardMaterial('selectionRingMat', _scene);
  mat.emissiveColor = _COLORS.selected;
  mat.disableLighting = true;
  mat.alpha = 0.8;
  _selectionRing.material = mat;
  _selectionRing.isPickable = false;
  _selectionRing.setEnabled(false);
}

// ---------------------------------------------------------------------------
// 飞船系统
// ---------------------------------------------------------------------------

// Ship type visual configs
var _SHIP_VISUALS = {
  shuttle: {
    bodyColor: [0.82, 0.87, 0.93],
    wingColor: [0.55, 0.62, 0.75],
    engineColor: [0.2, 0.7, 1],
    trailColor: [0.2, 0.7, 1],
    scale: 1.3,
    bodyH: 1.3, bodyD: 0.5, wingW: 1.4, wingD: 0.4,
    engineCount: 1, engineSize: 0.22,
  },
  freighter: {
    bodyColor: [0.6, 0.55, 0.5],
    wingColor: [0.45, 0.42, 0.38],
    engineColor: [1, 0.5, 0.15],
    trailColor: [1, 0.5, 0.15],
    scale: 2.2,
    bodyH: 2.0, bodyD: 1.0, wingW: 2.0, wingD: 0.9,
    engineCount: 3, engineSize: 0.3,
  },
  clipper: {
    bodyColor: [0.9, 0.92, 0.97],
    wingColor: [0.7, 0.75, 0.85],
    engineColor: [0.3, 1, 0.6],
    trailColor: [0.3, 1, 0.6],
    scale: 1.5,
    bodyH: 1.8, bodyD: 0.4, wingW: 2.8, wingD: 0.35,
    engineCount: 2, engineSize: 0.2,
  },
  galleon: {
    bodyColor: [0.35, 0.25, 0.15],
    wingColor: [0.5, 0.35, 0.2],
    engineColor: [1, 0.3, 0.8],
    trailColor: [1, 0.3, 0.8],
    scale: 3.0,
    bodyH: 2.5, bodyD: 1.2, wingW: 3.0, wingD: 1.0,
    engineCount: 4, engineSize: 0.35,
  },
};

function _createShipMesh(typeId) {
  var v = _SHIP_VISUALS[typeId] || _SHIP_VISUALS.shuttle;
  var parent = new BABYLON.TransformNode('playerShip_' + typeId, _scene);

  // --- Body ---
  var body;
  if (typeId === 'freighter') {
    // Freighter: boxy cargo hull
    body = BABYLON.MeshBuilder.CreateBox('shipBody', {
      width: v.bodyD * 1.2, height: v.bodyD * 0.7, depth: v.bodyH,
    }, _scene);
  } else if (typeId === 'galleon') {
    // Galleon: large elongated hull with rounded front
    body = BABYLON.MeshBuilder.CreateCylinder('shipBody', {
      diameterTop: 0.2, diameterBottom: v.bodyD, height: v.bodyH, tessellation: 8,
    }, _scene);
    body.rotation.x = Math.PI / 2;
  } else if (typeId === 'clipper') {
    // Clipper: sleek narrow dart
    body = BABYLON.MeshBuilder.CreateCylinder('shipBody', {
      diameterTop: 0, diameterBottom: v.bodyD, height: v.bodyH, tessellation: 4,
    }, _scene);
    body.rotation.x = Math.PI / 2;
  } else {
    // Shuttle: small cone
    body = BABYLON.MeshBuilder.CreateCylinder('shipBody', {
      diameterTop: 0, diameterBottom: v.bodyD, height: v.bodyH, tessellation: 6,
    }, _scene);
    body.rotation.x = Math.PI / 2;
  }
  body.parent = parent;
  var bodyMat = new BABYLON.StandardMaterial('shipBodyMat', _scene);
  bodyMat.diffuseColor = new BABYLON.Color3(v.bodyColor[0], v.bodyColor[1], v.bodyColor[2]);
  bodyMat.emissiveColor = bodyMat.diffuseColor.scale(0.15);
  bodyMat.specularPower = 60;
  body.material = bodyMat;

  // --- Wings ---
  if (typeId === 'galleon') {
    // Galleon: dual-layer wings + spine
    var wingTop = BABYLON.MeshBuilder.CreateBox('shipWingT', { width: v.wingW, height: 0.06, depth: v.wingD }, _scene);
    wingTop.position = new BABYLON.Vector3(0, 0.25, -0.2);
    wingTop.parent = parent;
    var wingBot = BABYLON.MeshBuilder.CreateBox('shipWingB', { width: v.wingW * 0.8, height: 0.06, depth: v.wingD * 0.7 }, _scene);
    wingBot.position = new BABYLON.Vector3(0, -0.25, -0.3);
    wingBot.parent = parent;
    var spine = BABYLON.MeshBuilder.CreateBox('shipSpine', { width: 0.1, height: 0.5, depth: v.bodyH * 0.6 }, _scene);
    spine.position = new BABYLON.Vector3(0, 0, -0.4);
    spine.parent = parent;
    var wm = new BABYLON.StandardMaterial('shipWingMat', _scene);
    wm.diffuseColor = new BABYLON.Color3(v.wingColor[0], v.wingColor[1], v.wingColor[2]);
    wm.emissiveColor = wm.diffuseColor.scale(0.1);
    wingTop.material = wm; wingBot.material = wm; spine.material = wm;
  } else if (typeId === 'clipper') {
    // Clipper: swept-back delta wings
    var wingL = BABYLON.MeshBuilder.CreateBox('shipWingL', { width: v.wingW / 2, height: 0.04, depth: v.wingD }, _scene);
    wingL.position = new BABYLON.Vector3(-v.wingW / 4, 0, -0.3);
    wingL.rotation.y = 0.2;
    wingL.parent = parent;
    var wingR = BABYLON.MeshBuilder.CreateBox('shipWingR', { width: v.wingW / 2, height: 0.04, depth: v.wingD }, _scene);
    wingR.position = new BABYLON.Vector3(v.wingW / 4, 0, -0.3);
    wingR.rotation.y = -0.2;
    wingR.parent = parent;
    var wmc = new BABYLON.StandardMaterial('shipWingMat', _scene);
    wmc.diffuseColor = new BABYLON.Color3(v.wingColor[0], v.wingColor[1], v.wingColor[2]);
    wmc.emissiveColor = wmc.diffuseColor.scale(0.1);
    wingL.material = wmc; wingR.material = wmc;
  } else if (typeId === 'freighter') {
    // Freighter: small stabilizer fins
    var finL = BABYLON.MeshBuilder.CreateBox('shipFinL', { width: v.wingW / 2, height: 0.08, depth: v.wingD }, _scene);
    finL.position = new BABYLON.Vector3(-v.wingW / 4, 0, -v.bodyH * 0.3);
    finL.parent = parent;
    var finR = BABYLON.MeshBuilder.CreateBox('shipFinR', { width: v.wingW / 2, height: 0.08, depth: v.wingD }, _scene);
    finR.position = new BABYLON.Vector3(v.wingW / 4, 0, -v.bodyH * 0.3);
    finR.parent = parent;
    // Cargo pods
    var podL = BABYLON.MeshBuilder.CreateBox('shipPodL', { width: 0.3, height: 0.4, depth: v.bodyH * 0.6 }, _scene);
    podL.position = new BABYLON.Vector3(-0.5, -0.2, 0);
    podL.parent = parent;
    var podR = BABYLON.MeshBuilder.CreateBox('shipPodR', { width: 0.3, height: 0.4, depth: v.bodyH * 0.6 }, _scene);
    podR.position = new BABYLON.Vector3(0.5, -0.2, 0);
    podR.parent = parent;
    var wm2 = new BABYLON.StandardMaterial('shipWingMat', _scene);
    wm2.diffuseColor = new BABYLON.Color3(v.wingColor[0], v.wingColor[1], v.wingColor[2]);
    wm2.emissiveColor = wm2.diffuseColor.scale(0.1);
    finL.material = wm2; finR.material = wm2; podL.material = wm2; podR.material = wm2;
  } else {
    // Shuttle: simple wings
    var wings = BABYLON.MeshBuilder.CreateBox('shipWings', { width: v.wingW, height: 0.05, depth: v.wingD }, _scene);
    wings.position.z = -0.15;
    wings.parent = parent;
    var wmS = new BABYLON.StandardMaterial('shipWingMat', _scene);
    wmS.diffuseColor = new BABYLON.Color3(v.wingColor[0], v.wingColor[1], v.wingColor[2]);
    wmS.emissiveColor = wmS.diffuseColor.scale(0.1);
    wings.material = wmS;
  }

  // --- Cockpit ---
  var cockpitSize = typeId === 'galleon' ? 0.5 : (typeId === 'freighter' ? 0.45 : 0.35);
  var cockpit = BABYLON.MeshBuilder.CreateSphere('shipCockpit', { diameter: cockpitSize, segments: 8 }, _scene);
  cockpit.position = new BABYLON.Vector3(0, 0.12, v.bodyH * 0.25);
  cockpit.parent = parent;
  var cockpitMat = new BABYLON.StandardMaterial('shipCockpitMat', _scene);
  cockpitMat.emissiveColor = new BABYLON.Color3(v.engineColor[0], v.engineColor[1], v.engineColor[2]);
  cockpitMat.disableLighting = true;
  cockpitMat.alpha = 0.7;
  cockpit.material = cockpitMat;

  // --- Engine nozzles ---
  var engineMat = new BABYLON.StandardMaterial('shipEngineMat', _scene);
  engineMat.emissiveColor = new BABYLON.Color3(v.engineColor[0], v.engineColor[1], v.engineColor[2]);
  engineMat.disableLighting = true;
  engineMat.alpha = 0.9;
  var flames = [];
  var nCount = v.engineCount;
  for (var ei = 0; ei < nCount; ei++) {
    var ex = nCount === 1 ? 0 : ((ei / (nCount - 1)) - 0.5) * v.wingW * 0.5;
    var eng = BABYLON.MeshBuilder.CreateSphere('shipEng' + ei, { diameter: v.engineSize, segments: 6 }, _scene);
    eng.position = new BABYLON.Vector3(ex, 0, -v.bodyH * 0.45);
    eng.parent = parent;
    eng.material = ei === 0 ? engineMat : engineMat.clone('shipEngineMat' + ei);
    flames.push(eng);
  }

  parent.scaling = new BABYLON.Vector3(v.scale, v.scale, v.scale);
  parent.metadata = { _flames: flames, _shipType: typeId };

  parent.getChildMeshes().forEach(m => { m.isPickable = false; });

  return parent;
}

function _createShipTrail(typeId) {
  var count = 60;
  var positions = [];
  for (var i = 0; i < count; i++) {
    positions.push(new BABYLON.Vector3(0, 0, 0));
  }
  var trail = BABYLON.MeshBuilder.CreateLines('shipTrail', {
    points: positions,
    updatable: true,
  }, _scene);
  var v = _SHIP_VISUALS[typeId] || _SHIP_VISUALS.shuttle;
  trail.color = new BABYLON.Color3(v.trailColor[0], v.trailColor[1], v.trailColor[2]);
  trail.alpha = 0.6;
  trail.isPickable = false;
  trail.metadata = { _count: count, _head: 0, _positions: positions };
  return trail;
}

function _pushTrailPoint(trail, positions, head, position) {
  if (!trail || !positions || positions.length === 0) return head;
  positions[head] = position.clone();
  const nextHead = (head + 1) % positions.length;

  const orderedPoints = [];
  for (let i = 0; i < positions.length; i++) {
    const idx = (nextHead + i) % positions.length;
    orderedPoints.push(positions[idx]);
  }

  try {
    BABYLON.MeshBuilder.CreateLines(null, {
      points: orderedPoints,
      instance: trail,
    });
  } catch (e) {
    // ignore update errors on disposed mesh
  }

  return nextHead;
}

function _updateShipTrail(position) {
  if (!_shipTrail || !_shipTrail.metadata) return;
  const meta = _shipTrail.metadata;
  meta._head = _pushTrailPoint(_shipTrail, meta._positions, meta._head, position);
}

export function flyShipTo(fromId, toId, onComplete, shipTypeId, flightMeta) {
  if (_mapView !== 'planets') return;
  if (fromId === toId) {
    _clearFlightVisuals();
    if (_shipTrail) _shipTrail.setEnabled(false);
    if (_shipMesh) _shipMesh.setEnabled(false);
    _shipVisible = false;
    _dirty = true;
    if (onComplete) onComplete();
    return;
  }

  const fromMeta = _planetMetadata.find(m => m.id === fromId);
  const toMeta = _planetMetadata.find(m => m.id === toId);
  if (!fromMeta || !toMeta) {
    if (onComplete) onComplete();
    return;
  }

  const from = fromMeta.position.clone();
  const to = toMeta.position.clone();

  // Arc flight path
  const mid = BABYLON.Vector3.Lerp(from, to, 0.5);
  const dist = BABYLON.Vector3.Distance(from, to);
  mid.y += Math.max(dist * 0.2, 5);

  const curve = BABYLON.Curve3.CreateQuadraticBezier(from, mid, to, 80);

  // --- Flight route line (trajectory) ---
  _clearFlightVisuals();
  const routePoints = curve.getPoints();
  _flightRouteLine = BABYLON.MeshBuilder.CreateDashedLines('flightRoute', {
    points: routePoints,
    dashSize: 2,
    gapSize: 1,
    dashNb: 80,
  }, _scene);
  _flightRouteLine.color = new BABYLON.Color3(0.4, 0.91, 0.98);
  _flightRouteLine.alpha = 0.5;
  _flightRouteLine.isPickable = false;

  // --- Target planet selection glow ---
  const targetSize = toMeta.size || toMeta.baseSize || 2.5;
  _flightTargetGlow = BABYLON.MeshBuilder.CreateTorus('flightTargetGlow', {
    diameter: (targetSize + 1.5) * 2,
    thickness: 0.4,
    tessellation: 36,
  }, _scene);
  _flightTargetGlow.rotation.x = Math.PI / 2;
  _flightTargetGlow.position = to.clone();
  const tGlowMat = new BABYLON.StandardMaterial('flightTargetGlowMat', _scene);
  tGlowMat.emissiveColor = new BABYLON.Color3(1, 0.85, 0.2);
  tGlowMat.disableLighting = true;
  tGlowMat.alpha = 0.85;
  _flightTargetGlow.material = tGlowMat;
  _flightTargetGlow.isPickable = false;

  // --- Create ship mesh (type-specific) ---
  var typeId = shipTypeId || 'shuttle';
  if (_shipMesh && _currentShipType !== typeId) {
    _shipMesh.getChildMeshes().forEach(c => { if (c.material) c.material.dispose(); c.dispose(); });
    _shipMesh.dispose();
    _shipMesh = null;
  }
  if (!_shipMesh) {
    _shipMesh = _createShipMesh(typeId);
    _currentShipType = typeId;
  }
  if (!_shipTrail) {
    _shipTrail = _createShipTrail(typeId);
  }

  _shipMesh.setEnabled(true);
  _shipTrail.setEnabled(true);
  _shipVisible = true;
  _shipMesh.position = from.clone();

  // Reset trail
  const trailMeta = _shipTrail.metadata;
  for (let i = 0; i < trailMeta._count; i++) {
    trailMeta._positions[i] = from.clone();
  }
  trailMeta._head = 0;

  // Slower flight: 4x longer duration
  const duration = Math.min(12000, Math.max(5000, dist * 100));

  _flightPath = {
    curve,
    points: routePoints,
    fromId,
    toId,
    duration,
    startTime: performance.now(),
    onComplete: onComplete || null,
    shipTypeId: typeId,
    shipIndex: flightMeta && typeof flightMeta.shipIndex === 'number' ? flightMeta.shipIndex : 0,
    routeRevision: flightMeta && flightMeta.routeRevision != null ? flightMeta.routeRevision : null,
  };

  _cameraTarget = null;
}

export function isShipFlying() {
  return !!_flightPath;
}

export function cancelShipFlight() {
  _flightPath = null;
  _clearFlightVisuals();
  if (_shipTrail) _shipTrail.setEnabled(false);
  if (_shipMesh) _shipMesh.setEnabled(false);
  _shipVisible = false;
  _dirty = true;
}

function _clearFlightVisuals() {
  if (_flightRouteLine) { _flightRouteLine.dispose(); _flightRouteLine = null; }
  if (_flightTargetGlow) {
    if (_flightTargetGlow.material) _flightTargetGlow.material.dispose();
    _flightTargetGlow.dispose();
    _flightTargetGlow = null;
  }
}

function _updateShipFlight(time) {
  if (!_flightPath || !_shipMesh) return;

  const elapsed = time - _flightPath.startTime;
  let t = Math.min(elapsed / _flightPath.duration, 1);
  // Ease in-out
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const points = _flightPath.points;
  const idx = Math.min(Math.floor(eased * (points.length - 1)), points.length - 1);
  const pos = points[idx];

  _shipMesh.position = pos.clone();

  // Orient ship along tangent
  const nextIdx = Math.min(idx + 1, points.length - 1);
  if (nextIdx !== idx) {
    const tangent = points[nextIdx].subtract(points[idx]).normalize();
    const lookTarget = pos.add(tangent.scale(5));
    _shipMesh.lookAt(lookTarget);
  }

  _updateShipTrail(pos);

  // Animate engine flames (type-specific effects)
  if (_shipMesh.metadata && _shipMesh.metadata._flames) {
    var shipType = _shipMesh.metadata._shipType || 'shuttle';
    var flicker, flickerScale;
    if (shipType === 'clipper') {
      // Clipper: fast pulsing green-tinted trail
      flicker = 0.6 + Math.sin(elapsed * 0.04) * 0.2 + Math.random() * 0.15;
      flickerScale = flicker * 1.3;
    } else if (shipType === 'galleon') {
      // Galleon: big steady flames
      flicker = 0.7 + Math.sin(elapsed * 0.01) * 0.1 + Math.random() * 0.05;
      flickerScale = flicker * 1.5;
    } else if (shipType === 'freighter') {
      // Freighter: moderate steady burn
      flicker = 0.55 + Math.sin(elapsed * 0.015) * 0.12 + Math.random() * 0.08;
      flickerScale = flicker * 1.2;
    } else {
      // Shuttle: normal
      flicker = 0.5 + Math.sin(elapsed * 0.02) * 0.15 + Math.random() * 0.1;
      flickerScale = flicker;
    }
    _shipMesh.metadata._flames.forEach(f => {
      f.scaling = new BABYLON.Vector3(flickerScale, flickerScale, flickerScale);
    });
  }

  // Animate flight route line fade
  if (_flightRouteLine) {
    _flightRouteLine.alpha = 0.5 * (1 - t * 0.6);
  }
  // Animate target glow
  if (_flightTargetGlow) {
    var pulse = 1 + Math.sin(elapsed * 0.005) * 0.15;
    _flightTargetGlow.scaling.set(pulse, pulse, pulse);
    _flightTargetGlow.rotation.z += 0.015;
  }

  if (t >= 1) {
    const cb = _flightPath.onComplete;
    _flightPath = null;
    _clearFlightVisuals();
    if (_shipTrail) _shipTrail.setEnabled(false);
    _dirty = true;

    setTimeout(() => {
      if (_shipMesh) _shipMesh.setEnabled(false);
      _shipVisible = false;
    }, 500);

    if (cb) cb();
  }
}

// ---------------------------------------------------------------------------
// 相机控制
// ---------------------------------------------------------------------------

export function focusPlanet(planetId, smooth = true) {
  const metadata = _planetMetadata.find(m => m.id === planetId);
  if (!metadata) return;

  if (smooth) {
    _cameraTarget = metadata.position.clone();
    _cameraTransitionProgress = 0;
  } else {
    _camera.setTarget(metadata.position);
  }
}

export function resetCamera() {
  _cameraTarget = new BABYLON.Vector3(0, 0, 0);
  _cameraTransitionProgress = 0;
}

// ---------------------------------------------------------------------------
// 动画循环
// ---------------------------------------------------------------------------

let _renderLoopFn = null;

function _startAnimation() {
  if (_renderLoopFn) return;

  _renderLoopFn = () => {
    const time = Date.now() * 0.001;

    // Camera transition
    if (_cameraTarget && _cameraTransitionProgress < 1) {
      _cameraTransitionProgress += 0.02;
      const currentTarget = _camera.target;
      _camera.setTarget(BABYLON.Vector3.Lerp(currentTarget, _cameraTarget, 0.05));
      if (_cameraTransitionProgress >= 1) {
        _cameraTarget = null;
      }
    }

    // Current system glow pulse (only affects the glow halo, not the planet mesh)
    // Planet meshes remain static to avoid wobbling

    // Scale planets and labels based on camera distance
    if (_mapView === 'planets' && _camera) {
      const camRadius = _camera.radius;
      // At radius 250 (default) scale=1, zoom in → smaller, zoom out → larger
      const scaleFactor = camRadius / 250;
      _planetMetadata.forEach(meta => {
        if (meta.mesh) {
          const s = meta.baseSize * scaleFactor;
          meta.mesh.scaling.set(s, s, s);
        }
        if (meta.label) {
          const ls = scaleFactor;
          meta.label.scaling.set(ls, ls, ls);
          // Keep label above planet
          meta.label.position.y = meta.position.y + meta.baseSize * scaleFactor + 2.0 * scaleFactor;
        }
      });
    }

    // Slowly rotate galaxy meshes in galaxy view
    if (_motionLevel !== 'off' && _mapView === 'galaxies') {
      const rotSpeed = _motionLevel === 'reduced' ? 0.002 : 0.005;
      _galaxyMeshes.forEach(node => {
        node.rotation.y += rotSpeed;
      });
    }

    // Rotate background slowly
    if (_backgroundLayers && _motionLevel !== 'off') {
      const speed = _motionLevel === 'reduced' ? 0.0001 : 0.0003;
      if (_backgroundLayers.stars && _backgroundLayers.stars.rotation) {
        _backgroundLayers.stars.rotation.y += speed;
      }
      if (_backgroundLayers.nebula) {
        _backgroundLayers.nebula.rotation.y += speed * 0.5;
      }
    }

    // Update ship flight
    _updateShipFlight(performance.now());

    // Update dispatch ship markers
    _dispatchShipMarkers.forEach(function (marker) {
      if (!marker.metadata || !marker.metadata._dispatchCurve) return;
      const phase = marker.metadata._phaseOffset || 0;
      let prog = (((time + phase) % 8) / 8);
      let eased = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;
      if (marker.metadata._direction < 0) eased = 1 - eased;

      const curvePoints = marker.metadata._dispatchCurve.getPoints();
      const idx = Math.min(Math.floor(eased * (curvePoints.length - 1)), curvePoints.length - 1);
      const pos = curvePoints[idx];
      marker.position = pos.clone();

      // Orient ship
      const nextIdx = Math.min(idx + 1, curvePoints.length - 1);
      if (nextIdx !== idx) {
        const tangent = curvePoints[nextIdx].subtract(curvePoints[idx]).normalize();
        if (marker.metadata._direction < 0) tangent.scaleInPlace(-1);
        const lookTarget = pos.add(tangent.scale(5));
        marker.lookAt(lookTarget);
      }

      // Animate engine flames
      if (marker.metadata._flames) {
        const flicker = 0.5 + Math.sin(time * 8 + phase) * 0.15 + Math.random() * 0.1;
        marker.metadata._flames.forEach(f => {
          f.scaling = new BABYLON.Vector3(flicker, flicker, flicker);
        });
      }

      // Update trail
      const trail = marker.metadata._trail;
      if (trail && marker.metadata._trailPositions) {
        const trailPos = marker.metadata._trailPositions;
        const head = marker.metadata._trailHead;
        marker.metadata._trailHead = _pushTrailPoint(trail, trailPos, head, pos);
      }
    });

    // Update selection ring
    if (_selectionRing && _selectionRing.isEnabled()) {
      _selectionRing.rotation.z += 0.01;
      const s = 1 + Math.sin(time * 3) * 0.1;
      _selectionRing.scaling = new BABYLON.Vector3(s, s, s);
    }

    _updateSecretRouteHighlights(time);

    _scene.render();
  };

  _engine.runRenderLoop(_renderLoopFn);
}

function _stopAnimation() {
  if (_renderLoopFn) {
    _engine.stopRenderLoop(_renderLoopFn);
    _renderLoopFn = null;
  }
}

// ---------------------------------------------------------------------------
// 事件处理
// ---------------------------------------------------------------------------

function _onPointerMove(event) {
  if (!_scene || !_isActive) return;

  const pickResult = _scene.pick(event.offsetX, event.offsetY);

  _hoveredPlanet = null;

  // Galaxy view: check galaxy meshes
  if (_mapView === 'galaxies') {
    if (pickResult.hit && pickResult.pickedMesh) {
      let mesh = pickResult.pickedMesh;
      // Walk up to find metadata with type='galaxy'
      while (mesh) {
        if (mesh.metadata && mesh.metadata.type === 'galaxy') {
          _canvas.style.cursor = 'pointer';
          if (window._mapHoverCallback) {
            window._mapHoverCallback({ type: 'galaxy', id: mesh.metadata.id, ...mesh.metadata.data });
          }
          return;
        }
        mesh = mesh.parent;
      }
    }
    _canvas.style.cursor = 'default';
    if (window._mapHoverCallback) {
      window._mapHoverCallback(null);
    }
    return;
  }

  // Planet view: check individual planet meshes
  if (pickResult.hit && pickResult.pickedMesh && pickResult.pickedMesh.metadata && pickResult.pickedMesh.metadata.type === 'planet') {
    const metadata = _planetMetadata.find(m => m.id === pickResult.pickedMesh.metadata.id);

    if (metadata) {
      _hoveredPlanet = metadata;
      _canvas.style.cursor = 'pointer';
      if (window._mapHoverCallback) {
        window._mapHoverCallback({ type: 'system', id: metadata.id });
      }
      return;
    }
  }

  _canvas.style.cursor = 'default';
  if (window._mapHoverCallback) {
    window._mapHoverCallback(null);
  }
}

function _onClick(event) {
  if (!_scene || !_isActive) return;

  const pickResult = _scene.pick(event.offsetX, event.offsetY);

  // Galaxy view: click on galaxy
  if (_mapView === 'galaxies') {
    if (pickResult.hit && pickResult.pickedMesh) {
      let mesh = pickResult.pickedMesh;
      while (mesh) {
        if (mesh.metadata && mesh.metadata.type === 'galaxy') {
          if (window._galaxyClickCallback) {
            window._galaxyClickCallback(mesh.metadata.id);
          }
          return;
        }
        mesh = mesh.parent;
      }
    }
    return;
  }

  // Planet view: click on planet
  if (!_hoveredPlanet) return;

  _selectedPlanet = _hoveredPlanet;

  if (_selectionRing) {
    _selectionRing.position = _hoveredPlanet.position.clone();
    _selectionRing.position.y += 0.1;
    const ringScale = _hoveredPlanet.size + 0.5;
    _selectionRing.scaling = new BABYLON.Vector3(ringScale, ringScale, ringScale);
    _selectionRing.setEnabled(true);
  }

  if (window._mapClickCallback) {
    window._mapClickCallback(_hoveredPlanet.id);
  }
}

// ---------------------------------------------------------------------------
// 质量设置
// ---------------------------------------------------------------------------

function _applyQualitySettings() {
  if (_backgroundLayers && _backgroundLayers.stars && _backgroundLayers.stars.dispose) {
    _backgroundLayers.stars.dispose();
    _backgroundLayers.stars = _createDistantStars();
  }
  console.log('Quality set to:', _qualityLevel);
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

export function getSystemAtPoint(x, y) {
  return null;
}

export function invalidateScene() {
  _dirty = true;
}

/**
 * 将指定星球的3D世界坐标投影到屏幕坐标
 * @param {string} planetId
 * @returns {{ x: number, y: number } | null} 屏幕像素坐标，或 null
 */
export function getPlanetScreenPosition(planetId) {
  if (!_scene || !_camera || !_canvas) return null;
  const meta = _planetMetadata.find(m => m.id === planetId);
  if (!meta) return null;
  const pos = meta.position;
  const engine = _scene.getEngine();
  const viewport = _camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const projected = BABYLON.Vector3.Project(
    pos,
    BABYLON.Matrix.Identity(),
    _scene.getTransformMatrix(),
    viewport
  );

  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();
  const scaleX = renderWidth > 0 ? (_canvas.clientWidth / renderWidth) : 1;
  const scaleY = renderHeight > 0 ? (_canvas.clientHeight / renderHeight) : 1;

  return {
    x: projected.x * scaleX,
    y: projected.y * scaleY,
  };
}

export function resetRuntimeState(currentSystemId) {
  _currentSystem = currentSystemId || null;
  _hoveredPlanet = null;
  _selectedPlanet = null;
  _dirty = true;
  if (_selectionRing) {
    _selectionRing.setEnabled(false);
  }
}
