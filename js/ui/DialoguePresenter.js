// js/ui/DialoguePresenter.js — 剧情场景、进度与分支状态纯投影

function _freezeItems(items) {
  return Object.freeze(items.map(function (item) { return Object.freeze(item); }));
}

function _choiceAriaLabel(choice, index) {
  var label = choice && choice.text ? choice.text : '选项 ' + (index + 1);
  return choice && choice.hint ? label + '，' + choice.hint : label;
}

export function buildDialogueView(snapshot) {
  var state = snapshot || {};
  if (!state.active || !state.scene) return null;
  var scene = state.scene;
  var line = state.line || {};
  var choices = Array.isArray(state.choices) ? state.choices : [];
  var totalSteps = Math.max(1, state.isMainLine
    ? state.mainLineCount
    : state.mainLineCount + state.activeLineCount);
  var activeIndex = state.isMainLine
    ? state.lineIndex
    : state.mainLineCount + state.lineIndex;
  var currentStep = Math.min(totalSteps, activeIndex + 1);
  var isLastLine = state.lineIndex >= state.activeLineCount - 1;
  var hasPendingChoices = isLastLine && state.isMainLine && choices.length > 0;
  var selectedChoice = state.selectedChoice;
  var footerText = (selectedChoice && selectedChoice.responseFooter) || scene.footer || '';
  var modeLabel = state.choiceMode ? '选择分支' : '播放中';
  var branchMode = state.choiceMode ? '等待选择' : (selectedChoice ? '回应播放' : '线性播放');
  var progressLabel = String(currentStep) + ' / ' + String(totalSteps);
  var choiceViews = choices.map(function (choice, index) {
    return {
      ariaLabel: _choiceAriaLabel(choice, index),
      hint: choice && choice.hint ? String(choice.hint) : '',
      hintId: 'dialogue-choice-' + index + '-hint',
      index: index,
      labelId: 'dialogue-choice-' + index + '-label',
      text: choice && choice.text ? String(choice.text) : '选项 ' + (index + 1),
    };
  });
  var summaryItems = [
    { label: '进度', value: progressLabel },
    { label: '状态', value: modeLabel },
    { label: '分支', value: choices.length > 0 ? String(choices.length) + ' 项' : '无' },
  ];
  var branchItems = [
    { label: '段落', value: progressLabel, note: state.isMainLine ? '主线通讯' : '回应通讯' },
    { label: '模式', value: branchMode, note: state.choiceMode ? '分支按钮已展开' : '继续播放当前文本' },
    { label: '分支', value: choices.length > 0 ? String(choices.length) + ' 个分支' : '无分支', note: choices.length > 0 ? '选择后记录偏好' : '只播放当前内容' },
    { label: '已选', value: selectedChoice && selectedChoice.text ? String(selectedChoice.text) : '未选择', note: selectedChoice && selectedChoice.responseFooter ? String(selectedChoice.responseFooter) : '等待玩家输入' },
  ];
  var progressHtml = Array.from({ length: totalSteps }, function (_, index) {
    return '<span class="' + (index === activeIndex ? 'dialogue-progress-dot active' : 'dialogue-progress-dot') + '" aria-hidden="true"></span>';
  }).join('');

  return Object.freeze({
    branchItems: _freezeItems(branchItems),
    choiceMode: !!state.choiceMode,
    choices: _freezeItems(choiceViews),
    currentStep: currentStep,
    footerText: String(footerText),
    footerVisible: !!footerText,
    mode: state.choiceMode ? 'choice' : 'line',
    nextButton: Object.freeze({
      ariaLabel: hasPendingChoices ? '查看剧情分支选项' : (isLastLine ? '结束剧情' : '播放下一句'),
      disabled: !!state.choiceMode,
      hidden: !!state.choiceMode,
      label: hasPendingChoices ? '选择回应' : (isLastLine ? '结束' : '下一句'),
    }),
    progressHtml: progressHtml,
    sceneLabel: String(scene.label || '剧情演出'),
    sceneTitle: String(scene.title || '通讯接入'),
    speakerIcon: String(line.icon || '💬'),
    speakerName: String(line.speaker || '未知发言者'),
    step: state.lineIndex + 1,
    summaryItems: _freezeItems(summaryItems),
    text: String(line.text || ''),
    totalSteps: totalSteps,
  });
}
