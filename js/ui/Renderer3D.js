// js/ui/Renderer3D.js — Babylon.js 3D星空图渲染器
// 依赖：babylon.js (global), data/systems.js, data/factions.js
// 导出：init, resetRuntimeState, setMotionLevel, render, getSystemAtPoint, toggleView, isActive

import { SYSTEMS, GALAXIES, getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { FACTIONS } from '../data/factions.js';

let _canvas;
let _engine, _scene, _camera;
let _systemMeshes = [];
let _galaxyMeshes = [];
let _starField;
let _isActive = false;
let _mapView = 'planets'; // 'planets' or 'galaxies'
let _currentGalaxyId = 'milky_way';
let _hoveredSystem = null;
let _currentSystem = null;
let _motionLevel = 'full';
let _resizeBound = false;

const _NEON = {
  bgTop: new BABYLON.Color4(0.008, 0.031, 0.09, 1),       // 0x020817
  starGlow: new BABYLON.Color3(0.22, 0.74, 0.97),          // 0x38bdf8
  starAlt: new BABYLON.Color3(0.40, 0.91, 0.98),           // 0x67e8f9
  current: new BABYLON.Color3(0.40, 0.91, 0.98),           // 0x67e8f9
  hover: new BABYLON.Color3(0.87, 0.98, 1),                // 0xdffbff
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

  // Create Babylon engine
  _engine = new BABYLON.Engine(_canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  // Create scene
  _scene = new BABYLON.Scene(_engine);
  _scene.clearColor = _NEON.bgTop;
  _scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  _scene.fogColor = new BABYLON.Color3(0.008, 0.031, 0.09);
  _scene.fogStart = 50;
  _scene.fogEnd = 200;

  // Create camera (ArcRotateCamera = built-in orbit controls)
  const container = document.getElementById('map-container');
  _camera = new BABYLON.ArcRotateCamera(
    'camera',
    -Math.PI / 2,    // alpha (horizontal rotation)
    Math.PI / 3,     // beta (vertical angle)
    120,             // radius
    new BABYLON.Vector3(0, 0, 0),
    _scene
  );
  _camera.attachControl(_canvas, true);
  _camera.inertia = 0.9;
  _camera.lowerRadiusLimit = 30;
  _camera.upperRadiusLimit = 300;
  _camera.upperBetaLimit = Math.PI / 1.5;
  _camera.minZ = 0.1;
  _camera.maxZ = 1000;

  // Add hemisphere light (ambient)
  const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), _scene);
  hemiLight.intensity = 0.4;

  // Add point light
  const pointLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 50, 50), _scene);
  pointLight.diffuse = new BABYLON.Color3(0.22, 0.74, 0.97);
  pointLight.intensity = 1;
  pointLight.range = 300;

  // Create starfield background
  _createStarField();

  // Setup resize handler
  if (!_resizeBound) {
    window.addEventListener('resize', () => _engine.resize());
    _resizeBound = true;
  }

  // Setup mouse interaction via Babylon's built-in picking
  _scene.onPointerMove = _onPointerMove;
  _scene.onPointerPick = _onPointerPick;

  console.log('3D Renderer initialized (Babylon.js)');
}

export function resetRuntimeState(currentSystemId) {
  _currentSystem = currentSystemId || null;
  _hoveredSystem = null;
}

export function setMotionLevel(level) {
  _motionLevel = ['full', 'reduced', 'off'].indexOf(level) >= 0 ? level : 'full';
}

export function isActive() {
  return _isActive;
}

export function toggleView() {
  _isActive = !_isActive;
  const canvas2d = document.getElementById('map-canvas');
  const canvasWebgl = document.getElementById('webgl-canvas');

  if (_isActive) {
    // Show 3D, hide 2D
    _canvas.style.display = 'block';
    canvas2d.style.display = 'none';
    canvasWebgl.style.display = 'none';
    _engine.resize();
    _startAnimation();
  } else {
    // Show 2D, hide 3D
    _canvas.style.display = 'none';
    canvas2d.style.display = 'block';
    canvasWebgl.style.display = 'block';
    _stopAnimation();
  }
}

// ---------------------------------------------------------------------------
// 星空背景
// ---------------------------------------------------------------------------

function _createStarField() {
  const pcs = new BABYLON.PointsCloudSystem('starField', 2, _scene);

  pcs.addPoints(1000, function (particle) {
    particle.position = new BABYLON.Vector3(
      (Math.random() - 0.5) * 400,
      (Math.random() - 0.5) * 400,
      (Math.random() - 0.5) * 400
    );
    particle.color = new BABYLON.Color4(0.22, 0.74, 0.97, 0.8);
  });

  pcs.buildMeshAsync().then(() => {
    _starField = pcs.mesh;
  });
}

