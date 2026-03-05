// js/ui/PhaserRenderer.js — 基于 Phaser 3 的星系地图渲染器
// 替换 Renderer.js（WebGL 星空 + 2D Canvas 星系地图）
// 依赖：Phaser 3（window.Phaser，通过 CDN 全局加载）、data/systems.js、data/factions.js
// 导出：init, renderStars, renderMap, setGameState, getSystemAtPoint, getGalaxyAtPoint
//        setInputHandlers

import {
  SYSTEMS, GALAXIES, getSystemsByGalaxy, findSystem,
} from '../data/systems.js';
import { FACTIONS } from '../data/factions.js';

// ---------------------------------------------------------------------------
// 模块级变量
// ---------------------------------------------------------------------------

/** @type {import('phaser').Game|null} */
let _game      = null;
/** @type {MapScene|null} */
let _scene     = null;
/** @type {object|null} 当前游戏状态引用 */
let _stateRef  = null;

// 输入回调（由 MapUI 注入）
let _onTravel       = null;  // (systemId: string) => void
let _onGalaxyJump   = null;  // (systemId: string) => void
let _onHoverChange  = null;  // (stateRef: object) => void

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 初始化 Phaser 游戏，在 #map-container 内创建 WebGL 渲染场景
 * 替代原 Renderer.init()
 */
export function init() {
  if (_game) { _game.destroy(true); _game = null; _scene = null; }

  const container = document.getElementById('map-container');
  const w = container.clientWidth  || 800;
  const h = container.clientHeight || 600;

  _game = new window.Phaser.Game({
    type:            window.Phaser.AUTO,
    parent:          'map-container',
    width:           w,
    height:          h,
    backgroundColor: '#090918',
    scene:           MapScene,
    scale: {
      mode:       window.Phaser.Scale.RESIZE,
      autoCenter: window.Phaser.Scale.NO_CENTER,
    },
  });
}

/**
 * 注入输入事件回调（由 MapUI.init 调用，替代原 canvas addEventListener）
 * @param {object}   stateRef
 * @param {Function} onTravel       (systemId: string) => void
 * @param {Function} onGalaxyJump   (systemId: string) => void
 * @param {Function} onHoverChange  (stateRef: object) => void
 */
export function setInputHandlers(stateRef, onTravel, onGalaxyJump, onHoverChange) {
  _stateRef      = stateRef;
  _onTravel      = onTravel;
  _onGalaxyJump  = onGalaxyJump;
  _onHoverChange = onHoverChange;
  if (_scene) _scene.updateStateRef(stateRef);
}

/**
 * 更新渲染器持有的游戏状态（在每次 UI 刷新时调用）
 * @param {object} state
 */
export function setGameState(state) {
  _stateRef = state;
  if (_scene) _scene.updateStateRef(state);
}

/**
 * 兼容原 Renderer.renderStars(time) 接口。
 * Phaser 已内部管理动画循环，此函数为空操作。
 */
export function renderStars(_time) {
  // Phaser 的 update() 循环已处理星空动画
}

/**
 * 兼容原 Renderer.renderMap(state, time) 接口。
 * @param {object} state
 */
export function renderMap(state, _time) {
  setGameState(state);
}

/**
 * 命中检测：返回鼠标点所在的星球（CSS 像素坐标）
 * @param {number} px  CSS 像素 x
 * @param {number} py  CSS 像素 y
 * @param {number} canvasW  容器 CSS 宽度
 * @param {number} canvasH  容器 CSS 高度
 * @param {string} [galaxyId]
 * @returns {object|null}
 */
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

/**
 * 命中检测：返回鼠标点所在的星系（CSS 像素坐标）
 */
