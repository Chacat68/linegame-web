// js/ui/StartupLoader.js — 首屏加载层控制器

const HIDE_TRANSITION_MS = 460;

let _hideTimer = null;

export function start() {
  const elements = _getElements();
  if (!elements.root) return false;

  if (_hideTimer != null) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
  elements.root.hidden = false;
  elements.root.classList.remove('is-complete', 'has-error');
  elements.root.setAttribute('aria-busy', 'true');
  if (elements.retry) elements.retry.hidden = true;
  if (document.body && document.body.classList) document.body.classList.add('startup-loading');
  _bindRetry(elements.retry);
  update(16, '正在初始化舰桥系统', 'CORE SYSTEMS');
  return true;
}

export function update(progress, message, stage) {
  const elements = _getElements();
  if (!elements.root) return false;

  const normalizedProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  if (elements.fill) elements.fill.style.width = normalizedProgress + '%';
  if (elements.progress) {
    elements.progress.setAttribute('aria-valuenow', String(normalizedProgress));
    if (message) elements.progress.setAttribute('aria-valuetext', message);
  }
  if (elements.status && message) elements.status.textContent = message;
  if (elements.stage && stage) elements.stage.textContent = stage;
  if (elements.percent) elements.percent.textContent = String(normalizedProgress).padStart(2, '0') + '%';
  return true;
}

export function complete() {
  const elements = _getElements();
  if (!elements.root) return Promise.resolve(false);

  update(100, '星图已就绪', 'NAVIGATION READY');
  elements.root.setAttribute('aria-busy', 'false');

  return _afterNextPaint().then(function () {
    elements.root.classList.add('is-complete');
    return new Promise(function (resolve) {
      _hideTimer = setTimeout(function () {
        elements.root.hidden = true;
        if (document.body && document.body.classList) document.body.classList.remove('startup-loading');
        _hideTimer = null;
        resolve(true);
      }, HIDE_TRANSITION_MS);
    });
  });
}

export function fail(error) {
  const elements = _getElements();
  if (!elements.root) return false;

  elements.root.classList.remove('is-complete');
  elements.root.classList.add('has-error');
  elements.root.setAttribute('aria-busy', 'false');
  if (elements.status) elements.status.textContent = '场景加载失败，请重新连接';
  if (elements.stage) elements.stage.textContent = 'STARTUP INTERRUPTED';
  if (elements.progress) elements.progress.setAttribute('aria-valuetext', '场景加载失败');
  if (elements.retry) elements.retry.hidden = false;
  if (error) console.error('[StartupLoader] Game startup failed.', error);
  return true;
}

function _getElements() {
  if (typeof document === 'undefined' || !document.getElementById) return {};
  return {
    root: document.getElementById('startup-loader'),
    status: document.getElementById('startup-loader-status'),
    progress: document.getElementById('startup-loader-progress'),
    fill: document.getElementById('startup-loader-progress-fill'),
    stage: document.getElementById('startup-loader-stage'),
    percent: document.getElementById('startup-loader-percent'),
    retry: document.getElementById('startup-loader-retry'),
  };
}

function _bindRetry(retryButton) {
  if (!retryButton || retryButton.dataset.startupRetryBound === 'true') return;
  retryButton.dataset.startupRetryBound = 'true';
  retryButton.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.location && window.location.reload) {
      window.location.reload();
    }
  });
}

function _afterNextPaint() {
  return new Promise(function (resolve) {
    const requestFrame = typeof window !== 'undefined' && window.requestAnimationFrame
      ? window.requestAnimationFrame.bind(window)
      : function (callback) { return setTimeout(callback, 0); };
    requestFrame(function () {
      requestFrame(resolve);
    });
  });
}
