// js/ui/Renderer.js — WebGL 动态星空背景 + 2D Canvas 星系地图
// 依赖：data/systems.js, systems/faction/FactionSystem.js
// 导出：init, setMotionLevel, renderStars, renderMap, getSystemAtPoint

import { SYSTEMS, GALAXIES, getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { FACTIONS } from '../data/factions.js';

let _webglCanvas, _gl, _glProgram;
let _mapCanvas, _ctx;
let _stars = [];
let _dpr = 1;
let _lastCurrentSystem = null;
let _travelPulse = null;
let _motionLevel = 'full';

const _NEON = {
  bgTop: '#020817',
  bgBottom: '#061528',
  starCore: '#dffbff',
  starGlow: '#38bdf8',
  starAlt: '#67e8f9',
  route: 'rgba(56, 189, 248, 0.16)',
  routeDim: 'rgba(56, 189, 248, 0.05)',
  routeHot: 'rgba(103, 232, 249, 0.9)',
  current: '#67e8f9',
  hover: '#dffbff',
  lock: '#4b6385',
  text: '#d9f3ff',
  textDim: '#86a9c8',
};

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

export function setMotionLevel(level) {
  _motionLevel = ['full', 'reduced', 'off'].indexOf(level) >= 0 ? level : 'full';
}

function _getMotionTime(time) {
  if (_motionLevel === 'off') return 0;
  if (_motionLevel === 'reduced') return time * 0.35;
  return time;
}

function _resize() {
  const container = document.getElementById('map-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  _dpr = window.devicePixelRatio || 1;
  _webglCanvas.width  = w * _dpr;
  _webglCanvas.height = h * _dpr;
  _mapCanvas.width    = w * _dpr;
  _mapCanvas.height   = h * _dpr;
  _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  if (_gl) _gl.viewport(0, 0, w * _dpr, h * _dpr);
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
    float glow = smoothstep(0.5, 0.0, dist);
    float core = smoothstep(0.18, 0.0, dist);
    vec3 color = mix(vec3(0.22, 0.74, 0.97), vec3(0.87, 0.98, 1.0), core);
    float alpha = glow * vBrightness;
    gl_FragColor = vec4(color, alpha);
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
      drift:         Math.random() * 0.0008 + 0.00015,
      hue:           Math.random(),
    });
  }
}

function _setTextStyle(ctx, size, bold) {
  ctx.font = (bold ? '600 ' : '500 ') + size + 'px "Rajdhani", "Segoe UI", sans-serif';
}

function _drawNeonConnection(ctx, x1, y1, x2, y2, options) {
  const lineWidth = options.lineWidth || 1;
  const glowWidth = options.glowWidth || (lineWidth + 3);
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, options.start || _NEON.routeDim);
  gradient.addColorStop(0.5, options.mid || _NEON.route);
  gradient.addColorStop(1, options.end || _NEON.routeDim);

  ctx.save();
  ctx.strokeStyle = options.glow || 'rgba(34, 211, 238, 0.08)';
  ctx.lineWidth = glowWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = gradient;
  ctx.lineWidth = lineWidth;
  if (options.dash) ctx.setLineDash(options.dash);
  if (typeof options.dashOffset === 'number') ctx.lineDashOffset = options.dashOffset;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function _drawPulseRing(ctx, x, y, radius, color, alpha) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function _startTravelPulse(gameState, time) {
  if (!_lastCurrentSystem || _lastCurrentSystem === gameState.currentSystem) {
    _lastCurrentSystem = gameState.currentSystem;
    return;
  }
  const fromSystem = findSystem(_lastCurrentSystem);
  const toSystem = findSystem(gameState.currentSystem);
  if (!fromSystem || !toSystem) {
    _lastCurrentSystem = gameState.currentSystem;
    return;
  }
  _travelPulse = {
    fromSystemId: fromSystem.id,
    toSystemId: toSystem.id,
    fromGalaxyId: fromSystem.galaxyId,
    toGalaxyId: toSystem.galaxyId,
    startedAt: time,
    duration: fromSystem.galaxyId === toSystem.galaxyId ? 1250 : 1650,
  };
  _lastCurrentSystem = gameState.currentSystem;
}

