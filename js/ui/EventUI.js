// js/ui/EventUI.js — 随机事件弹窗界面
// 依赖：无
// 导出：showEvent

/**
 * 显示随机事件模态框
 * @param {object}   event      事件定义对象
 * @param {Function} onChoice   (choiceIndex: number) => void
 */
export function showEvent(event, onChoice) {
  document.getElementById('event-icon').textContent  = event.icon;
  document.getElementById('event-title').textContent = event.title;
  document.getElementById('event-desc').textContent  = event.description;
  _renderMeta(event);

  const choicesDiv = document.getElementById('event-choices');
  choicesDiv.innerHTML = '';

  event.choices.forEach(function (choice, index) {
    const btn = document.createElement('button');
    btn.className = 'event-choice-btn';
    btn.innerHTML =
      '<span class="choice-text">' + choice.text + '</span>' +
      (choice.tooltip ? '<span class="choice-tooltip">' + choice.tooltip + '</span>' : '');
    btn.addEventListener('click', function () {
      document.getElementById('event-modal').classList.add('hidden');
      onChoice(index);
    });
    choicesDiv.appendChild(btn);
  });

  document.getElementById('event-modal').classList.remove('hidden');
}

/**
 * 隐藏事件模态框
 */
export function hideEvent() {
  document.getElementById('event-modal').classList.add('hidden');
}

function _renderMeta(event) {
  const metaDiv = document.getElementById('event-meta');
  if (!metaDiv) return;

  metaDiv.innerHTML = '';

  const tags = [
    {
      text: _getRiskLabel(event.risk),
      className: 'event-tag event-tag-risk-' + (event.risk || 'risky'),
    },
    {
      text: _getStageLabel(event.stage),
      className: 'event-tag',
    },
  ];

  if (event.stage === 'chain' || event.chainFollowUp) {
    tags.push({
      text: event.stage === 'chain' ? '事件链后续' : '可能引发后续事件',
      className: 'event-tag event-tag-chain',
    });
  }

  tags.forEach(function (tag) {
    const badge = document.createElement('span');
    badge.className = tag.className;
    badge.textContent = tag.text;
    metaDiv.appendChild(badge);
  });
}

function _getRiskLabel(risk) {
  if (risk === 'safe') return '低风险';
  if (risk === 'dangerous') return '高风险';
  return '中风险';
}

function _getStageLabel(stage) {
  if (stage === 'early') return '前期事件';
  if (stage === 'late') return '后期事件';
  if (stage === 'chain') return '连续事件';
  return '中期事件';
}
