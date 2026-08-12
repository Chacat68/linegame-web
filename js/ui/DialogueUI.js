// js/ui/DialogueUI.js — 轻量剧情对话弹窗
// 依赖：无
// 导出：init, showScene, hideScene, isOpen

import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';

let _activeScene = null;
let _activeLineIndex = 0;
let _onComplete = null;
let _choiceMode = false;
let _selectedChoice = null;
let _activeLines = [];
let _mainLines = [];

export function init() {
  var modal = document.getElementById('dialogue-modal');
  if (!modal || modal.dataset.dialogueBound === '1') return;

  modal.dataset.dialogueBound = '1';

  var nextBtn = document.getElementById('dialogue-next-btn');
  var skipBtn = document.getElementById('dialogue-skip-btn');

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      _advance();
    });
  }
  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      _finish(true);
    });
  }

  bindBlockingSurfaceDismiss('dialogue-modal', {
    onDismiss: function () {
      _finish(true);
    },
  });

  if (modal.dataset.dialogueKeyboardBound !== '1') {
    modal.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Enter' || event.key === ' ') {
        if (_choiceMode) return;
        var targetTag = event.target && event.target.tagName
          ? String(event.target.tagName).toUpperCase()
          : '';
        if (targetTag === 'BUTTON' || targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') return;
        event.preventDefault();
        _advance();
      }
    });
    modal.dataset.dialogueKeyboardBound = '1';
  }
}

export function showScene(scene, onComplete) {
  if (!scene || !Array.isArray(scene.lines) || scene.lines.length === 0) {
    if (typeof onComplete === 'function') onComplete({ skipped: false, empty: true });
    return;
  }

  _activeScene = scene;
  _mainLines = scene.lines.slice();
  _activeLines = _mainLines;
  _activeLineIndex = 0;
  _choiceMode = false;
  _selectedChoice = null;
  _onComplete = onComplete || null;

  _render();
  showBlockingSurface('dialogue-modal');
  _focusElement(document.getElementById('dialogue-next-btn'));
}

export function hideScene() {
  hideBlockingSurface('dialogue-modal');
  _activeScene = null;
  _activeLineIndex = 0;
  _choiceMode = false;
  _selectedChoice = null;
  _activeLines = [];
  _mainLines = [];
  _onComplete = null;
}

export function isOpen() {
  var modal = document.getElementById('dialogue-modal');
  return !!(modal && !modal.classList.contains('hidden') && _activeScene);
}

function _advance() {
  if (!_activeScene) return;
  if (_choiceMode) return;

  if (_activeLineIndex >= _activeLines.length - 1) {
    if (_activeLines === _mainLines && Array.isArray(_activeScene.choices) && _activeScene.choices.length > 0) {
      _choiceMode = true;
      _render();
      return;
    }
    _finish(false);
    return;
  }

  _activeLineIndex += 1;
  _render();
}

function _selectChoice(choiceIndex) {
  if (!_activeScene || !_choiceMode || !Array.isArray(_activeScene.choices)) return;

  var choice = _activeScene.choices[choiceIndex];
  if (!choice) return;

  _selectedChoice = choice;
  _choiceMode = false;

  if (!Array.isArray(choice.responseLines) || choice.responseLines.length === 0) {
    _finish(false);
    return;
  }

  _activeLines = choice.responseLines.slice();
  _activeLineIndex = 0;
  _render();
  _focusElement(document.getElementById('dialogue-next-btn'));
}

function _finish(skipped) {
  var callback = _onComplete;
  var choiceId = _selectedChoice ? _selectedChoice.id : null;
  hideScene();
  if (typeof callback === 'function') {
    callback({ skipped: !!skipped, choiceId: choiceId });
  }
}

