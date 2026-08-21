// js/ui/VictoryProgressPresenter.js — 长期路线摘要与详情的纯 DOM presenter

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _resolveDocument(source) {
  if (source && typeof source.getElementById === 'function') return source;
  return typeof document === 'undefined' ? null : document;
}

export function getVictoryNextRequirement(pathProgress) {
  if (!pathProgress || !Array.isArray(pathProgress.requirements)) return null;
  var pending = pathProgress.requirements.filter(function (requirement) {
    return requirement && !requirement.done;
  });
  if (pending.length === 0) return null;
  return pending.sort(function (left, right) {
    var leftRatio = left.target > 0 ? left.current / left.target : 0;
    var rightRatio = right.target > 0 ? right.current / right.target : 0;
    return rightRatio - leftRatio;
  })[0];
}

export function renderVictoryProgressSummary(progressList, unlockedPathCount, documentSource) {
  var doc = _resolveDocument(documentSource);
  var summary = doc && doc.getElementById('victory-progress-summary');
  var button = doc && doc.getElementById('victory-progress-btn');
  if (!summary && !button) return false;
  var paths = Array.isArray(progressList) ? progressList : [];
  var completedCount = paths.filter(function (path) { return !!path.completed; }).length;
  var totalPaths = Number.isFinite(Number(unlockedPathCount))
    ? Math.max(0, Math.floor(Number(unlockedPathCount)))
    : paths.length;
  var summaryText = completedCount > 0
    ? completedCount + '/' + totalPaths + ' 已完成'
    : totalPaths + ' 条路径（章节解锁中）';
  if (summary) summary.textContent = summaryText;
  if (button) {
    button.setAttribute('aria-label', '长期路线进度：' + summaryText);
    button.setAttribute('title', '查看长期路线进度 · ' + summaryText);
  }
  return true;
}

