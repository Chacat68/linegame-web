// js/ui/DialogueSession.js — 剧情播放与分支选择的无 DOM 会话状态

function _result(type, changed) {
  return Object.freeze({ type: type, changed: changed !== false });
}

export function createDialogueSession() {
  var activeScene = null;
  var mainLines = [];
  var activeLines = [];
  var activeLineIndex = 0;
  var choiceMode = false;
  var selectedChoice = null;
  var startCount = 0;
  var advanceCount = 0;
  var selectionCount = 0;
  var resetCount = 0;

  function start(scene) {
    if (!scene || !Array.isArray(scene.lines) || scene.lines.length === 0) return false;
    activeScene = scene;
    mainLines = scene.lines.slice();
    activeLines = mainLines;
    activeLineIndex = 0;
    choiceMode = false;
    selectedChoice = null;
    startCount += 1;
    return true;
  }

  function advance() {
    if (!activeScene || choiceMode) return _result('blocked', false);
    advanceCount += 1;
    if (activeLineIndex >= activeLines.length - 1) {
      var choices = Array.isArray(activeScene.choices) ? activeScene.choices : [];
      if (activeLines === mainLines && choices.length > 0) {
        choiceMode = true;
        return _result('choices');
      }
      return _result('complete', false);
    }
    activeLineIndex += 1;
    return _result('line');
  }

  function selectChoice(choiceIndex) {
    var choices = activeScene && Array.isArray(activeScene.choices) ? activeScene.choices : [];
    var choice = choiceMode ? choices[choiceIndex] : null;
    if (!choice) return _result('blocked', false);
    selectedChoice = choice;
    choiceMode = false;
    selectionCount += 1;
    if (!Array.isArray(choice.responseLines) || choice.responseLines.length === 0) {
      return _result('complete', false);
    }
    activeLines = choice.responseLines.slice();
    activeLineIndex = 0;
    return _result('response');
  }

  function getSnapshot() {
    var isMainLine = activeLines === mainLines;
    return Object.freeze({
      active: !!activeScene,
      activeLineCount: activeLines.length,
      choiceMode: choiceMode,
      choices: Object.freeze(activeScene && Array.isArray(activeScene.choices) ? activeScene.choices.slice() : []),
      isMainLine: isMainLine,
      line: activeLines[activeLineIndex] || null,
      lineIndex: activeLineIndex,
      mainLineCount: mainLines.length,
      scene: activeScene,
      selectedChoice: selectedChoice,
    });
  }

  function getDiagnostics() {
    return Object.freeze({
      active: !!activeScene,
      advanceCount: advanceCount,
      choiceMode: choiceMode,
      lineIndex: activeLineIndex,
      resetCount: resetCount,
      selectedChoiceId: selectedChoice && selectedChoice.id ? selectedChoice.id : null,
      selectionCount: selectionCount,
      startCount: startCount,
    });
  }

  function reset() {
    activeScene = null;
    mainLines = [];
    activeLines = [];
    activeLineIndex = 0;
    choiceMode = false;
    selectedChoice = null;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    advance: advance,
    getDiagnostics: getDiagnostics,
    getSnapshot: getSnapshot,
    reset: reset,
    selectChoice: selectChoice,
    start: start,
  });
}
