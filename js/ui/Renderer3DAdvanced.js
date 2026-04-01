// js/ui/Renderer3DAdvanced.js — 增强型 3D 星图渲染器
// 依赖：three.js, GalaxyDataLayer, data/systems.js, data/factions.js
// 导出：init, render, focusPlanet, setQuality

/**
 * 高级 3D 星图渲染系统
 *
 * 特性：
 * - InstancedMesh 批量渲染星球（高性能）
 * - 分层背景系统（远景恒星、星云、银河盘面）
 * - 势力边界可视化（凸包算法）
 * - 航线与跃迁通道动画
 * - LOD 层级细节系统
 * - 空间分割优化（八叉树）
 * - 自定义 Shader 材质
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import { FACTIONS } from '../data/factions.js';
import { GALAXIES, getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';

// 渲染上下文
let _scene, _camera, _renderer, _controls, _canvas;
let _animationId = null;
let _isActive = false;

// 渲染对象
let _instancedPlanets = null;      // InstancedMesh for planets
let _instanceCount = 0;
let _planetMetadata = [];          // { id, index, position, size, color }
let _backgroundLayers = null;      // { stars, nebula, disk }
let _factionBoundaries = [];       // Faction boundary meshes
let _connectionLines = [];         // Trade routes
let _selectionRing = null;         // Selection indicator
let _octree = null;                // Spatial partitioning
let _galaxyMeshes = [];            // Galaxy spheres for galaxy view
let _textLabels = [];              // Sprite text labels
let _mapView = 'planets';          // 'planets' or 'galaxies'

// 状态
let _currentGalaxyId = 'milky_way';
let _currentSystem = null;
let _hoveredPlanet = null;
let _selectedPlanet = null;
let _motionLevel = 'full';
let _qualityLevel = 'high';        // high, medium, low
let _cameraTarget = null;          // For smooth camera transitions
let _cameraTransitionProgress = 0;

// 飞船
let _shipMesh = null;              // Ship 3D group
let _shipTrail = null;             // Engine trail particles
let _flightPath = null;            // { curve, progress, fromId, toId, duration, startTime, onComplete }
let _shipVisible = false;

// Raycaster
let _raycaster, _mouse;

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
  bgTop: 0x020817,
  bgBottom: 0x061528,
  starCore: 0xdffbff,
  starGlow: 0x38bdf8,
  current: 0x67e8f9,
  hover: 0xffffff,
  selected: 0xffff00,
  neutral: 0x607d8b,
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

  // Setup scene
  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(_COLORS.bgTop);
  _scene.fog = new THREE.Fog(_COLORS.bgTop, 200, 800);

  // Setup camera
  const container = document.getElementById('map-container');
  const aspect = container.clientWidth / container.clientHeight;
  _camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
  _camera.position.set(0, 80, 180);
  _camera.lookAt(0, 0, 0);

  // Setup renderer
  _renderer = new THREE.WebGLRenderer({
    canvas: _canvas,
    antialias: _qualityLevel !== 'low',
    alpha: false,
    powerPreference: 'high-performance',
  });
  _renderer.setSize(container.clientWidth, container.clientHeight);
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Setup controls
  _controls = new OrbitControls(_camera, _canvas);
  _controls.enableDamping = true;
  _controls.dampingFactor = 0.05;
  _controls.screenSpacePanning = false;
  _controls.minDistance = 50;
  _controls.maxDistance = 500;
  _controls.maxPolarAngle = Math.PI / 1.8;

  // Clamp target so camera cannot pan beyond planet area (~150 units from center)
  const PAN_LIMIT = 160;
  _controls.addEventListener('change', () => {
    const t = _controls.target;
    t.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, t.x));
    t.y = Math.max(-30, Math.min(60, t.y));
    t.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, t.z));
  });

  // When zooming out hits max distance, switch to galaxy overview
  let _zoomOutTriggerPending = false;
  _canvas.addEventListener('wheel', (e) => {
    if (!_isActive || _mapView !== 'planets') return;
    // e.deltaY > 0 means zooming out
    if (e.deltaY > 0) {
      const dist = _camera.position.distanceTo(_controls.target);
      if (dist >= _controls.maxDistance - 5) {
        if (!_zoomOutTriggerPending) {
          _zoomOutTriggerPending = true;
          // Trigger galaxy map via the global callback
          if (window._switchToGalaxyView) {
            window._switchToGalaxyView();
          }
          setTimeout(() => { _zoomOutTriggerPending = false; }, 800);
        }
      }
    }
  }, { passive: true });

  // Setup lights — multiple to show spherical shape from all angles
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  _scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x38bdf8, 1.5, 1000);
  pointLight.position.set(0, 200, 200);
  _scene.add(pointLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-50, 30, -50);
  _scene.add(fillLight);

  // Setup raycaster
  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();

  // Create background layers
  _createBackgroundLayers();

  // Create selection ring
  _createSelectionRing();

  // Setup event listeners
  window.addEventListener('resize', _onResize);
  _canvas.addEventListener('mousemove', _onMouseMove);
  _canvas.addEventListener('click', _onClick);

  console.log('Renderer3DAdvanced initialized');
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
  _isActive = !_isActive;
  const canvas2d = document.getElementById('map-canvas');
  const canvasWebgl = document.getElementById('webgl-canvas');

  if (_isActive) {
    _canvas.style.display = 'block';
    canvas2d.style.display = 'none';
    canvasWebgl.style.display = 'none';
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
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];

  for (let i = 0; i < quality.starCount; i++) {
    // Spherical distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const radius = 300 + Math.random() * 200;

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    positions.push(x, y, z);

    // Varying colors
    const colorVariation = Math.random();
    if (colorVariation < 0.7) {
      colors.push(0.8, 0.9, 1); // Blue-white
    } else if (colorVariation < 0.9) {
      colors.push(1, 0.9, 0.7); // Yellow-white
    } else {
      colors.push(1, 0.7, 0.6); // Orange-red
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false,
  });

  const stars = new THREE.Points(geometry, material);
  _scene.add(stars);

  return stars;
}

function _createNebula() {
  // Create procedural nebula texture
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

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
    data[i] += noise;
    data[i + 1] += noise;
    data[i + 2] += noise;
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.SphereGeometry(400, 32, 32);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const nebula = new THREE.Mesh(geometry, material);
  _scene.add(nebula);

  return nebula;
}

function _createGalaxyDisk() {
  // Create spiral galaxy disk texture
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const centerX = 512;
  const centerY = 512;

  // Draw spiral arms
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, 1024, 1024);

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

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(500, 500);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const disk = new THREE.Mesh(geometry, material);
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = -5;
  _scene.add(disk);

  return disk;
}

// ---------------------------------------------------------------------------
// 星球渲染（InstancedMesh）
// ---------------------------------------------------------------------------

export function render(state, mapView, galaxyId) {
  if (!_isActive) return;

  _mapView = mapView || 'planets';
  _currentGalaxyId = galaxyId || 'milky_way';
  _currentSystem = state.currentSystem;

  // Clear existing meshes
  _clearPlanetMeshes();
  _clearGalaxyMeshes();

  if (_mapView === 'galaxies') {
    _renderGalaxies(state);
  } else {
    // Get galaxy hierarchy from data layer
    const hierarchy = GalaxyData.getGalaxyHierarchy(_currentGalaxyId);
    if (!hierarchy) return;

    // Render planets with instancing
    _renderPlanetsInstanced(hierarchy.allPlanets, state);

    // Render faction territory auras
    _renderFactionBoundaries(hierarchy.allPlanets);

    // Render connection lines
    _renderConnections(hierarchy.allPlanets);
  }
}

function _clearPlanetMeshes() {
  if (_instancedPlanets) {
    _scene.remove(_instancedPlanets);
    _instancedPlanets.geometry.dispose();
    _instancedPlanets.material.dispose();
    _instancedPlanets = null;
  }
  _connectionLines.forEach(line => {
    _scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  _connectionLines = [];
  _factionBoundaries.forEach(b => {
    _scene.remove(b);
    b.geometry.dispose();
    b.material.dispose();
  });
  _factionBoundaries = [];
  _textLabels.forEach(s => {
    _scene.remove(s);
    if (s.material.map) s.material.map.dispose();
    s.material.dispose();
  });
  _textLabels = [];
}

function _clearGalaxyMeshes() {
  _galaxyMeshes.forEach(mesh => {
    _scene.remove(mesh);
    mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  });
  _galaxyMeshes = [];
}

// ---------------------------------------------------------------------------
// 星系总览渲染 — 程序化星云纹理
// ---------------------------------------------------------------------------

// 生成柔和的星云纹理 (canvas)
function _createNebulaTexture(color, seed, size) {
  const res = size || 256;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d');

  const cx = res / 2, cy = res / 2;
  const r = new THREE.Color(color);
  const rng = (i) => {
    const v = Math.sin(seed + i * 9873.1) * 43758.5453;
    return v - Math.floor(v);
  };

  // Clear
  ctx.clearRect(0, 0, res, res);

  // 1) Base radial glow — soft center falloff
  const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  baseGrad.addColorStop(0, `rgba(${Math.floor(r.r*255)},${Math.floor(r.g*255)},${Math.floor(r.b*255)},0.7)`);
  baseGrad.addColorStop(0.15, `rgba(${Math.floor(r.r*255)},${Math.floor(r.g*255)},${Math.floor(r.b*255)},0.35)`);
  baseGrad.addColorStop(0.5, `rgba(${Math.floor(r.r*255)},${Math.floor(r.g*255)},${Math.floor(r.b*255)},0.08)`);
  baseGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, res, res);

  // 2) Spiral arms or wispy tendrils
  const armCount = 2 + Math.floor(rng(0) * 2); // 2-3 arms
  ctx.globalCompositeOperation = 'lighter';
  for (let arm = 0; arm < armCount; arm++) {
    const armAngle = (arm / armCount) * Math.PI * 2 + rng(arm + 5) * 0.5;
    const twist = 2.5 + rng(arm + 10) * 2; // spiral tightness

    ctx.beginPath();
    for (let t = 0; t < Math.PI * twist; t += 0.08) {
      const radius = (t / (Math.PI * twist)) * cx * 0.85;
      const angle = armAngle + t;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);

      // Vary width along the arm
      const width = 8 + 15 * (1 - t / (Math.PI * twist)) * (0.6 + rng(arm * 100 + Math.floor(t * 10)) * 0.4);
      const alpha = 0.12 * (1 - t / (Math.PI * twist));

      const armGrad = ctx.createRadialGradient(px, py, 0, px, py, width);
      armGrad.addColorStop(0, `rgba(${Math.floor(r.r*255)},${Math.floor(r.g*255)},${Math.floor(r.b*255)},${alpha})`);
      armGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = armGrad;
      ctx.fillRect(px - width, py - width, width * 2, width * 2);
    }
  }

  // 3) Scattered bright knots — mimic star-forming regions
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
    kGrad.addColorStop(0.4, `rgba(${Math.floor(r.r*255)},${Math.floor(r.g*255)},${Math.floor(r.b*255)},${kAlpha*0.4})`);
    kGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = kGrad;
    ctx.fillRect(kx - kSize, ky - kSize, kSize * 2, kSize * 2);
  }

  // 4) Bright core hotspot
  ctx.globalCompositeOperation = 'lighter';
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.12);
  coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  coreGrad.addColorStop(0.5, `rgba(${Math.floor(r.r*255)},${Math.floor(r.g*255)},${Math.floor(r.b*255)},0.5)`);
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, res, res);

  return new THREE.CanvasTexture(canvas);
}

function _renderGalaxies(state) {
  GALAXIES.forEach((galaxy) => {
    const x = (galaxy.gx - 0.5) * 200;
    const z = (galaxy.gy - 0.5) * 200;
    const y = Math.sin(galaxy.gx * 3.14) * 15;

    const color = new THREE.Color(galaxy.color || '#4FC3F7');
    const isUnlocked = galaxy.unlocked ||
      (state.researchedTechs && state.researchedTechs.includes(galaxy.techRequired));
    const baseOpacity = isUnlocked ? 1.0 : 0.3;

    // Deterministic seed
    let seed = 0;
    for (let c = 0; c < galaxy.id.length; c++) seed = ((seed << 5) - seed) + galaxy.id.charCodeAt(c);
    const rng = (i) => {
      const v = Math.sin(seed + i * 9873.1) * 43758.5453;
      return v - Math.floor(v);
    };

    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.userData = { type: 'galaxy', id: galaxy.id, data: galaxy };

    // Galaxy disk size
    const galaxySize = 18 + rng(0) * 10;

    // 1) Main disk — billboard sprite with procedural texture
    const diskTex = _createNebulaTexture(color, seed, 512);
    const diskMat = new THREE.SpriteMaterial({
      map: diskTex,
      transparent: true,
      opacity: baseOpacity * 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const disk = new THREE.Sprite(diskMat);
    disk.scale.set(galaxySize * 2, galaxySize * 2, 1);
    group.add(disk);

    // 2) Second layer — slightly rotated, different seed for depth
    const disk2Tex = _createNebulaTexture(color, seed + 777, 256);
    const disk2Mat = new THREE.SpriteMaterial({
      map: disk2Tex,
      transparent: true,
      opacity: baseOpacity * 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const disk2 = new THREE.Sprite(disk2Mat);
    disk2.scale.set(galaxySize * 2.4, galaxySize * 2.4, 1);
    disk2.position.set(0, 0, 0.1);
    group.add(disk2);

    // 3) Scattered star particles around the galaxy
    const starCount = 30 + Math.floor(rng(1) * 30);
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const starColors = [];
    for (let s = 0; s < starCount; s++) {
      const angle = rng(s + 100) * Math.PI * 2;
      const dist = rng(s + 200) * galaxySize * 0.8;
      const sx = dist * Math.cos(angle);
      const sy = (rng(s + 300) - 0.5) * galaxySize * 0.15;
      const sz = dist * Math.sin(angle);
      starPos.push(sx, sy, sz);

      // Warm white to galaxy color
      const mix = rng(s + 400);
      starColors.push(
        0.8 + mix * color.r * 0.2,
        0.8 + mix * color.g * 0.2,
        0.9 + mix * color.b * 0.1
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      opacity: baseOpacity * 0.8,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    group.add(stars);

    _scene.add(group);
    _galaxyMeshes.push(group);

    // Text label
    _addTextLabel(galaxy.name, group.position, galaxySize + 3);
  });
}

function _addTextLabel(text, position, offsetY) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  context.fillStyle = '#38bdf8';
  context.font = 'Bold 24px Arial';
  context.textAlign = 'center';
  context.fillText(text, 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = false;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(position.x, position.y + offsetY, position.z);
  sprite.scale.set(10, 2.5, 1);
  _scene.add(sprite);
  _textLabels.push(sprite);
}

function _renderPlanetsInstanced(planets, state) {
  const quality = _QUALITY_SETTINGS[_qualityLevel];
  _instanceCount = planets.length;
  _planetMetadata = [];

  // Create shared geometry and material
  const geometry = new THREE.SphereGeometry(1, quality.planetSegments, quality.planetSegments);
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,            // Base white — tinted per-instance by setColorAt
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.4,
    shininess: 60,
    specular: new THREE.Color(0x444444),
  });

  // Create instanced mesh
  _instancedPlanets = new THREE.InstancedMesh(geometry, material, _instanceCount);
  _instancedPlanets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  planets.forEach((planet, i) => {
    // Calculate 3D position — wide spread for star system feel
    const x = (planet.position.x - 0.5) * 300;
    const z = (planet.position.y - 0.5) * 300;
    const y = Math.sin(planet.position.x * Math.PI * 2) * 25 +
              Math.cos(planet.position.y * Math.PI * 2) * 15;

    position.set(x, y, z);

    // Size based on resource richness: lower total prices = richer = bigger
    const prices = planet.prices || {};
    const priceValues = Object.values(prices);
    const totalPrice = priceValues.length > 0
      ? priceValues.reduce((s, v) => s + v, 0) / priceValues.length
      : 1.0;
    // totalPrice typically ranges ~0.5 (very rich) to ~1.8 (very poor)
    // Map to size: rich → 1.8, poor → 0.6
    const baseSize = Math.max(0.6, Math.min(1.8, 2.5 - totalPrice));
    const sizeMultiplier = planet.type === 'special' ? 1.4 : 1.0;
    scale.setScalar(baseSize * sizeMultiplier);

    // Set matrix
    matrix.compose(position, new THREE.Quaternion(), scale);
    _instancedPlanets.setMatrixAt(i, matrix);

    // Set color
    color.set(_getSystemColor(planet.type));
    _instancedPlanets.setColorAt(i, color);

    // Store metadata
    _planetMetadata.push({
      id: planet.id,
      index: i,
      position: position.clone(),
      size: baseSize * sizeMultiplier,
      color: color.clone(),
      type: planet.type,
      owner: planet.owner,
    });
  });

  _instancedPlanets.instanceMatrix.needsUpdate = true;
  if (_instancedPlanets.instanceColor) {
    _instancedPlanets.instanceColor.needsUpdate = true;
  }

  _scene.add(_instancedPlanets);

  // Add glow ring for current system
  const currentMeta = _planetMetadata.find(m => m.id === state.currentSystem);
  if (currentMeta) {
    const glowGeo = new THREE.SphereGeometry(currentMeta.size + 0.8, 24, 24);
    const glowMat = new THREE.MeshBasicMaterial({
      color: _COLORS.current,
      transparent: true,
      opacity: 0.25,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.copy(currentMeta.position);
    _scene.add(glowMesh);
    _connectionLines.push(glowMesh); // reuse array for cleanup
  }

  // Add text labels for planets
  _planetMetadata.forEach(meta => {
    const planet = planets.find(p => p.id === meta.id);
    if (planet) {
      _addTextLabel(planet.name, meta.position, meta.size + 2);
    }
  });

  // Build octree for fast raycasting
  _buildOctree();
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

  // Build position lookup from metadata
  const posMap = new Map();
  _planetMetadata.forEach(m => posMap.set(m.id, m));

  // Group planets by faction
  const factionPlanets = {};
  planets.forEach(planet => {
    if (planet.owner && planet.owner !== 'player') {
      if (!factionPlanets[planet.owner]) factionPlanets[planet.owner] = [];
      factionPlanets[planet.owner].push(planet);
    }
  });

  const ADJACENCY_DIST = 0.15; // in normalized coords
  const AURA_RADIUS = 12;      // 3D world units

  Object.entries(factionPlanets).forEach(([factionId, fPlanets]) => {
    const faction = FACTIONS.find(f => f.id === factionId);
    if (!faction) return;
    const fColor = new THREE.Color(faction.color || '#4FC3F7');

    // 1) Draw a translucent disc aura under each faction planet
    fPlanets.forEach(planet => {
      const meta = posMap.get(planet.id);
      if (!meta) return;

      const discGeo = new THREE.CircleGeometry(AURA_RADIUS, 48);
      const discMat = new THREE.MeshBasicMaterial({
        color: fColor,
        transparent: true,
        opacity: 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(meta.position.x, meta.position.y - 0.5, meta.position.z);
      _scene.add(disc);
      _factionBoundaries.push(disc);
    });

    // 2) Draw wide "bridge" tubes between adjacent same-faction planets
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

        // Draw a translucent wide line (using a thin box) between the two
        const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(posB, posA);
        const length = direction.length();
        direction.normalize();

        const bridgeGeo = new THREE.PlaneGeometry(length, AURA_RADIUS * 1.2);
        const bridgeMat = new THREE.MeshBasicMaterial({
          color: fColor,
          transparent: true,
          opacity: 0.06,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.copy(midPoint);
        bridge.position.y -= 0.5;
        bridge.rotation.x = -Math.PI / 2;
        // Rotate to align with direction in XZ plane
        bridge.rotation.z = -Math.atan2(direction.z, direction.x);
        _scene.add(bridge);
        _factionBoundaries.push(bridge);
      }
    }
  });
}

// Simple convex hull algorithm (Gift wrapping)
function _convexHull(points) {
  if (points.length < 3) return points;

  // Find leftmost point
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
  // Build a lookup from planet id to its stored 3D position
  const posMap = new Map();
  _planetMetadata.forEach(m => posMap.set(m.id, m.position));

  // Draw connections between nearby planets using exact metadata positions
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

        const geometry = new THREE.BufferGeometry().setFromPoints([posA, posB]);
        const material = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.15,
        });

        const line = new THREE.Line(geometry, material);
        _scene.add(line);
        _connectionLines.push(line);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 选择环
// ---------------------------------------------------------------------------

function _createSelectionRing() {
  const geometry = new THREE.RingGeometry(3, 3.5, 32);
  const material = new THREE.MeshBasicMaterial({
    color: _COLORS.selected,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });

  _selectionRing = new THREE.Mesh(geometry, material);
  _selectionRing.rotation.x = -Math.PI / 2;
  _selectionRing.visible = false;
  _scene.add(_selectionRing);
}

// ---------------------------------------------------------------------------
// 空间分割（八叉树）
// ---------------------------------------------------------------------------

function _buildOctree() {
  // Simple octree implementation for fast raycasting
  _octree = {
    bounds: { min: { x: -60, y: -30, z: -60 }, max: { x: 60, y: 30, z: 60 } },
    planets: _planetMetadata,
  };
}

function _queryOctree(ray) {
  // For now, return all planets (simple implementation)
  // In production, this would traverse the octree
  return _planetMetadata;
}

// ---------------------------------------------------------------------------
// 相机控制
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 飞船系统
// ---------------------------------------------------------------------------

function _createShipMesh() {
  const group = new THREE.Group();

  // 主体 — 尖锥形机身
  const bodyGeo = new THREE.ConeGeometry(0.35, 1.6, 6);
  bodyGeo.rotateX(Math.PI / 2); // point forward (+Z)
  const bodyMat = new THREE.MeshPhongMaterial({
    color: 0xd0d8e8,
    emissive: 0x223344,
    emissiveIntensity: 0.3,
    shininess: 80,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // 机翼 — 两侧三角翼
  const wingGeo = new THREE.BoxGeometry(2.2, 0.06, 0.7);
  const wingMat = new THREE.MeshPhongMaterial({
    color: 0x8899bb,
    emissive: 0x112233,
    emissiveIntensity: 0.2,
  });
  const wings = new THREE.Mesh(wingGeo, wingMat);
  wings.position.z = -0.2;
  group.add(wings);

  // 驾驶舱 — 半透明蓝色球
  const cockpitGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const cockpitMat = new THREE.MeshPhongMaterial({
    color: 0x44ccff,
    emissive: 0x44ccff,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.7,
  });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(0, 0.15, 0.3);
  group.add(cockpit);

  // 引擎喷口 — 两个橙色发光点
  const engineGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const engineMat = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.9,
  });
  const engineL = new THREE.Mesh(engineGeo, engineMat);
  engineL.position.set(-0.4, 0, -0.6);
  const engineR = new THREE.Mesh(engineGeo, engineMat);
  engineR.position.set(0.4, 0, -0.6);
  group.add(engineL, engineR);

  // 引擎尾焰 — sprite
  const flameCanvas = document.createElement('canvas');
  flameCanvas.width = 64;
  flameCanvas.height = 64;
  const fCtx = flameCanvas.getContext('2d');
  const flameGrad = fCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  flameGrad.addColorStop(0, 'rgba(255,180,50,0.9)');
  flameGrad.addColorStop(0.3, 'rgba(255,100,20,0.5)');
  flameGrad.addColorStop(1, 'rgba(255,50,10,0)');
  fCtx.fillStyle = flameGrad;
  fCtx.fillRect(0, 0, 64, 64);
  const flameTex = new THREE.CanvasTexture(flameCanvas);
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameL = new THREE.Sprite(flameMat);
  flameL.scale.set(0.6, 0.6, 1);
  flameL.position.set(-0.4, 0, -0.9);
  const flameR = new THREE.Sprite(flameMat.clone());
  flameR.scale.set(0.6, 0.6, 1);
  flameR.position.set(0.4, 0, -0.9);
  group.add(flameL, flameR);
  group.userData._flames = [flameL, flameR];

  group.scale.set(1.5, 1.5, 1.5);
  return group;
}

function _createShipTrail() {
  const count = 60;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xff8844,
    size: 0.3,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.userData._count = count;
  points.userData._head = 0;
  return points;
}

function _updateShipTrail(position) {
  if (!_shipTrail) return;
  const posAttr = _shipTrail.geometry.attributes.position;
  const head = _shipTrail.userData._head;
  const count = _shipTrail.userData._count;

  posAttr.setXYZ(head, position.x, position.y, position.z);
  _shipTrail.userData._head = (head + 1) % count;
  posAttr.needsUpdate = true;
}

/**
 * 触发飞船从 fromId 飞到 toId 的动画
 * @param {string} fromId - 起始星球ID
 * @param {string} toId - 目标星球ID
 * @param {Function} [onComplete] - 飞行完成后回调
 */
