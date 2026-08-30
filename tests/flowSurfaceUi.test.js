import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

function createClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      var shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
  };
}

function createFakeElement(id, initialClasses) {
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  var element = {
    id: id || '',
    type: '',
    textContent: '',
    innerHTML: '',
    parentNode: null,
    dataset: {},
    style: {},
    children: [],
    focused: false,
    classList: createClassList(initialClasses),
    appendChild: function (child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatch: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: element, preventDefault: function () {}, stopPropagation: function () {} });
      });
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    removeAttribute: function (name) {
      delete attributes[name];
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector: function (selector) {
      if (selector === '.modal-box, [tabindex="-1"]') return element.modalBox || null;
      if (selector === '.dialogue-modal-box') return element.modalBox || null;
      return null;
    },
    focus: function () {
      element.focused = true;
    },
    getBoundingClientRect: function () {
      return element.rect || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  };
  return element;
}

describe('Flow surface UI', function () {
  var originalDocument;
  var originalWindow;

  beforeEach(function () {
    vi.resetModules();
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  it('事件弹窗会渲染语义化处置按钮并记录风险状态', async function () {
    var modal = createFakeElement('event-modal', ['modal', 'hidden']);
    modal.modalBox = createFakeElement('event-modal-box');
    var icon = createFakeElement('event-icon');
    var title = createFakeElement('event-title');
    var desc = createFakeElement('event-desc');
    var meta = createFakeElement('event-meta');
    var summary = createFakeElement('event-summary');
    var impact = createFakeElement('event-impact');
    var choices = createFakeElement('event-choices');

    var elements = {
      'event-modal': modal,
      'event-icon': icon,
      'event-title': title,
      'event-desc': desc,
      'event-meta': meta,
      'event-summary': summary,
      'event-impact': impact,
      'event-choices': choices,
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [modal];
        return [];
      },
      addEventListener: function () {},
      createElement: function () { return createFakeElement(); },
    };

    var selected = null;
    var selectionCount = 0;
    var EventUI = await import('../js/ui/EventUI.js?v=20260619-flowchoice1');

    EventUI.showEvent({
      icon: '⚠️',
      title: '异常货柜',
      description: '货柜封签异常。',
      risk: 'dangerous',
      stage: 'chain',
      choices: [
        { text: '<检查封签>', tooltip: '可能触发后续调查' },
        { text: '直接上报' },
      ],
    }, function (index) {
      selected = index;
      selectionCount += 1;
    });

    expect(modal.dataset.eventRisk).toBe('dangerous');
    expect(modal.dataset.eventStage).toBe('chain');
    expect(summary.getAttribute('role')).toBe('list');
    expect(summary.children).toHaveLength(3);
    expect(summary.children[0].getAttribute('role')).toBe('listitem');
    expect(summary.children[0].children[0].textContent).toBe('风险');
    expect(summary.children[0].children[1].textContent).toBe('高风险');
    expect(impact.getAttribute('role')).toBe('list');
    expect(impact.getAttribute('aria-label')).toBe('事件影响预览');
    expect(impact.children).toHaveLength(4);
    expect(impact.children[0].getAttribute('role')).toBe('listitem');
    expect(impact.children[0].children[0].textContent).toBe('风险程度');
    expect(impact.children[0].children[1].textContent).toBe('高风险');
    expect(impact.children[2].children[1].textContent).toBe('1 项承压');
    expect(choices.getAttribute('role')).toBe('list');
    expect(choices.children).toHaveLength(2);
    expect(choices.children[0].getAttribute('role')).toBe('listitem');
    expect(choices.children[0].children[0].type).toBe('button');
    expect(choices.children[0].children[0].dataset.eventChoiceIndex).toBe('0');
    expect(choices.children[0].children[0].getAttribute('aria-labelledby')).toBe('event-choice-0-label');
    expect(choices.children[0].children[0].getAttribute('aria-describedby')).toBe('event-choice-0-hint');
    expect(choices.children[0].children[0].getAttribute('data-event-choice-card')).toBe('true');
    expect(choices.children[0].children[0].children[0].textContent).toBe('<检查封签>');
    expect(choices.children[0].children[0].children[1].textContent).toBe('可能触发后续调查');
    expect(meta.getAttribute('role')).toBe('list');
    expect(meta.children[0].getAttribute('role')).toBe('listitem');
    expect(choices.children[0].children[0].focused).toBe(true);

    choices.children[0].children[0].dispatch('keydown', { key: 'End', preventDefault: function () {} });
    expect(choices.children[1].children[0].focused).toBe(true);

    choices.children[0].children[0].dispatch('click');
    choices.children[0].children[0].dispatch('click');

    expect(selected).toBe(0);
    expect(selectionCount).toBe(1);
    expect(choices.getAttribute('aria-busy')).toBe('true');
    expect(choices.children[0].children[0].disabled).toBe(true);
    expect(choices.children[1].children[0].disabled).toBe(true);
    expect(modal.dataset.eventState).toBe('resolving');
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(modal.dataset.surfaceDismissBound).toBeUndefined();
  });

  it('剧情弹窗会同步进度语义并进入分支选择状态', async function () {
    var modal = createFakeElement('dialogue-modal', ['modal', 'hidden']);
    modal.modalBox = createFakeElement('dialogue-modal-box');
    var nextBtn = createFakeElement('dialogue-next-btn');
    var skipBtn = createFakeElement('dialogue-skip-btn');
    var sceneLabel = createFakeElement('dialogue-scene-label');
    var sceneTitle = createFakeElement('dialogue-scene-title');
    var speakerIcon = createFakeElement('dialogue-speaker-icon');
    var speakerName = createFakeElement('dialogue-speaker-name');
    var content = createFakeElement('dialogue-text');
    var footer = createFakeElement('dialogue-footer', ['hidden']);
    var progress = createFakeElement('dialogue-progress');
    var summary = createFakeElement('dialogue-summary');
    var branchPanel = createFakeElement('dialogue-branch-panel');
    var choiceBox = createFakeElement('dialogue-choices', ['hidden']);

    var elements = {
      'dialogue-modal': modal,
      'dialogue-next-btn': nextBtn,
      'dialogue-skip-btn': skipBtn,
      'dialogue-scene-label': sceneLabel,
      'dialogue-scene-title': sceneTitle,
      'dialogue-speaker-icon': speakerIcon,
      'dialogue-speaker-name': speakerName,
      'dialogue-text': content,
      'dialogue-footer': footer,
      'dialogue-progress': progress,
      'dialogue-summary': summary,
      'dialogue-branch-panel': branchPanel,
      'dialogue-choices': choiceBox,
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [modal];
        return [];
      },
      addEventListener: function () {},
      createElement: function () { return createFakeElement(); },
    };

    var DialogueUI = await import('../js/ui/DialogueUI.js?v=20260619-flowchoice1');
    DialogueUI.init();
    DialogueUI.showScene({
      label: '剧情演出',
      title: '通讯接入',
      lines: [{ speaker: '导航员', icon: '📡', text: '收到新的回执。' }],
      choices: [
        {
          text: '追问来源',
          hint: '记录为谨慎态度',
          responseLines: [{ speaker: '导航员', text: '来源已经核验。' }],
          responseFooter: '已记录谨慎态度',
        },
        { text: '结束通讯' },
      ],
    });

    expect(modal.dataset.dialogueMode).toBe('line');
    expect(progress.getAttribute('role')).toBe('progressbar');
    expect(progress.getAttribute('aria-valuemax')).toBe('1');
    expect(progress.getAttribute('aria-valuenow')).toBe('1');
    expect(progress.getAttribute('aria-valuetext')).toBe('第 1 / 1 段');
    expect(summary.getAttribute('role')).toBe('list');
    expect(summary.children).toHaveLength(3);
    expect(summary.children[0].getAttribute('role')).toBe('listitem');
    expect(summary.children[0].children[0].textContent).toBe('进度');
    expect(summary.children[0].children[1].textContent).toBe('1 / 1');
    expect(branchPanel.getAttribute('role')).toBe('list');
    expect(branchPanel.getAttribute('aria-label')).toBe('剧情分支状态');
    expect(branchPanel.children).toHaveLength(4);
    expect(branchPanel.children[0].getAttribute('role')).toBe('listitem');
    expect(branchPanel.children[0].children[0].textContent).toBe('段落');
    expect(branchPanel.children[1].children[1].textContent).toBe('线性播放');
    expect(nextBtn.textContent).toBe('选择回应');
    expect(nextBtn.getAttribute('aria-label')).toBe('查看剧情分支选项');
    expect(nextBtn.focused).toBe(true);

    nextBtn.dispatch('click');

    expect(modal.dataset.dialogueMode).toBe('choice');
    expect(summary.children[1].children[1].textContent).toBe('选择分支');
    expect(summary.children[2].children[1].textContent).toBe('2 项');
    expect(branchPanel.children[1].children[1].textContent).toBe('等待选择');
    expect(branchPanel.children[2].children[1].textContent).toBe('2 个分支');
    expect(choiceBox.getAttribute('role')).toBe('list');
    expect(choiceBox.getAttribute('aria-hidden')).toBe('false');
    expect(choiceBox.classList.contains('hidden')).toBe(false);
    expect(choiceBox.children).toHaveLength(2);
    expect(choiceBox.children[0].getAttribute('role')).toBe('listitem');
    expect(choiceBox.children[0].children[0].type).toBe('button');
    expect(choiceBox.children[0].children[0].dataset.dialogueChoiceIndex).toBe('0');
    expect(choiceBox.children[0].children[0].getAttribute('aria-labelledby')).toBe('dialogue-choice-0-label');
    expect(choiceBox.children[0].children[0].getAttribute('aria-describedby')).toBe('dialogue-choice-0-hint');
    expect(choiceBox.children[0].children[0].getAttribute('data-dialogue-choice-card')).toBe('true');
    expect(choiceBox.children[0].children[0].focused).toBe(true);
    expect(modal.modalBox.dataset.dialogueMode).toBe('choice');

    choiceBox.children[0].children[0].dispatch('keydown', { key: 'ArrowDown', preventDefault: function () {} });
    expect(choiceBox.children[1].children[0].focused).toBe(true);
    expect(nextBtn.classList.contains('hidden')).toBe(true);
    expect(nextBtn.disabled).toBe(true);
    expect(nextBtn.getAttribute('aria-hidden')).toBe('true');

    var firstChoiceButton = choiceBox.children[0].children[0];
    nextBtn.focused = false;
    firstChoiceButton.dispatch('click');
    firstChoiceButton.dispatch('click');

    expect(firstChoiceButton.disabled).toBe(true);
    expect(modal.dataset.dialogueMode).toBe('line');
    expect(modal.modalBox.dataset.dialogueMode).toBe('line');
    expect(branchPanel.children[1].children[1].textContent).toBe('回应播放');
    expect(branchPanel.children[3].children[1].textContent).toBe('追问来源');
    expect(choiceBox.classList.contains('hidden')).toBe(true);
    expect(choiceBox.getAttribute('aria-hidden')).toBe('true');
    expect(nextBtn.classList.contains('hidden')).toBe(false);
    expect(nextBtn.disabled).toBe(false);
    expect(nextBtn.focused).toBe(true);
  });

  it('教程提示会输出可访问结构并在窄屏底部目标上翻转定位', async function () {
    var overlay = createFakeElement('tutorial-overlay', ['hidden']);
    var tooltip = createFakeElement('tutorial-tooltip', ['tutorial-tooltip', 'hidden']);
    tooltip.rect = { top: 0, left: 0, right: 300, bottom: 180, width: 300, height: 180 };
    tooltip.offsetWidth = 300;
    tooltip.offsetHeight = 180;
    var nextBtn = createFakeElement('tut-next-btn');
    var skipBtn = createFakeElement('tut-skip-btn');
    var helperActionBtn = createFakeElement('tut-helper-action-btn');
    var target = createFakeElement('target');
    target.rect = { top: 360, left: 80, right: 180, bottom: 408, width: 100, height: 48 };

    var elements = {
      'tutorial-overlay': overlay,
      'tutorial-tooltip': tooltip,
      'tut-next-btn': nextBtn,
      'tut-skip-btn': skipBtn,
      'tut-helper-action-btn': helperActionBtn,
    };

    globalThis.window = { innerWidth: 320, innerHeight: 420 };
    globalThis.document = {
      documentElement: { clientWidth: 320, clientHeight: 420 },
      getElementById: function (id) { return elements[id] || null; },
      querySelector: function (selector) {
        return selector === '#target' ? target : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.tut-highlight') return [target];
        return [];
      },
    };

    var TutorialUI = await import('../js/ui/TutorialUI.js?v=20260604-saveflow1');
    var EventBus = await import('../js/core/EventBus.js');

    var helperActionId = '';
    TutorialUI.init(function () {}, function () {}, function (actionId) {
      helperActionId = actionId;
    });
    EventBus.emit('tutorial:step', {
      step: {
        id: 'test_step',
        phase: 1,
        trigger: 'manual',
        npcIcon: '🛰️',
        npcName: '领航员<script>',
        title: '确认【市场】入口',
        content: '点击【市场】\n不要执行 <script>alert(1)</script>',
        highlight: '#target',
        position: 'bottom',
      },
      index: 0,
      total: 4,
    });

    expect(tooltip.innerHTML).toContain('id="tutorial-tooltip-title"');
    expect(tooltip.innerHTML).toContain('role="progressbar"');
    expect(tooltip.innerHTML).toContain('aria-valuenow="25"');
    expect(tooltip.innerHTML).toContain('aria-valuetext="第 1 / 4 步"');
    expect(tooltip.innerHTML).toContain('type="button"');
    expect(tooltip.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(tooltip.getAttribute('aria-hidden')).toBe('false');
    expect(tooltip.getAttribute('aria-describedby')).toBe('tutorial-tooltip-content');
    expect(tooltip.getAttribute('aria-label')).toBe('第 1 / 4 步：确认【市场】入口');
    expect(tooltip.dataset.step).toBe('1');
    expect(tooltip.dataset.totalSteps).toBe('4');
    expect(tooltip.dataset.trigger).toBe('manual');
    expect(tooltip.focused).toBe(true);
    expect(tooltip.dataset.position).toBe('top');
    expect(tooltip.classList.contains('tut-pos-top')).toBe(true);
    expect(tooltip.style.top).toBe('172px');

    EventBus.emit('tutorial:step', {
      step: {
        id: 'action_step',
        phase: 1,
        trigger: 'click',
        npcIcon: '📡',
        npcName: '领航员',
        title: '执行交易操作',
        content: '完成当前高亮操作',
        highlight: '#target',
        position: 'bottom',
        helperAction: { id: 'recommend_sell_route', label: '推荐一个卖货点' },
      },
      index: 1,
      total: 4,
    });

    expect(tooltip.innerHTML).toContain('id="tutorial-action-hint" role="status"');
    expect(tooltip.innerHTML).not.toContain('id="tut-next-btn"');
    expect(tooltip.getAttribute('aria-describedby')).toBe('tutorial-tooltip-content tutorial-action-hint');
    expect(tooltip.dataset.trigger).toBe('action');
    expect(tooltip.innerHTML).toContain('id="tut-helper-action-btn"');
    expect(tooltip.innerHTML).toContain('推荐一个卖货点');
    helperActionBtn.dataset.tutorialAction = 'recommend_sell_route';
    helperActionBtn.dispatch('click');
    expect(helperActionId).toBe('recommend_sell_route');
  });

  it('事件和剧情弹窗包含影响预览、分支状态与响应式样式锚点', function () {
    var html = readFileSync('index.html', 'utf8');
    var css = readFileSync('css/interstellar-trader.css', 'utf8');

    expect(html).toContain('aria-describedby="event-summary event-desc event-impact"');
    expect(html).toContain('id="event-impact" class="event-impact-panel" role="list" aria-label="事件影响预览"');
    expect(html).toContain('aria-describedby="dialogue-summary dialogue-branch-panel dialogue-text dialogue-footer"');
    expect(html).toContain('id="dialogue-branch-panel" class="dialogue-branch-panel" role="list" aria-label="剧情分支状态"');
    expect(css).toContain('.event-impact-panel');
    expect(css).toContain('.dialogue-branch-panel');
    expect(css).toContain('.event-impact-item');
    expect(css).toContain('.dialogue-branch-item');
    expect(css).toContain('.dialogue-modal-box .dialogue-choices');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
