// js/ui/Renderer.js — WebGL 动态星空背景 + 2D Canvas 星系地图
// 依赖：data/systems.js, systems/faction/FactionSystem.js
// 导出：init, renderStars, renderMap, getSystemAtPoint

import { SYSTEMS, GALAXIES, getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { FACTIONS } from '../data/factions.js';

let _webglCanvas, _gl, _glProgram;
let _mapCanvas, _ctx;
let _stars = [];

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export function init() {
  _webglCanvas = document.getElementById('webgl-canvas');
  _mapCanvas   = document.getElementById('map-canvas');
  _ctx         = _mapCanvas.getContext('2d');

  _generateStars(300);
  _resize();
  window.addEventListener('resize', _resize);
  _initWebGL();
}

function _resize() {
  const container = document.getElementById('map-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  _webglCanvas.width  = w;
  _webglCanvas.height = h;
  _mapCanvas.width    = w;
  _mapCanvas.height   = h;
  if (_gl) _gl.viewport(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// WebGL — 动态星空
// ---------------------------------------------------------------------------

const _VS_SOURCE = `
  attribute vec2  aPosition;
  attribute float aSize;
  attribute float aBrightness;
  uniform   vec2  uResolution;
  varying   float vBrightness;
  void main() {
    vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
    gl_Position  = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
    gl_PointSize = aSize;
    vBrightness  = aBrightness;
  }
`;

const _FS_SOURCE = `
  precision mediump float;
  varying float vBrightness;
  void main() {
    vec2  c    = gl_PointCoord - vec2(0.5);
    float dist = length(c);
    if (dist > 0.5) discard;
    float alpha = (1.0 - dist * 2.0) * vBrightness;
    gl_FragColor = vec4(0.80, 0.85, 1.0, alpha);
  }
`;

function _compileShader(type, source) {
  const shader = _gl.createShader(type);
  _gl.shaderSource(shader, source);
  _gl.compileShader(shader);
  if (!_gl.getShaderParameter(shader, _gl.COMPILE_STATUS)) {
    console.error('Shader error:', _gl.getShaderInfoLog(shader));
    _gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function _initWebGL() {
  try {
    _gl = _webglCanvas.getContext('webgl') ||
          _webglCanvas.getContext('experimental-webgl');
    if (!_gl) return;

    const vs = _compileShader(_gl.VERTEX_SHADER,   _VS_SOURCE);
    const fs = _compileShader(_gl.FRAGMENT_SHADER, _FS_SOURCE);
    if (!vs || !fs) { _gl = null; return; }

    _glProgram = _gl.createProgram();
    _gl.attachShader(_glProgram, vs);
    _gl.attachShader(_glProgram, fs);
    _gl.linkProgram(_glProgram);

    if (!_gl.getProgramParameter(_glProgram, _gl.LINK_STATUS)) {
      console.error('Program link error:', _gl.getProgramInfoLog(_glProgram));
      _gl = null;
      return;
    }

    _gl.useProgram(_glProgram);
    _gl.enable(_gl.BLEND);
    _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA);
  } catch (e) {
    console.warn('WebGL unavailable, falling back to 2D canvas starfield.', e);
    _gl = null;
  }
}

// ---------------------------------------------------------------------------
// 星星数据
// ---------------------------------------------------------------------------

function _generateStars(count) {
  _stars = [];
  for (let i = 0; i < count; i++) {
    _stars.push({
      x:             Math.random(),
      y:             Math.random(),
      size:          Math.random() * 2.5 + 0.5,
      brightness:    Math.random() * 0.7 + 0.3,
      twinkleSpeed:  Math.random() * 0.02 + 0.005,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }
}

// ---------------------------------------------------------------------------
// 渲染星空
// ---------------------------------------------------------------------------

export function renderStars(time) {
  const w = _webglCanvas.width;
  const h = _webglCanvas.height;
  if (_gl && _glProgram) {
    _renderStarsWebGL(time, w, h);
  } else {
    _renderStarsCanvas(time, w, h);
  }
}

function _renderStarsWebGL(time, w, h) {
  const gl = _gl;
  gl.clearColor(0.035, 0.035, 0.10, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const n            = _stars.length;
  const positions    = new Float32Array(n * 2);
  const sizes        = new Float32Array(n);
  const brightnesses = new Float32Array(n);

  _stars.forEach(function (s, i) {
    positions[i * 2]     = s.x * w;
    positions[i * 2 + 1] = s.y * h;
    sizes[i]             = s.size;
    const twinkle        = Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.3;
    brightnesses[i]      = Math.max(0.1, Math.min(1.0, s.brightness + twinkle));
  });

  function _uploadAttr(name, data, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const loc = gl.getAttribLocation(_glProgram, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  }

  const b1 = _uploadAttr('aPosition',   positions,    2);
  const b2 = _uploadAttr('aSize',       sizes,        1);
  const b3 = _uploadAttr('aBrightness', brightnesses, 1);

  gl.uniform2f(gl.getUniformLocation(_glProgram, 'uResolution'), w, h);
  gl.drawArrays(gl.POINTS, 0, n);

  gl.deleteBuffer(b1);
  gl.deleteBuffer(b2);
  gl.deleteBuffer(b3);
}

function _renderStarsCanvas(time, w, h) {
  const ctx = _webglCanvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);
  _stars.forEach(function (s) {
    const twinkle    = Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.3;
    const brightness = Math.max(0.1, Math.min(1.0, s.brightness + twinkle));
    ctx.globalAlpha  = brightness;
    ctx.fillStyle    = '#c0d0ff';
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// 渲染星系地图（2D Canvas 覆盖层）
// ---------------------------------------------------------------------------

export function renderMap(gameState, time) {
  const ctx = _ctx;
  const w   = _mapCanvas.width;
  const h   = _mapCanvas.height;
  ctx.clearRect(0, 0, w, h);

  if (gameState.mapView === 'galaxies') {
    _renderGalaxyMap(ctx, w, h, gameState, time);
  } else {
    _renderPlanetMap(ctx, w, h, gameState, time);
  }
}

// --- 星系总览地图 ---
function _renderGalaxyMap(ctx, w, h, gameState, time) {
  // 星系连线
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < GALAXIES.length; i++) {
    for (let j = i + 1; j < GALAXIES.length; j++) {
      ctx.beginPath();
      ctx.moveTo(GALAXIES[i].gx * w, GALAXIES[i].gy * h);
      ctx.lineTo(GALAXIES[j].gx * w, GALAXIES[j].gy * h);
      ctx.stroke();
    }
  }

  GALAXIES.forEach(function (gal) {
    const x = gal.gx * w;
    const y = gal.gy * h;
    const isCurrent = gal.id === gameState.currentGalaxy;
    const isViewing = gal.id === gameState.viewingGalaxy;
    const unlocked  = gal.unlocked || (gameState.researchedTechs && gameState.researchedTechs.includes(gal.techRequired));
    const radius    = isCurrent ? 32 : 24;

    // 星云光晕
    const glowR = radius + 30;
    const glow  = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    glow.addColorStop(0, gal.color + (unlocked ? '44' : '22'));
    glow.addColorStop(1, gal.color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 星系本体
    ctx.globalAlpha = unlocked ? 1 : 0.4;
    ctx.fillStyle = gal.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 边框
    ctx.strokeStyle = isCurrent ? '#FFD700' : (isViewing ? '#ffffff' : 'rgba(255,255,255,0.3)');
    ctx.lineWidth = isCurrent ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 当前星系脉冲
    if (isCurrent) {
      const pulse = Math.sin(time * 0.003) * 8 + radius + 12;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 图标
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gal.icon, x, y + 7);

    // 名称
    ctx.fillStyle = isCurrent ? '#FFD700' : (unlocked ? '#e0e0ff' : '#606080');
    ctx.font = (isCurrent ? 'bold ' : '') + '13px "Segoe UI", sans-serif';
    ctx.fillText(gal.name, x, y + radius + 18);

    // 星球数量
    const allCount = getSystemsByGalaxy(gal.id).length;
    const accessCount = getSystemsByGalaxy(gal.id).filter(function (s) {
      return (gameState.playerLevel || 1) >= (s.minLevel || 1);
    }).length;
    ctx.fillStyle = gal.color + 'cc';
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillText(accessCount + '/' + allCount + ' 星球' + (unlocked ? '' : ' 🔒'), x, y + radius + 30);
  });
}

// --- 星球地图（指定星系） ---
function _renderPlanetMap(ctx, w, h, gameState, time) {
  const viewGal = gameState.viewingGalaxy || gameState.currentGalaxy || 'milky_way';
  const planets = getSystemsByGalaxy(viewGal);
  const galDef  = GALAXIES.find(function (g) { return g.id === viewGal; });
  const isRemote = viewGal !== gameState.currentGalaxy;

  // --- 星系名称标题 ---
  if (galDef) {
    ctx.fillStyle = galDef.color + '88';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(galDef.icon + ' ' + galDef.name + (isRemote ? ' (远程查看)' : ''), 8, 16);
  }

  // --- 派系领地底色 ---
  FACTIONS.forEach(function (faction) {
    if (!faction.controlledSystems || faction.controlledSystems.length === 0) return;
    const points = faction.controlledSystems.map(function (sysId) {
      const s = planets.find(function (ss) { return ss.id === sysId; });
      return s ? { x: s.x * w, y: s.y * h } : null;
    }).filter(Boolean);
    if (points.length === 0) return;
    points.forEach(function (p) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 45);
      grad.addColorStop(0, faction.color + '15');
      grad.addColorStop(1, faction.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 45, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // --- 航线 ---
  const playerLevel = gameState.playerLevel || 1;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const s1 = planets[i], s2 = planets[j];
      const dist = Math.sqrt((s1.x - s2.x) ** 2 + (s1.y - s2.y) ** 2);
      if (dist < 0.28) {
        const s1ok = playerLevel >= (s1.minLevel || 1);
        const s2ok = playerLevel >= (s2.minLevel || 1);
        if (s1ok && s2ok) {
          ctx.strokeStyle = 'rgba(100, 150, 255, 0.10)';
        } else {
          ctx.strokeStyle = 'rgba(100, 150, 255, 0.03)';
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s1.x * w, s1.y * h);
        ctx.lineTo(s2.x * w, s2.y * h);
        ctx.stroke();
      }
    }
  }

  // --- 悬浮高亮航线 ---
  if (gameState.hoveredSystem && gameState.hoveredSystem !== gameState.currentSystem) {
    const cur = findSystem(gameState.currentSystem);
    const hov = findSystem(gameState.hoveredSystem);
    if (cur && hov && cur.galaxyId === hov.galaxyId) {
      ctx.strokeStyle = 'rgba(255, 200, 50, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(cur.x * w, cur.y * h);
      ctx.lineTo(hov.x * w, hov.y * h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // --- 星球节点 ---
  planets.forEach(function (sys) {
    const x = sys.x * w;
    const y = sys.y * h;
    const isCurrent = sys.id === gameState.currentSystem;
    const isHovered = sys.id === gameState.hoveredSystem;
    const isGenerated = sys.generated;
    const isLocked = !isCurrent && playerLevel < (sys.minLevel || 1);
    const radius = isCurrent ? 10 : (isHovered ? 8 : (isGenerated ? 5 : 7));

    // 已锁定星球半透明
    if (isLocked) ctx.globalAlpha = 0.3;

    // 光晕
    const glowR = radius + 8;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    glow.addColorStop(0, sys.color + '44');
    glow.addColorStop(1, sys.color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 星球本体
    ctx.fillStyle = sys.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 边框
    ctx.strokeStyle = isCurrent ? '#FFD700' : (isHovered ? '#ffffff' : 'rgba(255,255,255,0.25)');
    ctx.lineWidth = isCurrent ? 2.5 : (isHovered ? 1.5 : 0.5);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 脉冲环
    if (isCurrent) {
      const pulse = Math.sin(time * 0.003) * 5 + radius + 8;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 名称（生成星球只在悬停时显示）
    if (!isGenerated || isCurrent || isHovered) {
      ctx.fillStyle = isLocked ? '#606080' : (isCurrent ? '#FFD700' : (isHovered ? '#ffffff' : '#c0c0e0'));
      ctx.font = (isCurrent ? 'bold ' : '') + (isGenerated ? '9px' : '10px') + ' "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sys.name + (isLocked ? ' 🔒' : ''), x, y + radius + 12);

      const faction = FACTIONS.find(function (f) { return f.controlledSystems.includes(sys.id); });
      const typeText = '[' + sys.typeLabel + ']' + (faction ? ' ' + faction.icon : '') + (isLocked ? ' Lv.' + (sys.minLevel || 1) : '');
      ctx.fillStyle = isLocked ? '#505060' : (sys.color + 'aa');
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.fillText(typeText, x, y + radius + 22);
    }

    if (isLocked) ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------------------
// 命中检测：返回鼠标点击/悬停的星系
// ---------------------------------------------------------------------------

export function getSystemAtPoint(px, py, canvasW, canvasH, galaxyId) {
  const planets = galaxyId ? getSystemsByGalaxy(galaxyId) : SYSTEMS;
  for (const sys of planets) {
    const sx   = sys.x * canvasW;
    const sy   = sys.y * canvasH;
    const dist = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
    if (dist <= 18) return sys;
  }
  return null;
}

export function getGalaxyAtPoint(px, py, canvasW, canvasH) {
  for (const gal of GALAXIES) {
    const gx   = gal.gx * canvasW;
    const gy   = gal.gy * canvasH;
    const dist = Math.sqrt((px - gx) ** 2 + (py - gy) ** 2);
    if (dist <= 40) return gal;
  }
  return null;
}