export function flyShipTo(fromId, toId, onComplete) {
  if (_mapView !== 'planets') return;

  const fromMeta = _planetMetadata.find(m => m.id === fromId);
  const toMeta = _planetMetadata.find(m => m.id === toId);
  if (!fromMeta || !toMeta) {
    if (onComplete) onComplete();
    return;
  }

  const from = fromMeta.position.clone();
  const to = toMeta.position.clone();

  // 弧形飞行路径 — 中点抬高
  const mid = from.clone().lerp(to, 0.5);
  const dist = from.distanceTo(to);
  mid.y += Math.max(dist * 0.2, 5);

  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);

  // 显示飞船
  if (!_shipMesh) {
    _shipMesh = _createShipMesh();
    _scene.add(_shipMesh);
  }
  if (!_shipTrail) {
    _shipTrail = _createShipTrail();
    _scene.add(_shipTrail);
  }

  _shipMesh.visible = true;
  _shipTrail.visible = true;
  _shipVisible = true;
  _shipMesh.position.copy(from);

  // Reset trail positions
  const posAttr = _shipTrail.geometry.attributes.position;
  for (let i = 0; i < _shipTrail.userData._count; i++) {
    posAttr.setXYZ(i, from.x, from.y, from.z);
  }
  posAttr.needsUpdate = true;
  _shipTrail.userData._head = 0;

  // Duration based on distance — 1.5~3s
  const duration = Math.min(3000, Math.max(1500, dist * 30));

  _flightPath = {
    curve,
    progress: 0,
    fromId,
    toId,
    duration,
    startTime: performance.now(),
    onComplete: onComplete || null,
  };

  // Camera follows the flight
  _cameraTarget = null; // cancel any existing transition
}

