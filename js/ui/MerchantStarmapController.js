import * as Renderer from './StarmapRenderer.js';
import { buildMerchantStarmapProjection } from './MerchantStarmapProjection.js';
import { hasBlockingSurfaceOpen } from './SurfaceManager.js';
import { createMerchantExplorationPanel } from './MerchantExplorationPanel.js';
import { GAME_VERSION } from '../data/constants.js';

export function createMerchantStarmapController({ renderer = Renderer, doc = document, onReturn = () => {}, getState, execute, onPort, onFleet } = {}) {
  const map = doc.getElementById('map-section');
  const overview = doc.createElement('button');
  overview.type = 'button';
  overview.className = 'merchant-map-overview';
  overview.setAttribute('aria-label', '星图全景');
  overview.setAttribute('title', '星图全景');
  overview.setAttribute('data-workspace-initial-focus', '');
  overview.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/></svg>';
  const loader = doc.createElement('div');
  loader.className = 'startup-loader merchant-scene-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.setAttribute('aria-label', '星图正在加载');
  loader.hidden = true;
  loader.innerHTML = `<div class="startup-loader__stars" aria-hidden="true"></div><div class="startup-loader__scanline" aria-hidden="true"></div>
    <div class="startup-loader__panel"><div class="startup-loader__brand" aria-hidden="true"><span class="startup-loader__brand-orbit"></span><span class="startup-loader__brand-core"></span></div>
    <p class="startup-loader__eyebrow">INTERSTELLAR TRADE / VERSION ${GAME_VERSION}</p><h2 class="startup-loader__title">星图</h2>
    <p class="startup-loader__status" data-scene-loading-status>正在加载星系场景</p>
    <div class="startup-loader__progress" data-scene-loading-progress aria-hidden="true"><span class="startup-loader__progress-fill"></span></div>
    <div class="startup-loader__actions"><button type="button" class="startup-loader__retry" data-scene-retry data-button-state="ready" hidden>重试</button><button type="button" class="startup-loader__retry" data-scene-return>返回经营</button></div></div>`;
  const status = loader.querySelector('[data-scene-loading-status]');
  const progress = loader.querySelector('[data-scene-loading-progress]');
  const retry = loader.querySelector('[data-scene-retry]');
  const returnButton = loader.querySelector('[data-scene-return]');
  let sceneState = '';
  map.appendChild(overview);
  map.appendChild(loader);
  const exploration = createMerchantExplorationPanel({ doc, map, renderer, getState, execute, onPort, onFleet });
  let requestedSurface = null;
  let initialized = false;
  let lastPaintAt = -Infinity;
  let requestedTaskId = '';
  const click = () => renderer.resetCamera();
  overview.addEventListener('click', click);
  const returnToTasks = () => onReturn();
  const retryScene = () => {
    renderer.retry();
    lastPaintAt = -Infinity;
    present('loading');
  };
  retry.addEventListener('click', retryScene);
  returnButton.addEventListener('click', returnToTasks);

  function present(nextState) {
    const errorText = nextState === 'error' ? renderer.getLoadError() || '星图加载失败，请重试。' : '';
    if (sceneState === nextState && (nextState !== 'error' || status.textContent === errorText)) return;
    sceneState = nextState;
    map.dataset.sceneState = nextState;
    const waiting = nextState === 'loading' || nextState === 'idle';
    const failed = nextState === 'error';
    loader.hidden = !waiting && !failed;
    overview.hidden = nextState !== 'ready';
    map.setAttribute('aria-busy', String(waiting));
    loader.setAttribute('aria-busy', String(waiting));
    loader.setAttribute('aria-label', failed ? '星图加载失败' : '星图正在加载');
    loader.classList.toggle('has-error', failed);
    status.textContent = failed ? errorText : '正在加载星系场景';
    progress.hidden = failed;
    retry.hidden = !failed;
  }

  function focusTask(taskId) {
    requestedTaskId = taskId || '';
  }

  function renderFrame(state) {
    const visible = map.classList.contains('is-active') && !doc.hidden && !hasBlockingSurfaceOpen();
    if (!visible) {
      if (initialized && renderer.isActive()) renderer.toggleView();
      present('inactive');
      exploration.refresh(state, false);
      lastPaintAt = -Infinity;
      return;
    }
    const frameTime = doc.defaultView?.performance?.now() ?? performance.now();
    const frameInterval = 1000 / 30;
    if (initialized && renderer.isActive() && frameTime >= lastPaintAt && frameTime - lastPaintAt < frameInterval - 1) return;
    if (!initialized) {
      present('loading');
      initialized = renderer.init();
      if (!initialized) { present('error'); return; }
    }
    if (!renderer.isActive()) renderer.toggleView();
    // 按固定时间轴推进，吸收 RAF 的微小抖动，避免每次提交都把下一帧向后推迟。
    lastPaintAt = Number.isFinite(lastPaintAt) && frameTime >= lastPaintAt
      ? lastPaintAt + Math.max(1, Math.floor((frameTime - lastPaintAt + 1) / frameInterval)) * frameInterval
      : frameTime;
    const snapshot = buildMerchantStarmapProjection(state);
    if (!snapshot) return;
    renderer.render(snapshot, 'planets', snapshot.viewingGalaxy);
    const loadState = renderer.getLoadState();
    present(loadState);
    exploration.refresh(state, loadState === 'ready');
    if (requestedSurface && loadState === 'ready') {
      exploration.show();
      requestedSurface = null;
    }
    if (requestedTaskId && loadState === 'ready') {
      const ship = state.merchant.ships.find(item => item.taskId === requestedTaskId);
      const route = ship && snapshot.merchantStarmapRoutes.find(item => item.id === `merchant-${ship.id}`);
      if (route) renderer.focusRoute(route);
      requestedTaskId = '';
    }
  }

  function dispose() {
    overview.removeEventListener('click', click);
    retry.removeEventListener('click', retryScene);
    returnButton.removeEventListener('click', returnToTasks);
    overview.remove();
    loader.remove();
    exploration.dispose();
    map.removeAttribute('aria-busy');
    delete map.dataset.sceneState;
    renderer.dispose();
    initialized = false;
  }
  return { renderFrame, focusTask, dispose, showExploration: () => { requestedSurface = { type: 'exploration' }; } };
}
