// js/ui/Renderer3DAdvanced.js — 增强型 3D 星图渲染器 (Babylon.js)
// 依赖：babylon.js (global), GalaxyDataLayer, data/factions.js
// 导出：init, render, focusPlanet, setQuality, setMotionLevel, isActive, toggleView,
//       getSystemAtPoint, resetRuntimeState, resetCamera

/**
 * 高级 3D 星图渲染系统 (Babylon.js)
 *
 * 特性：
 * - Thin Instances 批量渲染星球（高性能）
 * - 分层背景系统（远景恒星、星云、银河盘面）
 * - 势力边界可视化（凸包算法）
 * - 航线与跃迁通道动画
 * - LOD 层级细节系统
 * - 选择环指示器（脉冲动画）
 * - 画质等级管理
 */

import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import { FACTIONS } from '../data/factions.js';

// 渲染上下文
let _engine, _scene, _camera, _canvas;
let _isActive = false;

// 渲染对象
let _basePlanetMesh = null;        // Base mesh for thin instances
let _instanceCount = 0;
let _planetMetadata = [];           // { id, index, position, size, color }
let _backgroundLayers = null;       // { stars, nebula, disk }
let _factionBoundaries = [];        // Faction boundary meshes
let _connectionLines = [];          // Trade routes
let _selectionRing = null;          // Selection indicator

// 状态
let _currentGalaxyId = 'milky_way';
let _currentSystem = null;
let _hoveredPlanet = null;
let _selectedPlanet = null;
let _motionLevel = 'full';
let _qualityLevel = 'high';
let _cameraTarget = null;
let _cameraTransitionProgress = 0;

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

  // Create scene
  _scene = new BABYLON.Scene(_engine);
  _scene.clearColor = _COLORS.bgTop;
  _scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  _scene.fogColor = new BABYLON.Color3(0.008, 0.031, 0.09);
  _scene.fogStart = 100;
  _scene.fogEnd = 500;

  // Create ArcRotateCamera (built-in orbit controls)
  _camera = new BABYLON.ArcRotateCamera(
    'advCamera',
    -Math.PI / 2,    // alpha
    Math.PI / 3,     // beta
    170,             // radius (~equivalent to position (0, 80, 150))
    new BABYLON.Vector3(0, 0, 0),
    _scene
  );
  _camera.attachControl(_canvas, true);
  _camera.inertia = 0.9;
  _camera.lowerRadiusLimit = 20;
  _camera.upperRadiusLimit = 400;
  _camera.upperBetaLimit = Math.PI / 1.8;
  _camera.minZ = 0.1;
  _camera.maxZ = 1000;

  // Lights
  const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), _scene);
  hemiLight.intensity = 0.3;

  const pointLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 100, 100), _scene);
  pointLight.diffuse = new BABYLON.Color3(0.22, 0.74, 0.97);
  pointLight.intensity = 1.5;
  pointLight.range = 500;

  // Create background layers
  _createBackgroundLayers();

  // Create selection ring
  _createSelectionRing();

  // Setup event listeners
  window.addEventListener('resize', () => _engine.resize());
  _scene.onPointerMove = _onPointerMove;
  _scene.onPointerPick = _onPointerPick;

  console.log('Renderer3DAdvanced initialized (Babylon.js)');
}

export function setQuality(level) {
  _qualityLevel = level;
  _applyQualitySettings();
}

export function setMotionLevel(level) {
  _motionLevel = level;
}

export function isActive() {
  return _isActive;
}

export function toggleView() {
  if (!_engine || !_scene) return; // engine not initialized
  _isActive = !_isActive;
  const canvas2d = document.getElementById('map-canvas');
  const canvasWebgl = document.getElementById('webgl-canvas');

  if (_isActive) {
    _canvas.style.display = 'block';
    canvas2d.style.display = 'none';
    canvasWebgl.style.display = 'none';
    _engine.resize();
    _startAnimation();
  } else {
    _canvas.style.display = 'none';
    canvas2d.style.display = 'block';
    canvasWebgl.style.display = 'block';
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
    // Spherical distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const radius = 300 + Math.random() * 200;

    particle.position = new BABYLON.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );

    // Varying colors
    const colorVariation = Math.random();
    if (colorVariation < 0.7) {
      particle.color = new BABYLON.Color4(0.8, 0.9, 1, 0.8);   // Blue-white
    } else if (colorVariation < 0.9) {
      particle.color = new BABYLON.Color4(1, 0.9, 0.7, 0.8);   // Yellow-white
    } else {
      particle.color = new BABYLON.Color4(1, 0.7, 0.6, 0.8);   // Orange-red
    }
  });

  // buildMeshAsync is async; store a placeholder object so rotation code has a target
  const placeholder = { rotation: { y: 0 }, dispose: () => {} };
  pcs.buildMeshAsync().then(() => {
    if (!pcs.mesh) {
      console.warn('[Renderer3DAdvanced] buildMeshAsync resolved but mesh is null');
      return;
    }
    const mesh = pcs.mesh;
    // Copy any rotation applied while building
    mesh.rotation.y = placeholder.rotation.y;
    if (_backgroundLayers) {
      _backgroundLayers.stars = mesh;
    }
  }).catch(err => console.error('[Renderer3DAdvanced] buildMeshAsync error:', err));

  return placeholder;
}

