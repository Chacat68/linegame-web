// js/ui/DialogueUI.js — 轻量剧情对话弹窗
// 依赖：无
// 导出：init, showScene, hideScene, isOpen

import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js?v=20260505-surface4';

let _activeScene = null;
let _activeLineIndex = 0;
let _onComplete = null;
let _keydownBound = false;
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

  if (!_keydownBound) {
    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        _advance();
      }
    });
    _keydownBound = true;
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
  if (!_activeScene || !Array.isArray(_activeScene.choices)) return;

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
  var sceneLabel = document.getElementById('dialogue-scene-label');
  var sceneTitle = document.getElementById('dialogue-scene-title');
  var speakerIcon = document.getElementById('dialogue-speaker-icon');
  var speakerName = document.getElementById('dialogue-speaker-name');
  var content = document.getElementById('dialogue-text');
  var footer = document.getElementById('dialogue-footer');
  var progress = document.getElementById('dialogue-progress');
  var nextBtn = document.getElementById('dialogue-next-btn');
  var choiceBox = document.getElementById('dialogue-choices');

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
    } else {
      footer.textContent = '';
      footer.classList.add('hidden');
    }
  }

  if (progress) {
    var totalSteps = _activeLines === _mainLines
      ? _mainLines.length
      : _mainLines.length + _activeLines.length;
    var activeIndex = _activeLines === _mainLines
      ? _activeLineIndex
      : _mainLines.length + _activeLineIndex;
    progress.innerHTML = Array.from({ length: totalSteps }, function (_, index) {
      var className = index === activeIndex ? 'dialogue-progress-dot active' : 'dialogue-progress-dot';
      return '<span class="' + className + '"></span>';
    }).join('');
  }

  if (nextBtn) {
    nextBtn.textContent = _activeLineIndex >= _activeLines.length - 1 ? '结束' : '下一句';
    nextBtn.classList.toggle('hidden', _choiceMode);
  }

  if (choiceBox) {
    if (_choiceMode && Array.isArray(_activeScene.choices) && _activeScene.choices.length > 0) {
      choiceBox.innerHTML = '';
      _activeScene.choices.forEach(function (choice, index) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dialogue-choice-btn';

        var textEl = document.createElement('span');
        textEl.className = 'dialogue-choice-text';
        textEl.textContent = choice.text || ('选项 ' + (index + 1));
        btn.appendChild(textEl);

        if (choice.hint) {
          var hintEl = document.createElement('span');
          hintEl.className = 'dialogue-choice-hint';
          hintEl.textContent = choice.hint;
          btn.appendChild(hintEl);
        }

        btn.addEventListener('click', function () {
          _selectChoice(index);
        });
        choiceBox.appendChild(btn);
      });
      choiceBox.classList.remove('hidden');
    } else {
      choiceBox.innerHTML = '';
      choiceBox.classList.add('hidden');
    }
  }
}