export function renderVictoryProgressModal(progressList, documentSource) {
  var doc = _resolveDocument(documentSource);
  var body = doc && doc.getElementById('victory-modal-body');
  if (!body) return false;
  var paths = Array.isArray(progressList) ? progressList : [];
  var completedCount = paths.filter(function (path) { return !!path.completed; }).length;
  var totalCount = Math.max(1, paths.length);
  var completionPct = Math.round((completedCount / totalCount) * 100);
  var bestPath = paths.reduce(function (best, current) {
    if (!best) return current;
    return (current.progress || 0) > (best.progress || 0) ? current : best;
  }, null);
  var bestPathNextReq = getVictoryNextRequirement(bestPath);
  var bestPathNextText = bestPathNextReq
    ? bestPathNextReq.label + ' · ' + bestPathNextReq.current + '/' + bestPathNextReq.target
    : (bestPath && bestPath.completed ? '该路径已达成' : '暂无可追踪缺口');

  body.setAttribute('role', 'region');
  body.setAttribute('aria-live', 'polite');
  body.setAttribute('aria-label', '长期路线进度详情');

  var html =
    '<section class="vp-overview" aria-label="长期路线总览">' +
      '<div class="vp-overview-copy">' +
        '<div class="vp-overview-kicker">长期路线</div>' +
        '<div class="vp-overview-title">' + _escapeHtml(completedCount > 0 ? '已有路径达成' : '持续推进多路径胜利') + '</div>' +
        '<div class="vp-overview-desc">' + _escapeHtml(bestPath ? '当前最接近：' + bestPath.name : '暂无可追踪路径') + '</div>' +
        '<div class="vp-overview-next"><span>下一缺口</span><strong>' + _escapeHtml(bestPathNextText) + '</strong></div>' +
      '</div>' +
      '<div class="vp-overview-grid" role="list" aria-label="路线统计">' +
        '<div class="vp-overview-stat" role="listitem"><span>路径</span><strong>' + paths.length + '</strong></div>' +
        '<div class="vp-overview-stat" role="listitem"><span>已达成</span><strong>' + completedCount + '</strong></div>' +
        '<div class="vp-overview-stat" role="listitem"><span>达成率</span><strong>' + completionPct + '%</strong></div>' +
        '<div class="vp-overview-stat" role="listitem"><span>最高进度</span><strong>' + (bestPath ? Math.min(100, Math.floor((bestPath.progress || 0) * 100)) : 0) + '%</strong></div>' +
      '</div>' +
    '</section>' +
    '<div class="vp-card-list" role="list" aria-label="长期路线列表">';

  if (paths.length === 0) {
    html += '<div class="vp-empty" role="listitem">暂无长期路线进度，继续完成贸易、探索、研究或任务后再查看。</div>';
  }

  paths.forEach(function (path) {
    var pctVal = Math.min(100, Math.floor((path.progress || 0) * 100));
    var doneClass = path.completed ? ' vp-done' : '';
    var progressText = path.completed
      ? path.name + ' 已达成'
      : path.name + ' 当前完成 ' + pctVal + '%';
    var nextReq = getVictoryNextRequirement(path);
    var nextReqText = nextReq
      ? nextReq.label + ' · ' + nextReq.current + '/' + nextReq.target
      : (path.completed ? '所有条件已完成' : '暂无拆分条件');
    var requirementsHtml = '';
    (Array.isArray(path.requirements) ? path.requirements : []).forEach(function (requirement) {
      var doneReq = requirement.done ? ' done' : '';
      var reqStatus = requirement.done ? '已完成' : '未完成';
      requirementsHtml +=
        '<div class="vp-card-req' + doneReq + '" role="listitem" aria-label="' + _escapeHtml(requirement.label + '，' + reqStatus + '，' + requirement.current + '/' + requirement.target) + '">' +
          '<span class="vp-req-state" aria-hidden="true">' + (requirement.done ? '✅' : '⬜') + '</span>' +
          '<span class="vp-req-label">' + _escapeHtml(requirement.label) + '</span>' +
          '<span class="vp-req-count">(' + _escapeHtml(requirement.current) + '/' + _escapeHtml(requirement.target) + ')</span>' +
        '</div>';
    });
    if (!requirementsHtml) {
      requirementsHtml = '<div class="vp-card-req" role="listitem">暂无拆分条件</div>';
    }
    var policy = path.policy;
    var policyHtml = '';
    if (policy) {
      var policyStatus = path.policySelected ? '当前路线' : (path.policyLocked ? '已选择其他路线' : '可选择');
      var policyButtonLabel = path.policySelected ? '当前路线' : (path.policyLocked ? '选择已锁定' : '选择此路线（不可更改）');
      policyHtml =
        '<div class="vp-policy' + (path.policySelected ? ' is-active' : '') + '">' +
          '<div class="vp-policy-head"><strong>' + _escapeHtml(policy.name) + '</strong><span>' + _escapeHtml(policyStatus) + '</span></div>' +
          '<p>' + _escapeHtml(policy.summary) + '</p>' +
          '<div class="vp-policy-effects"><span class="is-benefit">收益：' + _escapeHtml(policy.benefit) + '</span><span class="is-tradeoff">代价：' + _escapeHtml(policy.tradeoff) + '</span></div>' +
          '<button class="vp-policy-btn" type="button" data-victory-policy-id="' + _escapeHtml(path.pathId) + '"' + (path.policySelected || path.policyLocked ? ' disabled' : '') + '>' + _escapeHtml(policyButtonLabel) + '</button>' +
        '</div>';
    }
    html +=
      '<article class="vp-card' + doneClass + '" role="listitem" aria-label="' + _escapeHtml(progressText) + '">' +
        '<div class="vp-card-header">' +
          '<span class="vp-card-icon" aria-hidden="true">' + _escapeHtml(path.icon) + '</span>' +
          '<span class="vp-card-name">' + _escapeHtml(path.name) + '</span>' +
          '<span class="vp-card-pct">' + pctVal + '%</span>' +
        '</div>' +
        '<div class="vp-card-bar-track" role="progressbar" aria-label="' + _escapeHtml(path.name) + '完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pctVal + '" aria-valuetext="' + _escapeHtml(progressText) + '">' +
          '<div class="vp-card-bar-fill" style="width:' + pctVal + '%;background:' + _escapeHtml(path.color || 'var(--accent-cyan)') + '"></div>' +
        '</div>' +
        '<div class="vp-card-next"><span>下一条件</span><strong>' + _escapeHtml(nextReqText) + '</strong></div>' +
        policyHtml +
        '<div class="vp-card-reqs" role="list" aria-label="' + _escapeHtml(path.name) + '条件">' + requirementsHtml + '</div>' +
      '</article>';
  });
  body.innerHTML = html + '</div>';
  return true;
}