function _drawTravelPulseOnPlanets(ctx, w, h, gameState, time) {
  if (!_travelPulse) return;
  const viewGal = gameState.viewingGalaxy || gameState.currentGalaxy;
  const fromSystem = findSystem(_travelPulse.fromSystemId);
  const toSystem = findSystem(_travelPulse.toSystemId);
  if (!fromSystem || !toSystem) return;
  if (fromSystem.galaxyId !== toSystem.galaxyId) {
    if (viewGal !== toSystem.galaxyId) return;
    const arrivalProgress = Math.min(1, Math.max(0, (time - _travelPulse.startedAt - _travelPulse.duration * 0.42) / (_travelPulse.duration * 0.58)));
    const tx = toSystem.x * w;
    const ty = toSystem.y * h;
    _drawPulseRing(ctx, tx, ty, 12 + arrivalProgress * 18, 'rgba(103, 232, 249, 0.95)', 0.5 * (1 - arrivalProgress));
    _drawPulseRing(ctx, tx, ty, 6 + arrivalProgress * 10, 'rgba(223, 251, 255, 0.95)', 0.35 * (1 - arrivalProgress));
    return;
  }
  if (viewGal !== fromSystem.galaxyId) return;

  const progress = Math.min(1, Math.max(0, (time - _travelPulse.startedAt) / _travelPulse.duration));
  const sx = fromSystem.x * w;
  const sy = fromSystem.y * h;
  const tx = toSystem.x * w;
  const ty = toSystem.y * h;
  const px = sx + (tx - sx) * progress;
  const py = sy + (ty - sy) * progress;

  _drawNeonConnection(ctx, sx, sy, tx, ty, {
    start: 'rgba(103, 232, 249, 0.1)',
    mid: 'rgba(34, 211, 238, 0.3)',
    end: 'rgba(103, 232, 249, 0.1)',
    glow: 'rgba(34, 211, 238, 0.12)',
    lineWidth: 2,
    glowWidth: 8,
    dash: [10, 8],
    dashOffset: -(time * 0.02),
  });

  const tail = ctx.createLinearGradient(sx, sy, px, py);
  tail.addColorStop(0, 'rgba(34, 211, 238, 0)');
  tail.addColorStop(0.55, 'rgba(34, 211, 238, 0.18)');
  tail.addColorStop(1, 'rgba(223, 251, 255, 0.9)');
  ctx.save();
  ctx.strokeStyle = tail;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.restore();

  _drawNeonNode(ctx, px, py, 4.5, '#dffbff', {
    glowExtra: 14,
    glowColor: '#22d3ee',
    strokeColor: 'rgba(223, 251, 255, 0.95)',
    strokeWidth: 1.2,
    coreColor: '#ffffff',
  });

  if (progress >= 0.82) {
    const arrival = (progress - 0.82) / 0.18;
    _drawPulseRing(ctx, tx, ty, 10 + arrival * 14, 'rgba(103, 232, 249, 0.9)', 0.42 * (1 - arrival));
  }
}

function _drawTravelPulseOnGalaxies(ctx, w, h, time) {
  if (!_travelPulse) return;
  const fromGalaxy = GALAXIES.find(function (g) { return g.id === _travelPulse.fromGalaxyId; });
  const toGalaxy = GALAXIES.find(function (g) { return g.id === _travelPulse.toGalaxyId; });
  if (!fromGalaxy || !toGalaxy) return;

  const progress = Math.min(1, Math.max(0, (time - _travelPulse.startedAt) / _travelPulse.duration));
  const sx = fromGalaxy.gx * w;
  const sy = fromGalaxy.gy * h;
  const tx = toGalaxy.gx * w;
  const ty = toGalaxy.gy * h;
  const px = sx + (tx - sx) * progress;
  const py = sy + (ty - sy) * progress;

  _drawNeonConnection(ctx, sx, sy, tx, ty, {
    start: 'rgba(56, 189, 248, 0.08)',
    mid: 'rgba(103, 232, 249, 0.24)',
    end: 'rgba(56, 189, 248, 0.08)',
    glow: 'rgba(34, 211, 238, 0.1)',
    lineWidth: 2,
    glowWidth: 8,
    dash: [12, 10],
    dashOffset: -(time * 0.02),
  });

  _drawNeonNode(ctx, px, py, 5, '#dffbff', {
    glowExtra: 16,
    glowColor: '#22d3ee',
    strokeColor: 'rgba(223, 251, 255, 0.95)',
    strokeWidth: 1.3,
    coreColor: '#ffffff',
  });
}

