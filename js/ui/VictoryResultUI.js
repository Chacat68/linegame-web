// js/ui/VictoryResultUI.js - 胜利结算报告与流程出口

import { hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js?v=20260621-settingsfallback1';

let _onContinue = null;
let _onRestart = null;
let _activePathId = null;
let _initialized = false;

export function init(options) {
  var opts = options || {};
  _onContinue = typeof opts.onContinue === 'function' ? opts.onContinue : null;
  _onRestart = typeof opts.onRestart === 'function' ? opts.onRestart : null;
  if (_initialized) return;

  var continueBtn = document.getElementById('continue-playing-btn');
  var restartBtn = document.getElementById('restart-btn');

  if (continueBtn) {
    continueBtn.addEventListener('click', function () {
      var pathId = _activePathId;
      _resetRestartConfirmation();
      hideBlockingSurface('gameover-modal');
      _activePathId = null;
      if (_onContinue) _onContinue(pathId);
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      if (restartBtn.dataset.confirmingRestart !== 'true') {
        _armRestartConfirmation(restartBtn);
        return;
      }

      _resetRestartConfirmation();
      hideBlockingSurface('gameover-modal');
      _activePathId = null;
      if (_onRestart) _onRestart();
    });
  }

  _initialized = true;
}

export function showVictoryReport(payload) {
  var report = payload || {};
  var path = report.path || {};
  var stats = Array.isArray(report.stats) ? report.stats : [];
  var progress = Array.isArray(report.progress) ? report.progress : [];
  var modal = document.getElementById('gameover-modal');
  var titleEl = document.getElementById('gameover-title');
  var messageEl = document.getElementById('gameover-message');
  if (!modal || !titleEl || !messageEl) return false;

  _activePathId = path.id || null;
  modal.dataset.resultType = 'victory';
  modal.dataset.victoryPath = _activePathId || '';
  titleEl.textContent = path.victoryTitle || '胜利结算';

  var pathRows = progress.map(function (item) {
    var pct = Math.max(0, Math.min(100, Math.floor((item.progress || 0) * 100)));
    var status = item.completed ? '达成' : pct + '%';
    var progressText = item.completed
      ? (item.name + ' 已达成')
      : (item.name + ' 当前完成 ' + pct + '%');
    return (
      '<article class="gameover-path-row' + (item.completed ? ' gameover-path-row--done' : '') + '" role="listitem" aria-label="' + _escapeHtml(progressText) + '">' +
        '<div class="gameover-path-head">' +
          '<span class="gameover-path-icon" aria-hidden="true">' + _escapeHtml(item.icon) + '</span>' +
          '<span class="gameover-path-name">' + _escapeHtml(item.name) + '</span>' +
          '<span class="gameover-path-status">' + _escapeHtml(status) + '</span>' +
        '</div>' +
        '<div class="gameover-path-bar" role="progressbar" aria-label="' + _escapeHtml(item.name) + '完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-valuetext="' + _escapeHtml(progressText) + '">' +
          '<span class="gameover-path-fill" style="width:' + pct + '%"></span>' +
        '</div>' +
      '</article>'
    );
  }).join('');

  if (!pathRows) {
    pathRows = '<div class="gameover-path-empty" role="listitem">暂无胜利路径数据。</div>';
  }

  messageEl.setAttribute('role', 'region');
  messageEl.setAttribute('aria-label', '胜利结算报告');
  messageEl.innerHTML =
    '<section class="gameover-brief" aria-label="胜利摘要">' +
      '<div class="gameover-brief-kicker">胜利结算</div>' +
      '<p class="gameover-brief-message">' + _escapeHtml(path.victoryMessage || '当前公司已达成一条胜利路径。') + '</p>' +
    '</section>' +
    '<section class="gameover-stat-grid" role="list" aria-label="游戏统计">' +
      stats.map(function (item) {
        return '<div class="gameover-stat" role="listitem"><span>' + _escapeHtml(item.label) + '</span><strong>' + _escapeHtml(item.value) + '</strong></div>';
      }).join('') +
    '</section>' +
    '<section class="gameover-paths" aria-labelledby="gameover-paths-title">' +
      '<h3 id="gameover-paths-title">胜利路径</h3>' +
      '<div class="gameover-path-list" role="list" aria-label="胜利路径完成度">' + pathRows + '</div>' +
    '</section>' +
    '<section id="gameover-next-actions" class="gameover-next-actions" aria-label="结算后续操作">' +
      '<div class="gameover-next-card gameover-next-card--primary" id="gameover-continue-note">' +
        '<span>继续经营</span>' +
        '<strong>保留当前公司，继续推进其他胜利路径</strong>' +
        '<small>当前航线、资产与进度都会保留；同一条胜利路径在本次会话中不会重复打断经营。</small>' +
      '</div>' +
      '<div class="gameover-next-card gameover-next-card--danger" id="gameover-restart-note">' +
        '<span>重新开始</span>' +
        '<strong>清空当前运行状态并创建新公司</strong>' +
        '<small>这是不可逆操作，需要再次点击确认；请先保存需要保留的进度。</small>' +
      '</div>' +
    '</section>';

  _resetRestartConfirmation();
  showBlockingSurface('gameover-modal', { focusSelector: '#continue-playing-btn' });
  return true;
}

function _armRestartConfirmation(restartBtn) {
  restartBtn.dataset.confirmingRestart = 'true';
  restartBtn.textContent = '确认重新开始';
  restartBtn.classList.add('is-confirming');
  restartBtn.setAttribute('aria-label', '再次点击确认重新开始');
  restartBtn.setAttribute('aria-pressed', 'true');
  _setActionStatus('再次点击“确认重新开始”将清空当前运行状态；选择“继续经营”可取消。');
}

function _resetRestartConfirmation() {
  var restartBtn = document.getElementById('restart-btn');
  if (restartBtn) {
    restartBtn.dataset.confirmingRestart = 'false';
    restartBtn.textContent = '重新开始';
    restartBtn.classList.remove('is-confirming');
    restartBtn.setAttribute('aria-label', '重新开始新公司');
    restartBtn.setAttribute('aria-pressed', 'false');
  }
  _setActionStatus('');
}

function _setActionStatus(message) {
  var statusEl = document.getElementById('gameover-action-status');
  if (statusEl) statusEl.textContent = message || '';
}

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