function _updateShipFlight(time) {
  if (!_flightPath || !_shipMesh) return;

  const elapsed = time - _flightPath.startTime;
  // Ease in-out
  let t = Math.min(elapsed / _flightPath.duration, 1);
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const pos = _flightPath.curve.getPointAt(eased);
  _shipMesh.position.copy(pos);

  // Orient ship along tangent
  const tangent = _flightPath.curve.getTangentAt(eased);
  const lookTarget = pos.clone().add(tangent);
  _shipMesh.lookAt(lookTarget);

  // Update trail
  _updateShipTrail(pos);

  // Animate engine flames
  if (_shipMesh.userData._flames) {
    const flicker = 0.5 + Math.sin(elapsed * 0.02) * 0.15 + Math.random() * 0.1;
    _shipMesh.userData._flames.forEach(f => {
      f.scale.set(flicker, flicker, 1);
    });
  }

  // Camera stays free — no lock-on, player can orbit freely during flight

  if (t >= 1) {
    // Flight complete
    const cb = _flightPath.onComplete;
    _flightPath = null;

    // Hide ship after a brief moment
    setTimeout(() => {
      if (_shipMesh) _shipMesh.visible = false;
      if (_shipTrail) _shipTrail.visible = false;
      _shipVisible = false;
    }, 500);

    if (cb) cb();
  }
}

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
    _camera.position.copy(targetPos);
    _camera.lookAt(metadata.position);
  }
}

