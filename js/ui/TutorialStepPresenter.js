// js/ui/TutorialStepPresenter.js — 教程步骤内容与可访问语义纯投影

const PHASE_NAMES = Object.freeze({
  1: '起步校准',
  2: '第一轮交易',
  3: '行动接管',
});

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatContent(text) {
  return _escapeHtml(text)
    .replace(/【(.+?)】/g, '<span class="tut-keyword">$1</span>')
    .replace(/\n/g, '<br>');
}

export function buildTutorialStepView(request) {
  var input = request || {};
  var step = input.step || {};
  var safeIndex = Math.max(0, Number(input.index) || 0);
  var safeTotal = Math.max(1, Number(input.total) || 1);
  var stepNumber = Math.min(safeTotal, safeIndex + 1);
  var progressPct = Math.round((stepNumber / safeTotal) * 100);
  var isManual = step.trigger === 'manual';
  var progressText = '第 ' + stepNumber + ' / ' + safeTotal + ' 步';
  var actionHint = !isManual
    ? '<div class="tut-action-hint" id="tutorial-action-hint" role="status">请执行上述操作以继续</div>'
    : '';
  var helperAction = step.helperAction && step.helperAction.id && step.helperAction.label
    ? '<button id="tut-helper-action-btn" class="tut-btn tut-btn-primary" type="button" data-tutorial-action="' + _escapeHtml(step.helperAction.id) + '">' + _escapeHtml(step.helperAction.label) + '</button>'
    : '';
  var html = '<div class="tut-header">' +
      '<span class="tut-phase">阶段' + _escapeHtml(step.phase) + ': ' + _escapeHtml(PHASE_NAMES[step.phase] || '') + '</span>' +
      '<span class="tut-progress">' + stepNumber + '/' + safeTotal + '</span>' +
    '</div>' +
    '<div class="tut-progress-bar" role="progressbar" aria-label="教程进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPct + '" aria-valuetext="' + _escapeHtml(progressText) + '"><div class="tut-progress-fill" style="width:' + progressPct + '%"></div></div>' +
    '<div class="tut-npc"><span class="tut-npc-icon" aria-hidden="true">' + _escapeHtml(step.npcIcon || '📡') + '</span><span class="tut-npc-name">' + _escapeHtml(step.npcName || '导航员') + '</span></div>' +
    '<h3 class="tut-title" id="tutorial-tooltip-title">' + _escapeHtml(step.title || '教程提示') + '</h3>' +
    '<div class="tut-content" id="tutorial-tooltip-content">' + _formatContent(step.content || '') + '</div>' +
    actionHint +
    '<div class="tut-actions">' +
      (isManual ? '<button id="tut-next-btn" class="tut-btn tut-btn-primary" type="button">下一步 →</button>' : '') +
      helperAction +
      '<button id="tut-skip-btn" class="tut-btn tut-btn-secondary" type="button">跳过教程</button>' +
    '</div>';

  return Object.freeze({
    ariaDescribedBy: isManual ? 'tutorial-tooltip-content' : 'tutorial-tooltip-content tutorial-action-hint',
    ariaLabel: progressText + '：' + (step.title || '教程提示'),
    helperActionId: step.helperAction && step.helperAction.id ? String(step.helperAction.id) : null,
    highlight: step.highlight || null,
    html: html,
    position: step.position || 'center',
    stepNumber: stepNumber,
    totalSteps: safeTotal,
    trigger: isManual ? 'manual' : 'action',
  });
}
