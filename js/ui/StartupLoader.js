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
  elements.root.setAttribute('aria-label', '游戏正在加载');
  if (elements.retry) elements.retry.hidden = true;
  if (elements.recovery) elements.recovery.hidden = true;
  if (elements.confirm) elements.confirm.hidden = true;
  if (elements.shell) elements.shell.inert = true;
  elements.root.onkeydown = null;
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

  update(100, '商队已就绪', 'NAVIGATION READY');
  elements.root.setAttribute('aria-busy', 'false');

  return _afterNextPaint().then(function () {
    elements.root.classList.add('is-complete');
    return new Promise(function (resolve) {
      _hideTimer = setTimeout(function () {
        elements.root.hidden = true;
        if (elements.shell) elements.shell.inert = false;
        if (document.body && document.body.classList) document.body.classList.remove('startup-loading');
        _hideTimer = null;
        resolve(true);
      }, HIDE_TRANSITION_MS);
    });
  });
}

export function fail(error, actions) {
  const elements = _getElements();
  if (!elements.root) return false;

  elements.root.classList.remove('is-complete');
  elements.root.classList.add('has-error');
  elements.root.setAttribute('aria-busy', 'false');
  if (elements.status) elements.status.textContent = '游戏加载失败，请重试';
  if (elements.stage) elements.stage.textContent = 'STARTUP INTERRUPTED';
  if (elements.progress) elements.progress.setAttribute('aria-valuetext', '场景加载失败');
  if (elements.retry) elements.retry.hidden = false;
  const recoveryRequired = !!error && error.code === 'STARTUP_SAVE_RECOVERY_REQUIRED';
  elements.root.setAttribute('aria-label', recoveryRequired ? '存档恢复' : '游戏启动失败');
  const handlers = actions || {};
  if (elements.retry) {
    elements.retry.textContent = recoveryRequired ? '重试恢复存档' : '重新连接';
    elements.retry.onclick = handlers.onRetry || _reload;
    elements.retry.focus();
  }
  if (elements.recovery) elements.recovery.hidden = !recoveryRequired;
  if (recoveryRequired) {
    const message = error.saveErrorCode === 'SAVE_SCHEMA_UNSUPPORTED'
      ? '自动存档来自更新版本，请使用对应版本恢复，或先导出备份。'
      : error.saveErrorCode === 'SAVE_STORAGE_READ_FAILED'
        ? '无法读取自动存档，请检查浏览器的存储权限后重试。'
        : '自动存档无法恢复，请重试或导出原始文件以便修复。';
    if (elements.status) elements.status.textContent = message;
    if (elements.stage) elements.stage.textContent = 'SAVE RECOVERY';
    if (elements.progress) elements.progress.setAttribute('aria-valuetext', message);
    if (elements.recoveryStatus) {
      elements.recoveryStatus.textContent = '游戏尚未开始，本次操作未修改已有存档。';
    }
    _bindRecovery(elements, handlers);
  }
  elements.root.onkeydown = function (event) {
    if (event.key === 'Escape' && elements.confirm && !elements.confirm.hidden) {
      event.preventDefault();
      _toggleConfirmation(elements, false);
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(elements.root.querySelectorAll('button:not(:disabled)'))
      .filter(function (button) { return !button.closest('[hidden]'); });
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
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
    recovery: document.getElementById('startup-loader-recovery'),
    recoveryStatus: document.getElementById('startup-loader-recovery-status'),
    exportButton: document.getElementById('startup-loader-export'),
    restart: document.getElementById('startup-loader-restart'),
    confirm: document.getElementById('startup-loader-confirm'),
    confirmRestart: document.getElementById('startup-loader-confirm-restart'),
    cancel: document.getElementById('startup-loader-cancel'),
    shell: document.getElementById('game-shell'),
  };
}

function _bindRetry(retryButton) {
  if (retryButton) retryButton.onclick = _reload;
}

function _reload() {
  if (typeof window !== 'undefined' && window.location && window.location.reload) {
    window.location.reload();
  }
}

function _toggleConfirmation(elements, visible) {
  if (elements.confirm) elements.confirm.hidden = !visible;
  if (elements.restart) elements.restart.hidden = visible;
  if (elements.exportButton) elements.exportButton.hidden = visible;
  const target = visible ? elements.cancel : elements.restart;
  if (target) target.focus();
}

function _bindRecovery(elements, handlers) {
  if (elements.confirm) elements.confirm.hidden = true;
  function run(action, successMessage) {
    try {
      if (typeof action !== 'function') throw new Error('当前操作不可用，请重试。');
      action();
      if (successMessage && elements.recoveryStatus) elements.recoveryStatus.textContent = successMessage;
    } catch (error) {
      if (elements.recoveryStatus) elements.recoveryStatus.textContent = error.message || '操作失败，请重试。';
    }
  }
  if (elements.exportButton) {
    elements.exportButton.hidden = false;
    elements.exportButton.onclick = function () { run(handlers.onExport, '已生成原始存档备份，请妥善保存下载文件。'); };
  }
  if (elements.restart) {
    elements.restart.hidden = false;
    elements.restart.onclick = function () { _toggleConfirmation(elements, true); };
  }
  if (elements.cancel) elements.cancel.onclick = function () { _toggleConfirmation(elements, false); };
  if (elements.confirmRestart) elements.confirmRestart.onclick = function () { run(handlers.onRestart); };
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