function _createNebula() {
  // Create procedural nebula texture
  const dtex = new BABYLON.DynamicTexture('nebulaTex', { width: 512, height: 512 }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();

  // Gradient background
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.3)');
  gradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Add noise
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
  // Create spiral galaxy disk texture
  const dtex = new BABYLON.DynamicTexture('diskTex', { width: 1024, height: 1024 }, _scene);
  dtex.hasAlpha = true;
  const ctx = dtex.getContext();

  const centerX = 512;
  const centerY = 512;

  ctx.clearRect(0, 0, 1024, 1024);

  // Draw spiral arms
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
// 星球渲染（Thin Instances）
// ---------------------------------------------------------------------------

export function render(state, mapView, galaxyId) {
  if (!_isActive || !_scene || !_engine) return;

  _currentGalaxyId = galaxyId || 'milky_way';
  _currentSystem = state.currentSystem;

  // Clear existing planet meshes
  if (_basePlanetMesh) {
    _basePlanetMesh.dispose();
    _basePlanetMesh = null;
  }

  // Get galaxy hierarchy from data layer
  const hierarchy = GalaxyData.getGalaxyHierarchy(_currentGalaxyId);
  if (!hierarchy) return;

  // Render planets with thin instancing
  _renderPlanetsInstanced(hierarchy.allPlanets, state);

  // Render faction boundaries
  _renderFactionBoundaries(hierarchy.allPlanets);

  // Render connection lines
  _renderConnections(hierarchy.allPlanets);
}

function _renderPlanetsInstanced(planets, state) {
  const quality = _QUALITY_SETTINGS[_qualityLevel];
  _instanceCount = planets.length;
  _planetMetadata = [];

  if (_instanceCount === 0) return;

  // Create base mesh for thin instances
  _basePlanetMesh = BABYLON.MeshBuilder.CreateSphere('basePlanet', {
    diameter: 2, segments: quality.planetSegments,
  }, _scene);

  const material = new BABYLON.StandardMaterial('planetMat', _scene);
  material.emissiveColor = _COLORS.starGlow.scale(0.3);
  material.specularPower = 30;
  _basePlanetMesh.material = material;

  // Use thin instances for high-performance batch rendering
  // First instance is the base mesh itself, so we set it up
  const matrices = [];
  const colors = [];

  planets.forEach((planet, i) => {
    // Calculate 3D position
    const x = (planet.position.x - 0.5) * 120;
    const z = (planet.position.y - 0.5) * 120;
    const y = Math.sin(planet.position.x * Math.PI * 2) * 10 +
              Math.cos(planet.position.y * Math.PI * 2) * 5;

    const position = new BABYLON.Vector3(x, y, z);

    // Calculate size based on type
    const baseSize = 2 + Math.random() * 2;
    const sizeMultiplier = planet.type === 'special' ? 1.5 : 1.0;
    const finalSize = baseSize * sizeMultiplier;
    const scale = new BABYLON.Vector3(finalSize, finalSize, finalSize);

    // Compose matrix
    const matrix = BABYLON.Matrix.Compose(
      scale,
      BABYLON.Quaternion.Identity(),
      position
    );

    // Color
    const hexColor = _getSystemColor(planet.type);
    const color = BABYLON.Color3.FromHexString(hexColor);

    if (i === 0) {
      // First instance uses the base mesh world matrix
      _basePlanetMesh.position = position;
      _basePlanetMesh.scaling = scale;
      // Set first planet color on the base mesh material
      material.diffuseColor = color;
      material.emissiveColor = color.scale(0.3);
    } else {
      matrices.push(matrix);
      colors.push(color.r, color.g, color.b, 1);
    }

    // Store metadata
    _planetMetadata.push({
      id: planet.id,
      index: i,
      position: position,
      size: finalSize,
      color: color,
      type: planet.type,
      owner: planet.owner,
    });
  });

  // Add thin instances (skip index 0, that's the base mesh)
  if (matrices.length > 0) {
    const matrixArray = new Float32Array(matrices.length * 16);
    matrices.forEach((mat, i) => {
      mat.copyToArray(matrixArray, i * 16);
    });
    _basePlanetMesh.thinInstanceSetBuffer('matrix', matrixArray, 16);

    // Set instance colors
    if (colors.length > 0) {
      const colorArray = new Float32Array(colors);
      _basePlanetMesh.thinInstanceSetBuffer('color', colorArray, 4);
    }
  }

  // Enable thin instance picking
  _basePlanetMesh.thinInstanceEnablePicking = true;
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
// 势力边界渲染
// ---------------------------------------------------------------------------

function _renderFactionBoundaries(planets) {
  const quality = _QUALITY_SETTINGS[_qualityLevel];
  if (!quality.enableBoundaries) return;

  // Clear existing boundaries
  _factionBoundaries.forEach(b => b.dispose());
  _factionBoundaries = [];

  // Group planets by faction
  const factionPlanets = {};
  planets.forEach(planet => {
    if (planet.owner && planet.owner !== 'player') {
      if (!factionPlanets[planet.owner]) {
        factionPlanets[planet.owner] = [];
      }
      factionPlanets[planet.owner].push(planet);
    }
  });

  // Draw boundary for each faction
  Object.entries(factionPlanets).forEach(([factionId, factionPlanetList]) => {
    if (factionPlanetList.length < 3) return;

    const faction = FACTIONS.find(f => f.id === factionId);
    if (!faction) return;

    // Calculate convex hull in 2D (x, z plane)
    const points2D = factionPlanetList.map(p => ({
      x: (p.position.x - 0.5) * 120,
      y: (p.position.y - 0.5) * 120,
    }));

    const hull = _convexHull(points2D);
    if (hull.length < 3) return;

    // Create boundary line
    const points3D = hull.map(p => new BABYLON.Vector3(p.x, 5, p.y));
    points3D.push(points3D[0].clone()); // Close the loop

    const boundary = BABYLON.MeshBuilder.CreateLines('boundary_' + factionId, {
      points: points3D,
      updatable: false,
    }, _scene);

    const factionColor = BABYLON.Color3.FromHexString(faction.color || '#4FC3F7');
    boundary.color = factionColor;
    boundary.alpha = 0.4;
    boundary.isPickable = false;

    _factionBoundaries.push(boundary);
  });
}

// Simple convex hull algorithm (Gift wrapping)
function _convexHull(points) {
  if (points.length < 3) return points;

  let leftmost = points[0];
  points.forEach(p => {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
      leftmost = p;
    }
  });

  const hull = [];
  let current = leftmost;

  do {
    hull.push(current);
    let next = points[0];

    for (let i = 1; i < points.length; i++) {
      if (next === current) {
        next = points[i];
        continue;
      }

      const cross = (next.x - current.x) * (points[i].y - current.y) -
                    (next.y - current.y) * (points[i].x - current.x);

      if (cross < 0) {
        next = points[i];
      }
    }

    current = next;
  } while (current !== leftmost && hull.length < points.length);

  return hull;
}

// ---------------------------------------------------------------------------
// 连接线渲染
// ---------------------------------------------------------------------------

function _renderConnections(planets) {
  // Clear existing connections
  _connectionLines.forEach(line => line.dispose());
  _connectionLines = [];

  planets.forEach(planet => {
    const p1 = new BABYLON.Vector3(
      (planet.position.x - 0.5) * 120,
      Math.sin(planet.position.x * Math.PI * 2) * 10 +
        Math.cos(planet.position.y * Math.PI * 2) * 5,
      (planet.position.y - 0.5) * 120
    );

    planets.forEach(other => {
      if (planet.id >= other.id) return; // Avoid duplicates

      const dx = planet.position.x - other.position.x;
      const dy = planet.position.y - other.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.12) {
        const p2 = new BABYLON.Vector3(
          (other.position.x - 0.5) * 120,
          Math.sin(other.position.x * Math.PI * 2) * 10 +
            Math.cos(other.position.y * Math.PI * 2) * 5,
          (other.position.y - 0.5) * 120
        );

        const line = BABYLON.MeshBuilder.CreateLines('conn_' + planet.id + '_' + other.id, {
          points: [p1, p2],
          updatable: false,
        }, _scene);
        line.color = new BABYLON.Color3(0.22, 0.74, 0.97);
        line.alpha = 0.1;
        line.isPickable = false;
        _connectionLines.push(line);
      }
    });
  });
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
// 相机控制
// ---------------------------------------------------------------------------

export function focusPlanet(planetId, smooth = true) {
  const metadata = _planetMetadata.find(m => m.id === planetId);
  if (!metadata) return;

  const targetPos = metadata.position.clone();
  targetPos.y += 30;
  targetPos.z += 50;

  if (smooth) {
    _cameraTarget = targetPos;
    _cameraTransitionProgress = 0;
  } else {
    _camera.setPosition(targetPos);
    _camera.setTarget(metadata.position);
  }
}

export function resetCamera() {
  _cameraTarget = new BABYLON.Vector3(0, 80, 150);
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
      const currentPos = _camera.position;
      _camera.position = BABYLON.Vector3.Lerp(currentPos, _cameraTarget, 0.05);

      if (_cameraTransitionProgress >= 1) {
        _cameraTarget = null;
      }
    }

    // Rotate background slowly
    if (_backgroundLayers && _motionLevel !== 'off') {
      const speed = _motionLevel === 'reduced' ? 0.0001 : 0.0003;
      if (_backgroundLayers.stars) {
        _backgroundLayers.stars.rotation.y += speed;
      }
      if (_backgroundLayers.nebula) {
        _backgroundLayers.nebula.rotation.y += speed * 0.5;
      }
    }

    // Update selection ring
    if (_selectionRing && _selectionRing.isEnabled()) {
      _selectionRing.rotation.z += 0.01;
      const s = 1 + Math.sin(time * 3) * 0.1;
      _selectionRing.scaling = new BABYLON.Vector3(s, s, s);
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
// 事件处理
// ---------------------------------------------------------------------------

function _onPointerMove(evt, pickResult) {
  if (_hoveredPlanet) {
    _hoveredPlanet = null;
  }

  if (pickResult.hit && pickResult.pickedMesh) {
    const mesh = pickResult.pickedMesh;

    // Handle thin instance picking
    if (mesh === _basePlanetMesh) {
      const instanceIndex = pickResult.thinInstanceIndex;
      // thinInstanceIndex: -1 = base mesh (metadata[0]), 0+ = thin instances (metadata[1+])
      const metaIndex = instanceIndex >= 0 ? instanceIndex + 1 : 0;
      const metadata = _planetMetadata[metaIndex];

      if (metadata) {
        _hoveredPlanet = metadata;
        _canvas.style.cursor = 'pointer';

        if (window._mapHoverCallback) {
          const planetData = GalaxyData.getPlanetData(metadata.id);
          window._mapHoverCallback(planetData);
        }
        return;
      }
    }
  }

  _canvas.style.cursor = 'default';
  if (window._mapHoverCallback) {
    window._mapHoverCallback(null);
  }
}

function _onPointerPick(evt, pickResult) {
  if (!_hoveredPlanet) return;

  _selectedPlanet = _hoveredPlanet;

  // Position selection ring
  if (_selectionRing) {
    _selectionRing.position = _hoveredPlanet.position.clone();
    _selectionRing.position.y += 0.1;
    const ringScale = _hoveredPlanet.size + 0.5;
    _selectionRing.scaling = new BABYLON.Vector3(ringScale, ringScale, ringScale);
    _selectionRing.setEnabled(true);
  }

  // Dispatch click event
  if (window._mapClickCallback) {
    window._mapClickCallback(_hoveredPlanet.id);
  }
}

// ---------------------------------------------------------------------------
// 质量设置
// ---------------------------------------------------------------------------

function _applyQualitySettings() {
  // Rebuild background stars with new quality
  if (_backgroundLayers && _backgroundLayers.stars) {
    _backgroundLayers.stars.dispose();
    _backgroundLayers.stars = _createDistantStars();
  }

  console.log('Quality set to:', _qualityLevel);
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

export function getSystemAtPoint(x, y) {
  // Not used in 3D mode
  return null;
}

export function resetRuntimeState(currentSystemId) {
  _currentSystem = currentSystemId || null;
  _hoveredPlanet = null;
  _selectedPlanet = null;
  if (_selectionRing) {
    _selectionRing.setEnabled(false);
  }
}
