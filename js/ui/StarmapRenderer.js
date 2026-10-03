// 星图只使用 Three；加载与失败由通用加载层呈现，不再绘制兼容场景。
let initialized = false;
let active = false;
let three = null;
let loading = null;
let generation = 0;
let quality = 'auto';
let motion = 'full';
let loadState = 'idle';
let loadError = '';
let pendingFocus = null;
let loadTiming = null;
let rendererModulePromise = null;
let rendererModuleReady = false;
let scheduledPreload = null;

function getRendererModule() {
  if (!rendererModulePromise) {
    const request = import('./RendererThreeStarmap.js');
    rendererModulePromise = request;
    request.then(() => { rendererModuleReady = true; }, () => {
      if (rendererModulePromise === request) rendererModulePromise = null;
    });
  }
  return rendererModulePromise;
}

// 只提前下载与解析模块；不创建 GPU 场景，也不触碰星图状态或经营存档。
export function preload() {
  return getRendererModule().then(() => true, () => false);
}

export function schedulePreload() {
  if (scheduledPreload || rendererModuleReady || globalThis.navigator?.connection?.saveData) return;
  const prepare = () => { scheduledPreload = null; void preload(); };
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(prepare, { timeout: 1500 });
    scheduledPreload = () => globalThis.cancelIdleCallback(id);
  } else {
    const id = setTimeout(prepare, 200);
    scheduledPreload = () => clearTimeout(id);
  }
}

function cancelScheduledPreload() {
  scheduledPreload?.();
  scheduledPreload = null;
}

function getCanvas() {
  return globalThis.document?.getElementById('starmap-three-canvas');
}

function hideCanvas() {
  three?.setVisible(false);
  const canvas = getCanvas();
  if (canvas) {
    canvas.style.display = 'none';
    canvas.style.visibility = 'hidden';
  }
}

function fail(message) {
  loadState = 'error';
  loadError = message;
  hideCanvas();
}

function releaseThree() {
  const renderer = three;
  three = null;
  if (!renderer) return;
  renderer.setAvailabilityHandler(null);
  try { renderer.dispose(); }
  catch { /* 初始化中断后仍须解除引用，避免失败实例阻止重试。 */ }
}

function loadThree() {
  const current = generation;
  cancelScheduledPreload();
  loadTiming = { startedAt: performance.now(), modulePrepared: rendererModuleReady };
  loadState = 'loading';
  loadError = '';
  hideCanvas();
  loading = getRendererModule().then(module => {
    if (current !== generation || !initialized) return;
    three = module;
    loadTiming.moduleMs = performance.now() - loadTiming.startedAt;
    try {
      const initStartedAt = performance.now();
      three.setQuality(quality);
      three.setMotionLevel(motion);
      three.setAvailabilityHandler(available => {
        if (current !== generation || module !== three || !initialized) return;
        if (!available) {
          fail('星图图形连接已中断，请重试。');
          return;
        }
        // 恢复连接后仍需绘制新首帧，不由迟到回调重新显示已经切走的页面。
        loadState = 'loading';
        loadError = '';
        hideCanvas();
      });
      if (!three.init()) {
        fail('当前设备无法初始化 3D 星图，请重试或检查硬件加速。');
        releaseThree();
        return;
      }
      loadTiming.initMs = performance.now() - initStartedAt;
      if (getCanvas()?.getContext?.('webgl2')?.isContextLost?.()) {
        fail('星图图形连接尚未恢复，请重试。');
        return;
      }
      hideCanvas();
    } catch {
      fail('3D 星图初始化失败，请重试。');
      releaseThree();
    }
  }).catch(() => {
    if (current === generation && initialized) fail('星图资源加载失败，请重试。');
  }).finally(() => {
    if (current === generation) loading = null;
  });
}

export function init() {
  if (initialized) return true;
  if (!getCanvas()) {
    fail('星图画布暂时不可用，请刷新重试。');
    return false;
  }
  initialized = true;
  active = true;
  loadState = 'idle';
  loadError = '';
  hideCanvas();
  return true;
}

export function isActive() {
  return initialized && active;
}

export function toggleView() {
  active = !active;
  hideCanvas();
}

export function setQuality(value) {
  quality = value;
  three?.setQuality(value);
}

export function setMotionLevel(value) {
  motion = value;
  three?.setMotionLevel(value);
}

export function render(state, view, galaxyId) {
  if (!isActive()) return;
  if (loadState === 'idle' && !loading) loadThree();
  if (!three || loadState === 'error') return;
  if (!three.isAvailable()) {
    fail('星图图形连接已中断，请重试。');
    return;
  }
  const current = generation;
  const canvas = getCanvas();
  // 保留布局尺寸供渲染器测量；真实首帧完成前由加载层覆盖并保持不可见。
  if (canvas) canvas.style.visibility = loadState === 'ready' ? 'visible' : 'hidden';
  try {
    const firstFrameStartedAt = loadState !== 'ready' && loadTiming?.totalMs === undefined ? performance.now() : null;
    three.setVisible(true);
    three.render(state, view, galaxyId);
    if (pendingFocus) {
      three.focusRoute(pendingFocus);
      pendingFocus = null;
      three.render(state, view, galaxyId);
    }
    if (current !== generation || !isActive()) return;
    if (!three?.isAvailable()) {
      fail('星图图形连接已中断，请重试。');
      return;
    }
    loadState = 'ready';
    loadError = '';
    if (firstFrameStartedAt !== null && loadTiming) {
      loadTiming.firstFrameMs = performance.now() - firstFrameStartedAt;
      loadTiming.totalMs = performance.now() - loadTiming.startedAt;
    }
    if (canvas) {
      canvas.style.visibility = 'visible';
      const info = three.getRendererInfo();
      if (info) {
        canvas.dataset.renderer = info.renderer;
        canvas.dataset.panOnly = String(info.panOnly);
        canvas.dataset.pixelRatio = String(info.pixelRatio);
        if (firstFrameStartedAt !== null && loadTiming) canvas.dataset.loadTiming = JSON.stringify({ ...loadTiming, scene: info.loadTiming });
        if (info.cameraHeight) {
          canvas.dataset.cameraHeight = String(info.cameraHeight);
          canvas.dataset.cameraOffset = JSON.stringify(info.cameraOffset);
        }
      }
    }
  } catch {
    if (current === generation && initialized) fail('星图场景绘制失败，请重试。');
  }
}

export function resetCamera() {
  pendingFocus = null;
  if (loadState === 'ready' && three?.isAvailable()) three.resetCamera();
}

export function focusRoute(route) {
  pendingFocus = route;
  if (loadState === 'ready' && three?.isAvailable()) {
    three.focusRoute(route);
    pendingFocus = null;
  }
}

export function getRendererInfo() {
  return loadState === 'ready' && three?.isAvailable() ? three.getRendererInfo() : null;
}

export function getExplorationScreenPosition(portId) {
  return loadState === 'ready' && three?.isAvailable() ? three.getExplorationScreenPosition(portId) : null;
}

export function getLoadState() {
  return loadState;
}

export function getLoadError() {
  return loadError;
}

export function retry() {
  generation += 1;
  hideCanvas();
  releaseThree();
  loading = null;
  loadState = 'idle';
  loadError = '';
  return initialized;
}

export function dispose() {
  cancelScheduledPreload();
  generation += 1;
  active = false;
  initialized = false;
  hideCanvas();
  releaseThree();
  loading = null;
  pendingFocus = null;
  loadState = 'idle';
  loadError = '';
  loadTiming = null;
}