// ---------------------------------------------------------------------------
// 渲染星系和星球
// ---------------------------------------------------------------------------

export function render(state, mapView, currentGalaxyId) {
  if (!_isActive) return;

  _mapView = mapView || 'planets';
  _currentGalaxyId = currentGalaxyId || 'milky_way';
  _currentSystem = state.currentSystem;

  // Clear existing meshes
  _clearMeshes();

  if (_mapView === 'galaxies') {
    _renderGalaxies(state);
  } else {
    _renderPlanets(state, _currentGalaxyId);
  }
}

function _clearMeshes() {
  _systemMeshes.forEach(mesh => {
    if (mesh) mesh.dispose();
  });
  _galaxyMeshes.forEach(mesh => {
    if (mesh) mesh.dispose();
  });
  _systemMeshes = [];
  _galaxyMeshes = [];
}

function _renderGalaxies(state) {
  GALAXIES.forEach((galaxy) => {
    const x = (galaxy.gx - 0.5) * 150;
    const z = (galaxy.gy - 0.5) * 150;
    const y = (Math.random() - 0.5) * 20;

    // Create galaxy sphere
    const mesh = BABYLON.MeshBuilder.CreateSphere('galaxy_' + galaxy.id, {
      diameter: 16, segments: 32,
    }, _scene);
    mesh.position = new BABYLON.Vector3(x, y, z);

    const color = BABYLON.Color3.FromHexString(galaxy.color || '#4FC3F7');
    const material = new BABYLON.StandardMaterial('mat_galaxy_' + galaxy.id, _scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.5);
    material.alpha = galaxy.unlocked ? 0.9 : 0.4;
    mesh.material = material;

    mesh.metadata = { type: 'galaxy', id: galaxy.id, data: galaxy };
    _galaxyMeshes.push(mesh);

    // Add glow effect
    const glow = BABYLON.MeshBuilder.CreateSphere('glow_galaxy_' + galaxy.id, {
      diameter: 24, segments: 32,
    }, _scene);
    glow.position = mesh.position.clone();
    const glowMat = new BABYLON.StandardMaterial('mat_glow_galaxy_' + galaxy.id, _scene);
    glowMat.diffuseColor = color;
    glowMat.emissiveColor = color;
    glowMat.alpha = 0.2;
    glowMat.disableLighting = true;
    glow.material = glowMat;
    glow.isPickable = false;
    _galaxyMeshes.push(glow);

    // Add text label
    _addTextLabel(galaxy.name, mesh.position, 15);
  });
}