export function resetCamera() {
  _cameraTarget = new THREE.Vector3(0, 80, 180);
  _cameraTransitionProgress = 0;
}

// ---------------------------------------------------------------------------
// 动画循环
// ---------------------------------------------------------------------------

function _startAnimation() {
  if (_animationId) return;
  _animate();
}

function _stopAnimation() {
  if (_animationId) {
    cancelAnimationFrame(_animationId);
    _animationId = null;
  }
}

function _animate() {
  _animationId = requestAnimationFrame(_animate);

  const time = Date.now() * 0.001;

  // Update controls
  _controls.update();

  // Camera transition
  if (_cameraTarget && _cameraTransitionProgress < 1) {
    _cameraTransitionProgress += 0.02;
    _camera.position.lerp(_cameraTarget, 0.05);

    if (_cameraTransitionProgress >= 1) {
      _cameraTarget = null;
    }
  }

  // Pulse current system in planet view
  if (_motionLevel !== 'off' && _instancedPlanets && _currentSystem) {
    const meta = _planetMetadata.find(m => m.id === _currentSystem);
    if (meta) {
      const pulseScale = meta.size * (1 + Math.sin(time * 2) * 0.1);
      const matrix = new THREE.Matrix4();
      matrix.compose(
        meta.position,
        new THREE.Quaternion(),
        new THREE.Vector3(pulseScale, pulseScale, pulseScale)
      );
      _instancedPlanets.setMatrixAt(meta.index, matrix);
      _instancedPlanets.instanceMatrix.needsUpdate = true;
    }
  }

  // Slowly rotate galaxy nebulae in galaxy view
  if (_motionLevel !== 'off' && _mapView === 'galaxies') {
    const rotSpeed = _motionLevel === 'reduced' ? 0.002 : 0.005;
    _galaxyMeshes.forEach(group => {
      group.rotation.y += rotSpeed;
    });
  }

  // Rotate background slowly
  if (_backgroundLayers && _motionLevel !== 'off') {
    const speed = _motionLevel === 'reduced' ? 0.0001 : 0.0003;
    _backgroundLayers.stars.rotation.y += speed;
    _backgroundLayers.nebula.rotation.y += speed * 0.5;
  }

  // Update ship flight
  _updateShipFlight(performance.now());

  // Update selection ring
  if (_selectionRing.visible) {
    _selectionRing.rotation.z += 0.01;
    _selectionRing.scale.setScalar(1 + Math.sin(time * 3) * 0.1);
  }

  _renderer.render(_scene, _camera);
}

