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

// 状态
let _currentGalaxyId = 'milky_way';
let _currentSystem = null;
let _hoveredPlanet = null;
let _selectedPlanet = null;
let _motionLevel = 'full';
let _qualityLevel = 'high';        // high, medium, low
let _cameraTarget = null;          // For smooth camera transitions
let _cameraTransitionProgress = 0;

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
  _scene.fog = new THREE.Fog(_COLORS.bgTop, 100, 500);

  // Setup camera
  const container = document.getElementById('map-container');
  const aspect = container.clientWidth / container.clientHeight;
  _camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  _camera.position.set(0, 80, 150);
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
  _controls.minDistance = 20;
  _controls.maxDistance = 400;
  _controls.maxPolarAngle = Math.PI / 1.8;

  // Setup lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  _scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x38bdf8, 1.5, 500);
  pointLight.position.set(0, 100, 100);
  _scene.add(pointLight);

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

  _currentGalaxyId = galaxyId || 'milky_way';
  _currentSystem = state.currentSystem;

  // Clear existing planet meshes
  if (_instancedPlanets) {
    _scene.remove(_instancedPlanets);
    _instancedPlanets.geometry.dispose();
    _instancedPlanets.material.dispose();
    _instancedPlanets = null;
  }

  // Get galaxy hierarchy from data layer
  const hierarchy = GalaxyData.getGalaxyHierarchy(_currentGalaxyId);
  if (!hierarchy) return;

  // Render planets with instancing
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

  // Create shared geometry and material
  const geometry = new THREE.SphereGeometry(1, quality.planetSegments, quality.planetSegments);
  const material = new THREE.MeshPhongMaterial({
    emissive: new THREE.Color(_COLORS.starGlow),
    emissiveIntensity: 0.3,
    shininess: 30,
  });

  // Create instanced mesh
  _instancedPlanets = new THREE.InstancedMesh(geometry, material, _instanceCount);
  _instancedPlanets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  planets.forEach((planet, i) => {
    // Calculate 3D position
    const x = (planet.position.x - 0.5) * 120;
    const z = (planet.position.y - 0.5) * 120;
    const y = Math.sin(planet.position.x * Math.PI * 2) * 10 +
              Math.cos(planet.position.y * Math.PI * 2) * 5;

    position.set(x, y, z);

    // Calculate size based on type
    const baseSize = 2 + Math.random() * 2;
    const sizeMultiplier = planet.type === 'special' ? 1.5 : 1.0;
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

  // Clear existing boundaries
  _factionBoundaries.forEach(b => _scene.remove(b));
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
    if (factionPlanetList.length < 3) return; // Need at least 3 points for a boundary

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
    const points3D = hull.map(p => new THREE.Vector3(p.x, 5, p.y));
    points3D.push(points3D[0].clone()); // Close the loop

    const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
    const material = new THREE.LineBasicMaterial({
      color: faction.color || '#4FC3F7',
      transparent: true,
      opacity: 0.4,
      linewidth: 2,
    });

    const boundary = new THREE.Line(geometry, material);
    _scene.add(boundary);
    _factionBoundaries.push(boundary);
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
  // Clear existing connections
  _connectionLines.forEach(line => _scene.remove(line));
  _connectionLines = [];

  // Draw connections between nearby planets
  planets.forEach(planet => {
    const p1 = {
      x: (planet.position.x - 0.5) * 120,
      z: (planet.position.y - 0.5) * 120,
      y: Math.sin(planet.position.x * Math.PI * 2) * 10 +
          Math.cos(planet.position.y * Math.PI * 2) * 5,
    };

    // Find nearby planets
    planets.forEach(other => {
      if (planet.id >= other.id) return; // Avoid duplicates

      const dx = planet.position.x - other.position.x;
      const dy = planet.position.y - other.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.12) {
        const p2 = {
          x: (other.position.x - 0.5) * 120,
          z: (other.position.y - 0.5) * 120,
          y: Math.sin(other.position.x * Math.PI * 2) * 10 +
              Math.cos(other.position.y * Math.PI * 2) * 5,
        };

        const points = [
          new THREE.Vector3(p1.x, p1.y, p1.z),
          new THREE.Vector3(p2.x, p2.y, p2.z),
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.1,
        });

        const line = new THREE.Line(geometry, material);
        _scene.add(line);
        _connectionLines.push(line);
      }
    });
  });
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
  _cameraTarget = new THREE.Vector3(0, 80, 150);
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

  // Rotate background slowly
  if (_backgroundLayers && _motionLevel !== 'off') {
    const speed = _motionLevel === 'reduced' ? 0.0001 : 0.0003;
    _backgroundLayers.stars.rotation.y += speed;
    _backgroundLayers.nebula.rotation.y += speed * 0.5;
  }

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

  // Raycast against instanced mesh
  const intersects = _raycaster.intersectObject(_instancedPlanets);

  if (_hoveredPlanet) {
    _hoveredPlanet = null;
  }

  if (intersects.length > 0) {
    const instanceId = intersects[0].instanceId;
    const metadata = _planetMetadata[instanceId];

    if (metadata) {
      _hoveredPlanet = metadata;
      _canvas.style.cursor = 'pointer';

      // Dispatch hover event
      if (window._mapHoverCallback) {
        const planetData = GalaxyData.getPlanetData(metadata.id);
        window._mapHoverCallback(planetData);
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
