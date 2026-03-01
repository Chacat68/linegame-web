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