// ---------------------------------------------------------------------------
// 事件处理
// ---------------------------------------------------------------------------

function _onResize() {
  if (!_isActive) return;
  const container = document.getElementById('map-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  _camera.aspect = w / h;
  _camera.updateProjectionMatrix();
  _renderer.setSize(w, h);
}

function _onMouseMove(event) {
  const rect = _canvas.getBoundingClientRect();
  _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, _camera);

  if (_hoveredPlanet) {
    _hoveredPlanet = null;
  }

  // Galaxy view: raycast against galaxy spheres
  if (_mapView === 'galaxies' && _galaxyMeshes.length > 0) {
    const intersects = _raycaster.intersectObjects(_galaxyMeshes, true);
    if (intersects.length > 0) {
      // Walk up to find the group with userData
      let hit = intersects[0].object;
      while (hit && !hit.userData.type) hit = hit.parent;
      if (hit && hit.userData.type === 'galaxy') {
        _canvas.style.cursor = 'pointer';
        if (window._mapHoverCallback) {
          window._mapHoverCallback({ type: 'galaxy', id: hit.userData.id, ...hit.userData.data });
        }
        return;
      }
    }
    _canvas.style.cursor = 'default';
    if (window._mapHoverCallback) {
      window._mapHoverCallback(null);
    }
    return;
  }

  // Planet view: raycast against instanced mesh
  if (!_instancedPlanets) return;
  const intersects = _raycaster.intersectObject(_instancedPlanets);

  if (intersects.length > 0) {
    const instanceId = intersects[0].instanceId;
    const metadata = _planetMetadata[instanceId];

    if (metadata) {
      _hoveredPlanet = metadata;
      _canvas.style.cursor = 'pointer';

      // Dispatch hover event with correct format for MapUI
      if (window._mapHoverCallback) {
        window._mapHoverCallback({ type: 'system', id: metadata.id });
      }
    }
  } else {
    _canvas.style.cursor = 'default';
    if (window._mapHoverCallback) {
      window._mapHoverCallback(null);
    }
  }
}