export function getGalaxyAtPoint(px, py, canvasW, canvasH) {
  for (const gal of GALAXIES) {
    const gx   = gal.gx * canvasW;
    const gy   = gal.gy * canvasH;
    const dist = Math.sqrt((px - gx) ** 2 + (py - gy) ** 2);
    if (dist <= 40) return gal;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 辅助：将 CSS 颜色字符串转换为 Phaser 使用的整数颜色
// ---------------------------------------------------------------------------

function _hexToInt(hex) {
  return parseInt(hex.replace(/^#/, ''), 16);
}

// ---------------------------------------------------------------------------
// Phaser 场景类
// ---------------------------------------------------------------------------

class MapScene extends window.Phaser.Scene {
  constructor() {
    super({ key: 'MapScene' });
    this._stars    = [];       // 星星数据数组
    this._bgGfx    = null;    // 背景图形层
    this._mapGfx   = null;    // 地图图形层
    // 文字对象池
    this._textPool     = [];
    this._textPoolIdx  = 0;
  }

  create() {
    // 图形层（深度 0 = 背景，1 = 地图，文字深度 2）
    this._bgGfx  = this.add.graphics().setDepth(0);
    this._mapGfx = this.add.graphics().setDepth(1);

    _generateStars(300, this._stars);

    // 鼠标事件
    this.input.on('pointermove',  this._onMove,  this);
    this.input.on('pointerdown',  this._onClick, this);
    this.input.on('pointerout',   this._onOut,   this);

    // 缩放事件
    this.scale.on('resize', (gameSize) => {
      _generateStars(300, this._stars);
      const w = gameSize.width;
      const h = gameSize.height;
      if (_game) _game.canvas.style.width  = '100%';
      if (_game) _game.canvas.style.height = '100%';
    });

    _scene = this;
    if (_stateRef) this.updateStateRef(_stateRef);
  }

  preload() {}

  update(time) {
    const w = this.scale.width;
    const h = this.scale.height;

    this._renderBackground(this._bgGfx, w, h, time);

    this._reclaimTextPool();
    if (_stateRef) {
      if (_stateRef.mapView === 'galaxies') {
        this._drawGalaxyMap(this._mapGfx, w, h, _stateRef, time);
      } else {
        this._drawPlanetMap(this._mapGfx, w, h, _stateRef, time);
      }
    } else {
      this._mapGfx.clear();
    }
    this._hideUnusedTexts();
  }

  updateStateRef(state) {
    _stateRef = state;
  }

  // -------------------------------------------------------------------------
  // 文字对象池
  // -------------------------------------------------------------------------

  _reclaimTextPool() {
    this._textPoolIdx = 0;
  }

  /** 从池中取出（或新建）一个 Text 对象 */
  _poolText(x, y, str, style) {
    let txt;
    if (this._textPoolIdx < this._textPool.length) {
      txt = this._textPool[this._textPoolIdx];
      txt.setPosition(x, y);
      txt.setText(str);
      txt.setStyle(style);
      txt.setVisible(true);
      txt.setAlpha(1);
    } else {
      txt = this.add.text(x, y, str, style)
        .setDepth(2)
        .setOrigin(0.5, 0);
      this._textPool.push(txt);
    }
    this._textPoolIdx++;
    return txt;
  }

  _hideUnusedTexts() {
    for (let i = this._textPoolIdx; i < this._textPool.length; i++) {
      this._textPool[i].setVisible(false);
    }
  }

  // -------------------------------------------------------------------------
  // 星空背景
  // -------------------------------------------------------------------------

  _renderBackground(g, w, h, time) {
    g.clear();
    g.fillStyle(0x090918, 1.0);
    g.fillRect(0, 0, w, h);

    for (const s of this._stars) {
      const twinkle    = Math.sin(time * s.twinkleSpeed + s.twinkleOffset) * 0.3;
      const brightness = Math.max(0.1, Math.min(1.0, s.brightness + twinkle));
      g.fillStyle(0xc0d0ff, brightness);
      g.fillCircle(s.x * w, s.y * h, s.size * 0.4);
    }
  }

  // -------------------------------------------------------------------------
  // 星系总览地图
  // -------------------------------------------------------------------------

  _drawGalaxyMap(g, w, h, gs, time) {
    g.clear();

    // 连线
    g.lineStyle(1, 0x6496ff, 0.15);
    for (let i = 0; i < GALAXIES.length; i++) {
      for (let j = i + 1; j < GALAXIES.length; j++) {
        const ga = GALAXIES[i], gb = GALAXIES[j];
        g.beginPath();
        g.moveTo(ga.gx * w, ga.gy * h);
        g.lineTo(gb.gx * w, gb.gy * h);
        g.strokePath();
      }
    }

    GALAXIES.forEach((gal) => {
      const x        = gal.gx * w;
      const y        = gal.gy * h;
      const isCur    = gal.id === gs.currentGalaxy;
      const isView   = gal.id === gs.viewingGalaxy;
      const unlocked = gal.unlocked ||
        (gs.researchedTechs && gs.researchedTechs.includes(gal.techRequired));
      const radius   = isCur ? 32 : 24;
      const colorInt = _hexToInt(gal.color);

      // 光晕（同心圆模拟径向渐变）
      for (let layer = 4; layer >= 1; layer--) {
        g.fillStyle(colorInt, (unlocked ? 0.06 : 0.02) * layer);
        g.fillCircle(x, y, radius + 10 * layer);
      }

      // 星系本体
      g.fillStyle(colorInt, unlocked ? 1.0 : 0.4);
      g.fillCircle(x, y, radius);

      // 边框
      const borderColor = isCur ? 0xFFD700 : (isView ? 0xffffff : 0x555577);
      const borderW     = isCur ? 3 : 2;
      g.lineStyle(borderW, borderColor, 0.85);
      g.strokeCircle(x, y, radius);

      // 脉冲环
      if (isCur) {
        const pulse = Math.sin(time * 0.003) * 8 + radius + 12;
        g.lineStyle(1.5, 0xFFD700, 0.4);
        g.strokeCircle(x, y, pulse);
      }

      // 图标
      const iconTxt = this._poolText(x, y - 7, gal.icon, {
        fontFamily: 'sans-serif',
        fontSize:   '20px',
      });
      iconTxt.setOrigin(0.5, 0.5);
      iconTxt.setAlpha(unlocked ? 1 : 0.4);

      // 名称
      const nameTxt = this._poolText(x, y + radius + 4, gal.name, {
        fontFamily: '"Segoe UI", sans-serif',
        fontSize:   isCur ? '13px' : '12px',
        fontStyle:  isCur ? 'bold' : 'normal',
        color:      isCur ? '#FFD700' : (unlocked ? '#e0e0ff' : '#606080'),
      });
      nameTxt.setOrigin(0.5, 0);
      nameTxt.setAlpha(1);

      // 星球计数
      const allCnt    = getSystemsByGalaxy(gal.id).length;
      const accCnt    = getSystemsByGalaxy(gal.id).filter(
        (s) => (gs.playerLevel || 1) >= (s.minLevel || 1),
      ).length;
      const subLabel  = accCnt + '/' + allCnt + ' 星球' + (unlocked ? '' : ' 🔒');
      const subTxt    = this._poolText(x, y + radius + 18, subLabel, {
        fontFamily: '"Segoe UI", sans-serif',
        fontSize:   '10px',
        color:      gal.color,
      });
      subTxt.setOrigin(0.5, 0);
    });
  }

  // -------------------------------------------------------------------------
  // 星球地图（指定星系）
  // -------------------------------------------------------------------------

  _drawPlanetMap(g, w, h, gs, time) {
    g.clear();
    const viewGal     = gs.viewingGalaxy || gs.currentGalaxy || 'milky_way';
    const planets     = getSystemsByGalaxy(viewGal);
    const galDef      = GALAXIES.find((gx) => gx.id === viewGal);
    const playerLevel = gs.playerLevel || 1;
    const isRemote    = viewGal !== gs.currentGalaxy;

    // 星系名称标签
    if (galDef) {
      const headerTxt = this._poolText(
        8, 8,
        galDef.icon + ' ' + galDef.name + (isRemote ? ' (远程查看)' : ''),
        { fontFamily: '"Segoe UI", sans-serif', fontSize: '12px', color: galDef.color + '88' },
      );
      headerTxt.setOrigin(0, 0);
    }

    // 派系领地底色
    FACTIONS.forEach((faction) => {
      if (!faction.controlledSystems || faction.controlledSystems.length === 0) return;
      const fColorInt = _hexToInt(faction.color);
      faction.controlledSystems.forEach((sysId) => {
        const s = planets.find((ss) => ss.id === sysId);
        if (!s) return;
        for (let layer = 3; layer >= 1; layer--) {
          g.fillStyle(fColorInt, 0.04 * layer);
          g.fillCircle(s.x * w, s.y * h, 15 * layer);
        }
      });
    });

    // 航线（近距连线）
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const s1 = planets[i], s2 = planets[j];
        const dist = Math.sqrt((s1.x - s2.x) ** 2 + (s1.y - s2.y) ** 2);
        if (dist < 0.28) {
          const s1ok = playerLevel >= (s1.minLevel || 1);
          const s2ok = playerLevel >= (s2.minLevel || 1);
          g.lineStyle(1, 0x6496ff, s1ok && s2ok ? 0.10 : 0.03);
          g.beginPath();
          g.moveTo(s1.x * w, s1.y * h);
          g.lineTo(s2.x * w, s2.y * h);
          g.strokePath();
        }
      }
    }

    // 悬浮高亮航线
    if (gs.hoveredSystem && gs.hoveredSystem !== gs.currentSystem) {
      const cur = findSystem(gs.currentSystem);
      const hov = findSystem(gs.hoveredSystem);
      if (cur && hov && cur.galaxyId === hov.galaxyId) {
        g.lineStyle(2, 0xFFC832, 0.7);
        // 虚线近似（交替绘制短段）
        const dx   = (hov.x - cur.x) * w;
        const dy   = (hov.y - cur.y) * h;
        const len  = Math.sqrt(dx * dx + dy * dy);
        const nx   = dx / len, ny = dy / len;
        const dash = 6, gap = 5;
        let pos    = 0;
        let drawing = true;
        while (pos < len) {
          const segLen = Math.min(drawing ? dash : gap, len - pos);
          if (drawing) {
            g.beginPath();
            g.moveTo(cur.x * w + nx * pos,       cur.y * h + ny * pos);
            g.lineTo(cur.x * w + nx * (pos + segLen), cur.y * h + ny * (pos + segLen));
            g.strokePath();
          }
          pos += segLen;
          drawing = !drawing;
        }
      }
    }

    // 星球节点
    planets.forEach((sys) => {
      const x         = sys.x * w;
      const y         = sys.y * h;
      const isCur     = sys.id === gs.currentSystem;
      const isHov     = sys.id === gs.hoveredSystem;
      const isGen     = sys.generated;
      const isLocked  = !isCur && playerLevel < (sys.minLevel || 1);
      const radius    = isCur ? 10 : (isHov ? 8 : (isGen ? 5 : 7));
      const alpha     = isLocked ? 0.3 : 1.0;
      const colorInt  = _hexToInt(sys.color);

      // 光晕
      for (let layer = 3; layer >= 1; layer--) {
        g.fillStyle(colorInt, alpha * 0.12 * layer);
        g.fillCircle(x, y, radius + 3 * layer);
      }

      // 星球本体
      g.fillStyle(colorInt, alpha);
      g.fillCircle(x, y, radius);

      // 边框
      const borderColor = isCur ? 0xFFD700 : (isHov ? 0xffffff : 0x808080);
      const borderW     = isCur ? 2.5 : (isHov ? 1.5 : 0.5);
      g.lineStyle(borderW, borderColor, alpha * 0.85);
      g.strokeCircle(x, y, radius);

      // 脉冲环
      if (isCur) {
        const pulse = Math.sin(time * 0.003) * 5 + radius + 8;
        g.lineStyle(1.5, 0xFFD700, 0.4);
        g.strokeCircle(x, y, pulse);
      }

      // 标签（生成星球仅在悬停/当前时显示）
      if (!isGen || isCur || isHov) {
        const labelColor = isLocked
          ? '#606080'
          : (isCur ? '#FFD700' : (isHov ? '#ffffff' : '#c0c0e0'));

        const nameTxt = this._poolText(
          x, y + radius + 4,
          sys.name + (isLocked ? ' 🔒' : ''),
          {
            fontFamily: '"Segoe UI", sans-serif',
            fontSize:   isGen ? '9px' : '10px',
            fontStyle:  isCur ? 'bold' : 'normal',
            color:      labelColor,
          },
        );
        nameTxt.setOrigin(0.5, 0);
        nameTxt.setAlpha(alpha);

        const faction  = FACTIONS.find((f) => f.controlledSystems.includes(sys.id));
        const typeStr  = '[' + sys.typeLabel + ']'
          + (faction ? ' ' + faction.icon : '')
          + (isLocked ? ' Lv.' + (sys.minLevel || 1) : '');
        const typeTxt  = this._poolText(
          x, y + radius + 16,
          typeStr,
          {
            fontFamily: '"Segoe UI", sans-serif',
            fontSize:   '8px',
            color:      isLocked ? '#505060' : sys.color,
          },
        );
        typeTxt.setOrigin(0.5, 0);
        typeTxt.setAlpha(alpha);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 输入处理
  // -------------------------------------------------------------------------

  _onMove(ptr) {
    if (!_stateRef) return;
    const w = this.scale.width;
    const h = this.scale.height;

    if (_stateRef.mapView === 'galaxies') {
      _stateRef.hoveredSystem = null;
    } else {
      const sys  = getSystemAtPoint(ptr.x, ptr.y, w, h,
        _stateRef.viewingGalaxy || _stateRef.currentGalaxy);
      const newId = sys ? sys.id : null;
      if (newId !== _stateRef.hoveredSystem) {
        _stateRef.hoveredSystem = newId;
        if (_onHoverChange) _onHoverChange(_stateRef);
      }
    }
  }

  _onOut() {
    if (!_stateRef) return;
    if (_stateRef.hoveredSystem !== null) {
      _stateRef.hoveredSystem = null;
      if (_onHoverChange) _onHoverChange(_stateRef);
    }
  }

  _onClick(ptr) {
    if (!_stateRef) return;
    const w = this.scale.width;
    const h = this.scale.height;

    if (_stateRef.mapView === 'galaxies') {
      const gal = getGalaxyAtPoint(ptr.x, ptr.y, w, h);
      if (gal) {
        const unlocked = gal.unlocked ||
          (_stateRef.researchedTechs &&
            _stateRef.researchedTechs.includes(gal.techRequired));
        if (unlocked) {
          _stateRef.viewingGalaxy = gal.id;
          _stateRef.mapView = 'planets';
          if (_onHoverChange) _onHoverChange(_stateRef);
        }
      }
    } else {
      const sys = getSystemAtPoint(ptr.x, ptr.y, w, h,
        _stateRef.viewingGalaxy || _stateRef.currentGalaxy);
      if (sys && sys.id !== _stateRef.currentSystem) {
        const playerLevel = _stateRef.playerLevel || 1;
        if (playerLevel < (sys.minLevel || 1)) return;
        if (sys.galaxyId !== _stateRef.currentGalaxy) {
          if (_onGalaxyJump) _onGalaxyJump(sys.id);
        } else {
          if (_onTravel) _onTravel(sys.id);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 生成星星数据（不依赖场景，供复用）
// ---------------------------------------------------------------------------

function _generateStars(count, arr) {
  arr.length = 0;
  for (let i = 0; i < count; i++) {
    arr.push({
      x:             Math.random(),
      y:             Math.random(),
      size:          Math.random() * 2.5 + 0.5,
      brightness:    Math.random() * 0.7 + 0.3,
      twinkleSpeed:  Math.random() * 0.02 + 0.005,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }
}