function _renderPlanets(state, galaxyId) {
  const systems = getSystemsByGalaxy(galaxyId);
  const accessible = systems.filter(sys => isSystemAccessible(sys, state));

  accessible.forEach(system => {
    const x = (system.x - 0.5) * 120;
    const z = (system.y - 0.5) * 120;
    const y = (Math.sin(system.x * Math.PI * 2) * 10) + (Math.cos(system.y * Math.PI * 2) * 5);

    const size = 2 + Math.random() * 2;
    const mesh = BABYLON.MeshBuilder.CreateSphere('planet_' + system.id, {
      diameter: size * 2, segments: 32,
    }, _scene);
    mesh.position = new BABYLON.Vector3(x, y, z);

    const systemColor = _getSystemColor(system.type);
    const color = BABYLON.Color3.FromHexString(systemColor);
    const isCurrent = system.id === _currentSystem;

    const material = new BABYLON.StandardMaterial('mat_planet_' + system.id, _scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(isCurrent ? 0.8 : 0.3);
    material.alpha = 0.9;
    mesh.material = material;

    mesh.metadata = { type: 'system', id: system.id, data: system };
    _systemMeshes.push(mesh);

    // Add glow for current system
    if (isCurrent) {
      const glow = BABYLON.MeshBuilder.CreateSphere('glow_' + system.id, {
        diameter: (size + 2) * 2, segments: 32,
      }, _scene);
      glow.position = mesh.position.clone();
      const glowMat = new BABYLON.StandardMaterial('mat_glow_' + system.id, _scene);
      glowMat.emissiveColor = _NEON.current;
      glowMat.alpha = 0.3;
      glowMat.disableLighting = true;
      glow.material = glowMat;
      glow.isPickable = false;
      _systemMeshes.push(glow);
    }

    // Add connecting lines to nearby systems
    _addSystemConnections(system, systems, mesh.position);
  });
}

function _addSystemConnections(system, allSystems, position) {
  const nearby = allSystems.filter(other => {
    if (other.id === system.id) return false;
    const dx = system.x - other.x;
    const dy = system.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < 0.15;
  });

  nearby.forEach(other => {
    const otherX = (other.x - 0.5) * 120;
    const otherZ = (other.y - 0.5) * 120;
    const otherY = (Math.sin(other.x * Math.PI * 2) * 10) + (Math.cos(other.y * Math.PI * 2) * 5);

    const points = [
      position.clone(),
      new BABYLON.Vector3(otherX, otherY, otherZ),
    ];

    const line = BABYLON.MeshBuilder.CreateLines('conn_' + system.id + '_' + other.id, {
      points: points,
      updatable: false,
    }, _scene);
    line.color = new BABYLON.Color3(0.22, 0.74, 0.97);
    line.alpha = 0.15;
    line.isPickable = false;
    _systemMeshes.push(line);
  });
}

function _addTextLabel(text, position, offsetY) {
  // Create a plane with dynamic texture for text label
  const plane = BABYLON.MeshBuilder.CreatePlane('label_' + text, {
    width: 20, height: 5,
  }, _scene);
  plane.position = new BABYLON.Vector3(position.x, position.y + offsetY, position.z);
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  const texture = new BABYLON.DynamicTexture('dtex_' + text, { width: 256, height: 64 }, _scene);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'Bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 40);
  texture.update();

  const mat = new BABYLON.StandardMaterial('mat_label_' + text, _scene);
  mat.diffuseTexture = texture;
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  plane.material = mat;
  plane.isPickable = false;

  _systemMeshes.push(plane);
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

// ---------------------------------------------------------------------------
// 动画循环
// ---------------------------------------------------------------------------

let _renderLoopFn = null;

function _startAnimation() {
  if (_renderLoopFn) return;
  _renderLoopFn = () => {
    // Rotate starfield slowly
    if (_starField && _motionLevel !== 'off') {
      const speed = _motionLevel === 'reduced' ? 0.0001 : 0.0003;
      _starField.rotation.y += speed;
    }

    // Pulse current system
    if (_motionLevel !== 'off') {
      const time = Date.now() * 0.001;
      _systemMeshes.forEach(mesh => {
        if (mesh.metadata && mesh.metadata.type === 'system' && mesh.metadata.id === _currentSystem) {
          const scale = 1 + Math.sin(time * 2) * 0.1;
          mesh.scaling = new BABYLON.Vector3(scale, scale, scale);
        }
      });
    }

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
// 鼠标交互
// ---------------------------------------------------------------------------

function _onPointerMove(evt, pickResult) {
  // Reset previous hover
  if (_hoveredSystem && _hoveredSystem.material) {
    const isCurrent = _hoveredSystem.metadata && _hoveredSystem.metadata.id === _currentSystem;
    const baseColor = _hoveredSystem.metadata && _hoveredSystem.metadata.data
      ? BABYLON.Color3.FromHexString(_getSystemColor(_hoveredSystem.metadata.data.type || ''))
      : new BABYLON.Color3(0.31, 0.76, 0.97);
    _hoveredSystem.material.emissiveColor = baseColor.scale(isCurrent ? 0.8 : 0.3);
    _hoveredSystem = null;
  }

  if (pickResult.hit && pickResult.pickedMesh && pickResult.pickedMesh.metadata) {
    const mesh = pickResult.pickedMesh;
    const meta = mesh.metadata;
    if (meta.type === 'system' || meta.type === 'galaxy') {
      _hoveredSystem = mesh;
      if (mesh.material) {
        mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
      }
      _canvas.style.cursor = 'pointer';

      if (window._mapHoverCallback) {
        window._mapHoverCallback(meta.data);
      }
      return;
    }
  }

  _canvas.style.cursor = 'default';
  if (window._mapHoverCallback) {
    window._mapHoverCallback(null);
  }
}

function _onPointerPick(evt, pickResult) {
  if (!pickResult.hit || !pickResult.pickedMesh || !pickResult.pickedMesh.metadata) return;

  const meta = pickResult.pickedMesh.metadata;
  if (meta.type === 'system' && window._mapClickCallback) {
    window._mapClickCallback(meta.id);
  } else if (meta.type === 'galaxy' && window._galaxyClickCallback) {
    window._galaxyClickCallback(meta.id);
  }
}

export function getSystemAtPoint(x, y) {
  // Not used in 3D mode - handled by Babylon picking
  return null;
}