function _onClick(event) {
  const rect = _canvas.getBoundingClientRect();
  _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, _camera);

  // Galaxy view: click on galaxy
  if (_mapView === 'galaxies' && _galaxyMeshes.length > 0) {
    const intersects = _raycaster.intersectObjects(_galaxyMeshes, true);
    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData.type) hit = hit.parent;
      if (hit && hit.userData.type === 'galaxy' && window._galaxyClickCallback) {
        window._galaxyClickCallback(hit.userData.id);
      }
    }
    return;
  }

  // Planet view: click on planet
  if (!_hoveredPlanet) return;

  _selectedPlanet = _hoveredPlanet;

  // Position selection ring
  _selectionRing.position.copy(_hoveredPlanet.position);
  _selectionRing.position.y += 0.1;
  _selectionRing.scale.setScalar(_hoveredPlanet.size + 0.5);
  _selectionRing.visible = true;

  // Dispatch click event
  if (window._mapClickCallback) {
    window._mapClickCallback(_hoveredPlanet.id);
  }
}

// ---------------------------------------------------------------------------
// 质量设置
// ---------------------------------------------------------------------------

function _applyQualitySettings() {
  const quality = _QUALITY_SETTINGS[_qualityLevel];

  // Update renderer
  _renderer.setPixelRatio(
    _qualityLevel === 'low' ? 1 : Math.min(window.devicePixelRatio, 2)
  );

  // Rebuild background if needed
  if (_backgroundLayers) {
    _scene.remove(_backgroundLayers.stars);
    _backgroundLayers.stars.geometry.dispose();
    _backgroundLayers.stars.material.dispose();
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
    _selectionRing.visible = false;
  }
}
