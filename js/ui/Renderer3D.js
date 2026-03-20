// js/ui/Renderer3D.js — Three.js 3D星空图渲染器
// 依赖：three.js, data/systems.js, systems/faction/FactionSystem.js
// 导出：init, resetRuntimeState, setMotionLevel, render, getSystemAtPoint, toggleView, isActive

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SYSTEMS, GALAXIES, getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { FACTIONS } from '../data/factions.js';

let _canvas;
let _scene, _camera, _renderer, _controls;
let _systemMeshes = [];
let _galaxyMeshes = [];
let _starField;
let _animationId = null;
let _isActive = false;
let _mapView = 'planets'; // 'planets' or 'galaxies'
let _currentGalaxyId = 'milky_way';
let _hoveredSystem = null;
let _currentSystem = null;
let _motionLevel = 'full';
let _resizeBound = false;

// Raycaster for mouse picking
let _raycaster, _mouse;

const _NEON = {
  bgTop: 0x020817,
  bgBottom: 0x061528,
  starCore: 0xdffbff,
  starGlow: 0x38bdf8,
  starAlt: 0x67e8f9,
  current: 0x67e8f9,
  hover: 0xdffbff,
  lock: 0x4b6385,
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

  // Setup raycaster for mouse picking
  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();

  // Create scene
  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(_NEON.bgTop);
  _scene.fog = new THREE.Fog(_NEON.bgTop, 50, 200);

  // Create camera
  const container = document.getElementById('map-container');
  const aspect = container.clientWidth / container.clientHeight;
  _camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  _camera.position.set(0, 50, 100);
  _camera.lookAt(0, 0, 0);

  // Create renderer
  _renderer = new THREE.WebGLRenderer({
    canvas: _canvas,
    antialias: true,
    alpha: false
  });
  _renderer.setSize(container.clientWidth, container.clientHeight);
  _renderer.setPixelRatio(window.devicePixelRatio);

  // Add orbit controls for drag-to-rotate
  _controls = new OrbitControls(_camera, _canvas);
  _controls.enableDamping = true;
  _controls.dampingFactor = 0.05;
  _controls.screenSpacePanning = false;
  _controls.minDistance = 30;
  _controls.maxDistance = 300;
  _controls.maxPolarAngle = Math.PI / 1.5;

  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  _scene.add(ambientLight);

  // Add point light
  const pointLight = new THREE.PointLight(0x38bdf8, 1, 300);
  pointLight.position.set(0, 50, 50);
  _scene.add(pointLight);

  // Create starfield background
  _createStarField();

  // Setup resize handler
  if (!_resizeBound) {
    window.addEventListener('resize', _resize);
    _resizeBound = true;
  }

  // Setup mouse move handler for hover effects
  _canvas.addEventListener('mousemove', _onMouseMove);
  _canvas.addEventListener('click', _onClick);

  console.log('3D Renderer initialized');
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
    _startAnimation();
  } else {
    // Show 2D, hide 3D
    _canvas.style.display = 'none';
    canvas2d.style.display = 'block';
    canvasWebgl.style.display = 'block';
    _stopAnimation();
  }
}

function _resize() {
  if (!_isActive) return;
  const container = document.getElementById('map-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  _camera.aspect = w / h;
  _camera.updateProjectionMatrix();
  _renderer.setSize(w, h);
}

// ---------------------------------------------------------------------------
// 星空背景
// ---------------------------------------------------------------------------

function _createStarField() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: _NEON.starGlow,
    size: 2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
  });

  const starsVertices = [];
  for (let i = 0; i < 1000; i++) {
    const x = (Math.random() - 0.5) * 400;
    const y = (Math.random() - 0.5) * 400;
    const z = (Math.random() - 0.5) * 400;
    starsVertices.push(x, y, z);
  }

  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
  _starField = new THREE.Points(starsGeometry, starsMaterial);
  _scene.add(_starField);
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
  _systemMeshes.forEach(mesh => _scene.remove(mesh));
  _galaxyMeshes.forEach(mesh => _scene.remove(mesh));
  _systemMeshes = [];
  _galaxyMeshes = [];
}