function _updateTravelPulse(gameState, time) {
  _startTravelPulse(gameState, time);
  if (_travelPulse && time - _travelPulse.startedAt > _travelPulse.duration) {
    _travelPulse = null;
  }
}

function _drawNeonNode(ctx, x, y, radius, color, options) {
  const glowR = radius + (options.glowExtra || 12);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  glow.addColorStop(0, (options.glowColor || color) + '66');
  glow.addColorStop(0.45, (options.glowColor || color) + '22');
  glow.addColorStop(1, (options.glowColor || color) + '00');
  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = options.coreColor || _NEON.starCore;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.4, radius * 0.38), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = options.strokeColor || 'rgba(223, 251, 255, 0.5)';
  ctx.lineWidth = options.strokeWidth || 1.25;
  ctx.beginPath();
  ctx.arc(x, y, radius + 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 渲染星空
// ---------------------------------------------------------------------------

export function renderStars(time) {
  const motionTime = _getMotionTime(time);
  const w = _webglCanvas.width;
  const h = _webglCanvas.height;
  if (_gl && _glProgram) {
    _renderStarsWebGL(motionTime, w, h);
  } else {
    _renderStarsCanvas(motionTime, w, h);
  }
}

function _renderStarsWebGL(time, w, h) {
  const gl = _gl;
  gl.clearColor(0.008, 0.031, 0.078, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const n            = _stars.length;
  const positions    = new Float32Array(n * 2);
  const sizes        = new Float32Array(n);
  const brightnesses = new Float32Array(n);

  _stars.forEach(function (s, i) {
    const driftX         = Math.sin(time * s.drift + s.twinkleOffset) * 8;
    const driftY         = Math.cos(time * s.drift * 0.7 + s.twinkleOffset) * 6;
    positions[i * 2]     = s.x * w + driftX;
    positions[i * 2 + 1] = s.y * h + driftY;
    sizes[i]             = s.size + Math.max(0, Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.6);
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
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, _NEON.bgTop);
  bg.addColorStop(1, _NEON.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  _stars.forEach(function (s) {
    const twinkle    = Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.3;
    const brightness = Math.max(0.1, Math.min(1.0, s.brightness + twinkle));
    const driftX     = Math.sin(time * s.drift + s.twinkleOffset) * 4;
    const driftY     = Math.cos(time * s.drift * 0.7 + s.twinkleOffset) * 3;
    const x          = s.x * w + driftX;
    const y          = s.y * h + driftY;
    const glow       = ctx.createRadialGradient(x, y, 0, x, y, s.size * 4.5);
    glow.addColorStop(0, 'rgba(223, 251, 255, ' + Math.min(0.95, brightness) + ')');
    glow.addColorStop(0.45, 'rgba(56, 189, 248, ' + (brightness * 0.35) + ')');
    glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.globalAlpha  = 1;
    ctx.fillStyle    = glow;
    ctx.beginPath();
    ctx.arc(x, y, s.size * 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = brightness;
    ctx.fillStyle = s.hue > 0.5 ? _NEON.starAlt : _NEON.starCore;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, s.size * 0.7), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// 渲染星系地图（2D Canvas 覆盖层）
// ---------------------------------------------------------------------------

export function renderMap(gameState, time) {
  const motionTime = _getMotionTime(time);
  const ctx = _ctx;
  const w   = _mapCanvas.width  / _dpr;
  const h   = _mapCanvas.height / _dpr;
  _updateTravelPulse(gameState, motionTime);
  ctx.clearRect(0, 0, w, h);

  if (gameState.mapView === 'galaxies') {
    _renderGalaxyMap(ctx, w, h, gameState, motionTime);
  } else {
    _renderPlanetMap(ctx, w, h, gameState, motionTime);
  }
}

// --- 星系总览地图 ---
function _renderGalaxyMap(ctx, w, h, gameState, time) {
  // 星系连线
  for (let i = 0; i < GALAXIES.length; i++) {
    for (let j = i + 1; j < GALAXIES.length; j++) {
      _drawNeonConnection(
        ctx,
        GALAXIES[i].gx * w,
        GALAXIES[i].gy * h,
        GALAXIES[j].gx * w,
        GALAXIES[j].gy * h,
        {
          start: 'rgba(56, 189, 248, 0.04)',
          mid: 'rgba(56, 189, 248, 0.12)',
          end: 'rgba(56, 189, 248, 0.04)',
          glow: 'rgba(34, 211, 238, 0.03)',
          lineWidth: 1,
          glowWidth: 4,
        }
      );
    }
  }

  GALAXIES.forEach(function (gal) {
    const x = gal.gx * w;
    const y = gal.gy * h;
    const isCurrent = gal.id === gameState.currentGalaxy;
    const isViewing = gal.id === gameState.viewingGalaxy;
    const unlocked  = gal.unlocked || (gameState.researchedTechs && gameState.researchedTechs.includes(gal.techRequired));
    const radius    = isCurrent ? 32 : 24;
    const neonColor = unlocked ? gal.color : _NEON.lock;

    ctx.globalAlpha = unlocked ? 1 : 0.4;
    _drawNeonNode(ctx, x, y, radius, neonColor, {
      glowExtra: 34,
      glowColor: neonColor,
      strokeColor: isCurrent ? _NEON.current : (isViewing ? _NEON.hover : 'rgba(223, 251, 255, 0.34)'),
      strokeWidth: isCurrent ? 2.6 : 1.7,
      coreColor: unlocked ? _NEON.starCore : '#7b8da8',
    });

    if (isCurrent) {
      const pulse = Math.sin(time * 0.003) * 8 + radius + 12;
      _drawPulseRing(ctx, x, y, pulse, _NEON.current, 0.4);
      _drawPulseRing(ctx, x, y, pulse + 9, 'rgba(103, 232, 249, 0.45)', 0.2);
    }
    ctx.globalAlpha = 1;

    // 图标
    _setTextStyle(ctx, 20, true);
    ctx.textAlign = 'center';
    ctx.fillText(gal.icon, x, y + 7);

    // 名称
    ctx.fillStyle = isCurrent ? _NEON.current : (unlocked ? _NEON.text : _NEON.lock);
    _setTextStyle(ctx, 13, isCurrent);
    ctx.fillText(gal.name, x, y + radius + 18);

    // 星球数量
    const allCount = getSystemsByGalaxy(gal.id).length;
    const accessCount = getSystemsByGalaxy(gal.id).filter(function (s) {
      return (gameState.playerLevel || 1) >= (s.minLevel || 1);
    }).length;
    ctx.fillStyle = unlocked ? (gal.color + 'cc') : _NEON.lock;
    _setTextStyle(ctx, 10, false);
    ctx.fillText(accessCount + '/' + allCount + ' 星球' + (unlocked ? '' : ' 🔒'), x, y + radius + 30);
  });

  _drawTravelPulseOnGalaxies(ctx, w, h, time);
}

// --- 星球地图（指定星系） ---
function _renderPlanetMap(ctx, w, h, gameState, time) {
  const viewGal = gameState.viewingGalaxy || gameState.currentGalaxy || 'milky_way';
  const planets = getSystemsByGalaxy(viewGal);
  const galDef  = GALAXIES.find(function (g) { return g.id === viewGal; });
  const isRemote = viewGal !== gameState.currentGalaxy;

  // --- 星系名称标题 ---
  if (galDef) {
    ctx.fillStyle = galDef.color + 'aa';
    _setTextStyle(ctx, 12, true);
    ctx.textAlign = 'center';
    ctx.fillText(galDef.icon + ' ' + galDef.name + (isRemote ? ' (远程查看)' : ''), w / 2, 22);
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
          _drawNeonConnection(ctx, s1.x * w, s1.y * h, s2.x * w, s2.y * h, {
            start: 'rgba(56, 189, 248, 0.04)',
            mid: 'rgba(56, 189, 248, 0.15)',
            end: 'rgba(56, 189, 248, 0.04)',
            glow: 'rgba(34, 211, 238, 0.03)',
            lineWidth: 1,
            glowWidth: 4,
          });
        } else {
          _drawNeonConnection(ctx, s1.x * w, s1.y * h, s2.x * w, s2.y * h, {
            start: _NEON.routeDim,
            mid: _NEON.routeDim,
            end: _NEON.routeDim,
            glow: 'rgba(34, 211, 238, 0.015)',
            lineWidth: 1,
            glowWidth: 3,
          });
        }
      }
    }
  }

  // --- 悬浮高亮航线 ---
  if (gameState.hoveredSystem && gameState.hoveredSystem !== gameState.currentSystem) {
    const cur = findSystem(gameState.currentSystem);
    const hov = findSystem(gameState.hoveredSystem);
    if (cur && hov && cur.galaxyId === hov.galaxyId) {
      _drawNeonConnection(ctx, cur.x * w, cur.y * h, hov.x * w, hov.y * h, {
        start: 'rgba(103, 232, 249, 0.2)',
        mid: _NEON.routeHot,
        end: 'rgba(103, 232, 249, 0.2)',
        glow: 'rgba(34, 211, 238, 0.18)',
        lineWidth: 2,
        glowWidth: 6,
        dash: [6, 5],
        dashOffset: -(time * 0.01),
      });
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
    const neonColor = isLocked ? _NEON.lock : sys.color;

    // 已锁定星球半透明
    if (isLocked) ctx.globalAlpha = 0.3;
    _drawNeonNode(ctx, x, y, radius, neonColor, {
      glowExtra: isCurrent ? 16 : 10,
      glowColor: neonColor,
      strokeColor: isCurrent ? _NEON.current : (isHovered ? _NEON.hover : 'rgba(223, 251, 255, 0.25)'),
      strokeWidth: isCurrent ? 2.2 : (isHovered ? 1.4 : 0.8),
      coreColor: isLocked ? '#71859f' : _NEON.starCore,
    });

    // 脉冲环
    if (isCurrent) {
      const pulse = Math.sin(time * 0.003) * 5 + radius + 8;
      _drawPulseRing(ctx, x, y, pulse, _NEON.current, 0.42);
      _drawPulseRing(ctx, x, y, pulse + 6, 'rgba(103, 232, 249, 0.3)', 0.22);
    } else if (isHovered) {
      const hoverPulse = Math.sin(time * 0.006) * 2 + radius + 5;
      _drawPulseRing(ctx, x, y, hoverPulse, 'rgba(223, 251, 255, 0.8)', 0.35);
    }

    // 名称（生成星球只在悬停时显示）
    if (!isGenerated || isCurrent || isHovered) {
      ctx.fillStyle = isLocked ? _NEON.lock : (isCurrent ? _NEON.current : (isHovered ? _NEON.hover : _NEON.text));
      _setTextStyle(ctx, isGenerated ? 9 : 10, isCurrent || isHovered);
      ctx.textAlign = 'center';
      ctx.fillText(sys.name + (isLocked ? ' 🔒' : ''), x, y + radius + 12);

      const faction = FACTIONS.find(function (f) { return f.controlledSystems.includes(sys.id); });
      const typeText = '[' + sys.typeLabel + ']' + (faction ? ' ' + faction.icon : '') + (isLocked ? ' Lv.' + (sys.minLevel || 1) : '');
      ctx.fillStyle = isLocked ? '#586982' : (sys.color + 'cc');
      _setTextStyle(ctx, 8, false);
      ctx.fillText(typeText, x, y + radius + 22);
    }

    if (isLocked) ctx.globalAlpha = 1;
  });

  _drawTravelPulseOnPlanets(ctx, w, h, gameState, time);
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