function _render() {
  if (!_activeScene) return;

  var line = _activeLines[_activeLineIndex] || {};
  var modal = document.getElementById('dialogue-modal');
  var modalBox = modal && typeof modal.querySelector === 'function'
    ? modal.querySelector('.dialogue-modal-box')
    : null;
  var sceneLabel = document.getElementById('dialogue-scene-label');
  var sceneTitle = document.getElementById('dialogue-scene-title');
  var speakerIcon = document.getElementById('dialogue-speaker-icon');
  var speakerName = document.getElementById('dialogue-speaker-name');
  var content = document.getElementById('dialogue-text');
  var footer = document.getElementById('dialogue-footer');
  var progress = document.getElementById('dialogue-progress');
  var summary = document.getElementById('dialogue-summary');
  var branchPanel = document.getElementById('dialogue-branch-panel');
  var nextBtn = document.getElementById('dialogue-next-btn');
  var choiceBox = document.getElementById('dialogue-choices');
  var totalSteps = Math.max(1, _activeLines === _mainLines
    ? _mainLines.length
    : _mainLines.length + _activeLines.length);
  var activeIndex = _activeLines === _mainLines
    ? _activeLineIndex
    : _mainLines.length + _activeLineIndex;

  if (modal) {
    modal.dataset.dialogueMode = _choiceMode ? 'choice' : 'line';
    modal.dataset.dialogueStep = String(_activeLineIndex + 1);
  }
  if (modalBox) {
    modalBox.dataset.dialogueMode = _choiceMode ? 'choice' : 'line';
    modalBox.dataset.dialogueStep = String(_activeLineIndex + 1);
  }
  if (sceneLabel) sceneLabel.textContent = _activeScene.label || '剧情演出';
  if (sceneTitle) sceneTitle.textContent = _activeScene.title || '通讯接入';
  if (speakerIcon) speakerIcon.textContent = line.icon || '💬';
  if (speakerName) speakerName.textContent = line.speaker || '未知发言者';
  if (content) content.textContent = line.text || '';

  if (footer) {
    var footerText = (_selectedChoice && _selectedChoice.responseFooter) || _activeScene.footer;
    if (footerText) {
      footer.textContent = footerText;
      footer.classList.remove('hidden');
      footer.setAttribute('aria-hidden', 'false');
    } else {
      footer.textContent = '';
      footer.classList.add('hidden');
      footer.setAttribute('aria-hidden', 'true');
    }
  }

  if (progress) {
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', '剧情进度');
    progress.setAttribute('aria-valuemin', '1');
    progress.setAttribute('aria-valuemax', String(totalSteps));
    progress.setAttribute('aria-valuenow', String(Math.min(totalSteps, activeIndex + 1)));
    progress.setAttribute('aria-valuetext', '第 ' + String(Math.min(totalSteps, activeIndex + 1)) + ' / ' + String(totalSteps) + ' 段');
    progress.innerHTML = Array.from({ length: totalSteps }, function (_, index) {
      var className = index === activeIndex ? 'dialogue-progress-dot active' : 'dialogue-progress-dot';
      return '<span class="' + className + '" aria-hidden="true"></span>';
    }).join('');
  }

  _renderDialogueSummary(summary, totalSteps, activeIndex);
  _renderDialogueBranchPanel(branchPanel, totalSteps, activeIndex);

  if (nextBtn) {
    var isLastLine = _activeLineIndex >= _activeLines.length - 1;
    var hasPendingChoices = isLastLine
      && _activeLines === _mainLines
      && Array.isArray(_activeScene.choices)
      && _activeScene.choices.length > 0;
    nextBtn.textContent = hasPendingChoices ? '选择回应' : (isLastLine ? '结束' : '下一句');
    nextBtn.setAttribute('aria-label', hasPendingChoices ? '查看剧情分支选项' : (isLastLine ? '结束剧情' : '播放下一句'));
    nextBtn.classList.toggle('hidden', _choiceMode);
    nextBtn.disabled = !!_choiceMode;
    nextBtn.setAttribute('aria-hidden', _choiceMode ? 'true' : 'false');
  }

  if (choiceBox) {
    choiceBox.setAttribute('role', 'list');
    choiceBox.setAttribute('aria-label', '剧情分支选项');
    choiceBox.setAttribute('aria-busy', 'false');
    if (_choiceMode && Array.isArray(_activeScene.choices) && _activeScene.choices.length > 0) {
      choiceBox.innerHTML = '';
      if (Array.isArray(choiceBox.children)) choiceBox.children.length = 0;
      var choiceButtons = [];
      _activeScene.choices.forEach(function (choice, index) {
        var item = document.createElement('div');
        var btn = document.createElement('button');
        var choiceText = choice.text || ('选项 ' + (index + 1));
        var labelId = 'dialogue-choice-' + index + '-label';
        var hintId = 'dialogue-choice-' + index + '-hint';

        item.className = 'dialogue-choice-item';
        item.setAttribute('role', 'listitem');
        btn.type = 'button';
        btn.className = 'dialogue-choice-btn';
        btn.dataset.dialogueChoiceIndex = String(index);
        btn.setAttribute('aria-label', _getDialogueChoiceAriaLabel(choice, index));
        btn.setAttribute('aria-labelledby', labelId);
        btn.setAttribute('data-dialogue-choice-card', 'true');
        _bindChoiceNavigation(btn, index, choiceButtons);

        var textEl = document.createElement('span');
        textEl.className = 'dialogue-choice-text';
        textEl.id = labelId;
        textEl.textContent = choiceText;
        btn.appendChild(textEl);

        if (choice.hint) {
          var hintEl = document.createElement('span');
          hintEl.className = 'dialogue-choice-hint';
          hintEl.id = hintId;
          hintEl.textContent = choice.hint;
          btn.appendChild(hintEl);
          btn.setAttribute('aria-describedby', hintId);
        }

        btn.addEventListener('click', function () {
          if (!_choiceMode) return;
          choiceBox.setAttribute('aria-busy', 'true');
          choiceButtons.forEach(function (choiceButton) {
            choiceButton.disabled = true;
            choiceButton.setAttribute('aria-disabled', 'true');
          });
          _selectChoice(index);
        });
        choiceButtons.push(btn);
        item.appendChild(btn);
        choiceBox.appendChild(item);
      });
      choiceBox.classList.remove('hidden');
      choiceBox.setAttribute('aria-hidden', 'false');
      _focusElement(choiceButtons[0]);
    } else {
      choiceBox.innerHTML = '';
      if (Array.isArray(choiceBox.children)) choiceBox.children.length = 0;
      choiceBox.classList.add('hidden');
      choiceBox.setAttribute('aria-hidden', 'true');
    }
  }
}