function _renderGalaxies(state) {
  GALAXIES.forEach((galaxy, index) => {
    // Convert 2D positions to 3D
    const x = (galaxy.gx - 0.5) * 150;
    const z = (galaxy.gy - 0.5) * 150;
    const y = (Math.random() - 0.5) * 20; // Small random Y variation

    // Create galaxy sphere
    const geometry = new THREE.SphereGeometry(8, 32, 32);
    const color = new THREE.Color(galaxy.color || '#4FC3F7');
    const material = new THREE.MeshPhongMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: galaxy.unlocked ? 0.9 : 0.4,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData = { type: 'galaxy', id: galaxy.id, data: galaxy };

    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(12, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    mesh.add(glow);

    _scene.add(mesh);
    _galaxyMeshes.push(mesh);

    // Add text label (using sprite)
    _addTextLabel(galaxy.name, mesh.position, 15);
  });
}

function _renderPlanets(state, galaxyId) {
  const systems = getSystemsByGalaxy(galaxyId);
  const accessible = systems.filter(sys => isSystemAccessible(sys, state));

  accessible.forEach(system => {
    // Convert 2D positions to 3D with more spread
    const x = (system.x - 0.5) * 120;
    const z = (system.y - 0.5) * 120;
    // Add Z-depth based on system properties for 3D effect
    const y = (Math.sin(system.x * Math.PI * 2) * 10) + (Math.cos(system.y * Math.PI * 2) * 5);

    // Create planet sphere
    const size = 2 + Math.random() * 2;
    const geometry = new THREE.SphereGeometry(size, 32, 32);

    // Get color from system type
    const systemColor = _getSystemColor(system.type);
    const color = new THREE.Color(systemColor);

    const isCurrent = system.id === _currentSystem;
    const material = new THREE.MeshPhongMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: isCurrent ? 0.8 : 0.3,
      transparent: true,
      opacity: 0.9,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData = { type: 'system', id: system.id, data: system };

    // Add glow for current system
    if (isCurrent) {
      const glowGeometry = new THREE.SphereGeometry(size + 2, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: _NEON.current,
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      mesh.add(glow);
    }

    _scene.add(mesh);
    _systemMeshes.push(mesh);

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
    return dist < 0.15; // Connection threshold
  });

  nearby.forEach(other => {
    const otherX = (other.x - 0.5) * 120;
    const otherZ = (other.y - 0.5) * 120;
    const otherY = (Math.sin(other.x * Math.PI * 2) * 10) + (Math.cos(other.y * Math.PI * 2) * 5);

    const points = [position, new THREE.Vector3(otherX, otherY, otherZ)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.15,
    });
    const line = new THREE.Line(geometry, material);
    _scene.add(line);
    _systemMeshes.push(line);
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
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(position.x, position.y + offsetY, position.z);
  sprite.scale.set(20, 5, 1);
  _scene.add(sprite);
  _systemMeshes.push(sprite);
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

  // Update controls
  _controls.update();

  // Rotate starfield slowly
  if (_starField && _motionLevel !== 'off') {
    const speed = _motionLevel === 'reduced' ? 0.0001 : 0.0003;
    _starField.rotation.y += speed;
  }

  // Pulse current system
  if (_motionLevel !== 'off') {
    const time = Date.now() * 0.001;
    _systemMeshes.forEach(mesh => {
      if (mesh.userData.type === 'system' && mesh.userData.id === _currentSystem) {
        const scale = 1 + Math.sin(time * 2) * 0.1;
        mesh.scale.set(scale, scale, scale);
      }
    });
  }

  _renderer.render(_scene, _camera);
}

// ---------------------------------------------------------------------------
// 鼠标交互
// ---------------------------------------------------------------------------

function _onMouseMove(event) {
  const rect = _canvas.getBoundingClientRect();
  _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, _camera);
  const intersects = _raycaster.intersectObjects([..._systemMeshes, ..._galaxyMeshes]);

  // Reset previous hover
  if (_hoveredSystem) {
    _hoveredSystem.material.emissiveIntensity =
      _hoveredSystem.userData.id === _currentSystem ? 0.8 : 0.3;
    _hoveredSystem = null;
  }

  // Set new hover
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.type === 'system' || obj.userData.type === 'galaxy') {
      _hoveredSystem = obj;
      obj.material.emissiveIntensity = 1.0;
      _canvas.style.cursor = 'pointer';

      // Dispatch hover event
      if (window._mapHoverCallback) {
        window._mapHoverCallback(obj.userData.data);
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
  const intersects = _raycaster.intersectObjects([..._systemMeshes, ..._galaxyMeshes]);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.type === 'system' && window._mapClickCallback) {
      window._mapClickCallback(obj.userData.id);
    } else if (obj.userData.type === 'galaxy' && window._galaxyClickCallback) {
      window._galaxyClickCallback(obj.userData.id);
    }
  }
}

export function getSystemAtPoint(x, y) {
  // Not used in 3D mode - handled by raycasting
  return null;
}