function _renderDialogueSummary(summaryEl, totalSteps, activeIndex) {
  if (!summaryEl) return;

  var choices = Array.isArray(_activeScene && _activeScene.choices) ? _activeScene.choices : [];
  var modeLabel = _choiceMode ? '选择分支' : '播放中';
  var progressLabel = String(Math.min(totalSteps, activeIndex + 1)) + ' / ' + String(totalSteps);
  summaryEl.innerHTML = '';
  if (Array.isArray(summaryEl.children)) summaryEl.children.length = 0;
  summaryEl.setAttribute('role', 'list');
  summaryEl.setAttribute('aria-label', '剧情状态摘要');

  [
    { label: '进度', value: progressLabel },
    { label: '状态', value: modeLabel },
    { label: '分支', value: choices.length > 0 ? String(choices.length) + ' 项' : '无' },
  ].forEach(function (item) {
    var card = document.createElement('span');
    var label = document.createElement('span');
    var value = document.createElement('strong');

    card.className = 'dialogue-summary-item';
    card.setAttribute('role', 'listitem');
    label.textContent = item.label;
    value.textContent = item.value;

    card.appendChild(label);
    card.appendChild(value);
    summaryEl.appendChild(card);
  });
}

function _renderDialogueBranchPanel(panelEl, totalSteps, activeIndex) {
  if (!panelEl) return;

  var choices = Array.isArray(_activeScene && _activeScene.choices) ? _activeScene.choices : [];
  var selectedLabel = _selectedChoice && _selectedChoice.text ? _selectedChoice.text : '未选择';
  var modeLabel = _choiceMode ? '等待选择' : (_selectedChoice ? '回应播放' : '线性播放');
  var branchLabel = choices.length > 0 ? String(choices.length) + ' 个分支' : '无分支';

  panelEl.innerHTML = '';
  if (Array.isArray(panelEl.children)) panelEl.children.length = 0;
  panelEl.setAttribute('role', 'list');
  panelEl.setAttribute('aria-label', '剧情分支状态');

  [
    { label: '段落', value: String(Math.min(totalSteps, activeIndex + 1)) + ' / ' + String(totalSteps), note: _activeLines === _mainLines ? '主线通讯' : '回应通讯' },
    { label: '模式', value: modeLabel, note: _choiceMode ? '分支按钮已展开' : '继续播放当前文本' },
    { label: '分支', value: branchLabel, note: choices.length > 0 ? '选择后记录偏好' : '只播放当前内容' },
    { label: '已选', value: selectedLabel, note: _selectedChoice && _selectedChoice.responseFooter ? _selectedChoice.responseFooter : '等待玩家输入' },
  ].forEach(function (item) {
    var card = document.createElement('article');
    var label = document.createElement('span');
    var value = document.createElement('strong');
    var note = document.createElement('small');

    card.className = 'dialogue-branch-item';
    card.setAttribute('role', 'listitem');
    label.textContent = item.label;
    value.textContent = item.value;
    note.textContent = item.note;

    card.appendChild(label);
    card.appendChild(value);
    card.appendChild(note);
    panelEl.appendChild(card);
  });
}

function _getDialogueChoiceAriaLabel(choice, index) {
  var label = choice && choice.text ? choice.text : '选项 ' + (index + 1);
  if (choice && choice.hint) return label + '，' + choice.hint;
  return label;
}

function _bindChoiceNavigation(button, index, buttons) {
  button.addEventListener('keydown', function (event) {
    var key = event && event.key;
    var targetIndex = index;

    if (key === 'ArrowRight' || key === 'ArrowDown') targetIndex = Math.min(buttons.length - 1, index + 1);
    else if (key === 'ArrowLeft' || key === 'ArrowUp') targetIndex = Math.max(0, index - 1);
    else if (key === 'Home') targetIndex = 0;
    else if (key === 'End') targetIndex = buttons.length - 1;
    else return;

    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    _focusElement(buttons[targetIndex]);
  });
}

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}
