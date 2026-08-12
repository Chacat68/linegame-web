import { afterEach, describe, expect, it } from 'vitest';
import * as ActionGuideUI from '../js/ui/ActionGuideUI.js';

function createClassList() {
  var classes = new Set();
  return {
    add: function (name) { classes.add(name); },
    remove: function (name) { classes.delete(name); },
    contains: function (name) { return classes.has(name); },
    toggle: function (name, force) {
      var shouldAdd = typeof force === 'boolean' ? force : !classes.has(name);
      if (shouldAdd) classes.add(name);
      else classes.delete(name);
    },
  };
}

function createFakeRoot() {
  var listeners = Object.create(null);
  return {
    hidden: false,
    innerHTML: '',
    dataset: {},
    classList: createClassList(),
    addEventListener: function (type, handler) {
      listeners[type] = handler;
    },
    dispatchClick: function (target) {
      listeners.click({
        target: target,
      });
    },
    dispatchKey: function (key) {
      if (!listeners.keydown) return;
      listeners.keydown({
        key: key,
        preventDefault: function () {},
      });
    },
  };
}

function createTarget(selectorMatch) {
  return {
    closest: function (selector) {
      return selector === selectorMatch ? this : null;
    },
  };
}

var originalDocument = globalThis.document;

afterEach(function () {
  globalThis.document = originalDocument;
});

describe('ActionGuideUI', function () {
  it('会渲染当前行动并把点击回传给调用方', function () {
    var root = createFakeRoot();
    var clicked = null;
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    var suggestion = {
      id: 'accept-first-trade',
      title: '接取「初次交易」',
      reason: '完成第一笔买卖。',
      purpose: '建立第一个交易闭环。',
      outcome: '成交后会结算新手任务。',
      actionLabel: '接取任务',
      actionType: 'quest.accept',
      surface: 'quest',
    };

    ActionGuideUI.init(function (next) {
      clicked = next;
    });
    ActionGuideUI.render(suggestion);

    expect(root.hidden).toBe(false);
    expect(root.dataset.guideId).toBe('accept-first-trade');
    expect(root.innerHTML).toContain('当前行动');
    expect(root.innerHTML).toContain('目的</b>建立第一个交易闭环');
    expect(root.innerHTML).toContain('完成后</b>成交后会结算新手任务');
    expect(root.innerHTML).toContain('接取任务');
    expect(root.innerHTML).toContain('data-command-surface="quest"');
    expect(root.innerHTML).toContain('data-command-intent="任务接取"');

    root.dispatchClick(createTarget('[data-action-guide-action]'));
    expect(clicked).toBe(suggestion);
  });

  it('会渲染进阶行动语义', function () {
    var root = createFakeRoot();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    ActionGuideUI.init(function () {});
    ActionGuideUI.render({
      id: 'prefill-research-supply-dispatch',
      title: '规划科研自动补给',
      reason: '当前研究已有可执行补给路线。',
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      surface: 'fleet',
      guidanceTopic: {
        id: 'research-supply',
        label: '科研补给',
        stepLabel: '自动补给',
      },
    });

    expect(root.innerHTML).toContain('data-guide-topic="research-supply"');
    expect(root.innerHTML).toContain('当前行动 · 自动补给');
    expect(root.innerHTML).not.toContain('科研补给 / 自动补给');
  });

  it('活跃专题同时展示专题名和当前步骤', function () {
    var root = createFakeRoot();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    ActionGuideUI.init(function () {});
    ActionGuideUI.render({
      id: 'prefill-profitable-dispatch',
      title: '规划自动跑商',
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      guidanceTopic: {
        id: 'dispatch-ops',
        label: '自动跑商',
        chainLabel: '自动跑商入门',
        stepLabel: '预填商运',
      },
    });

    expect(root.innerHTML).toContain('当前行动 · 自动跑商入门 · 预填商运');
  });

  it('固定显示完整行动条，不渲染展开或缩小控件', function () {
    var root = createFakeRoot();
    root.classList.add('is-collapsed');
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    ActionGuideUI.init(function () {});
    ActionGuideUI.render({
      id: 'open-market',
      title: '打开当前市场',
      reason: '先买入一批商品。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      surface: 'market',
    });

    expect(root.classList.contains('is-collapsed')).toBe(false);
    expect(root.innerHTML).not.toContain('data-action-guide-toggle');
    expect(root.innerHTML).not.toContain('action-guide-toggle');
    expect(root.innerHTML).not.toContain('action-guide-mini');
    expect(root.innerHTML).toContain('打开当前市场');
  });

  it('按 Esc 不会收起当前行动', function () {
    var root = createFakeRoot();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    ActionGuideUI.init(function () {});
    ActionGuideUI.render({
      id: 'explore-current-poi',
      title: '调查补给点',
      reason: '调查结论会写入探索报告。',
      actionLabel: '调查 探索点',
      actionType: 'exploration.poi',
      surface: 'exploration',
    });

    root.dispatchKey('Escape');

    expect(root.classList.contains('is-collapsed')).toBe(false);
    expect(root.innerHTML).toContain('调查补给点');
    expect(root.innerHTML).not.toContain('action-guide-mini');
  });

  it('隐藏当前行动时会清理 processing 状态', function () {
    var root = createFakeRoot();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    var suggestion = {
      id: 'explore-current-poi',
      title: '调查补给点',
      reason: '调查结论会写入探索报告。',
      actionLabel: '调查 探索点',
      actionType: 'exploration.poi',
      surface: 'exploration',
    };

    ActionGuideUI.init(function () {});
    ActionGuideUI.showProcessing(suggestion, '已执行，正在生成下一条建议');
    expect(root.classList.contains('is-processing')).toBe(true);

    ActionGuideUI.render(null);

    expect(root.hidden).toBe(true);
    expect(root.classList.contains('is-processing')).toBe(false);
  });

  it('可以短暂显示行动完成态并保留下一条建议', function () {
    var root = createFakeRoot();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'action-guide' ? root : null;
      },
    };

    ActionGuideUI.init(function () {});
    ActionGuideUI.render({
      id: 'prefill-profitable-dispatch',
      title: '规划「食品」跑商路线',
      reason: '安装完成后可以继续配置路线。',
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      surface: 'fleet',
    });

    ActionGuideUI.showCompletion('已安装「深空测绘阵列」', '下一条跑商或经营建议已刷新', { durationMs: 0 });

    expect(root.hidden).toBe(false);
    expect(root.classList.contains('is-complete')).toBe(true);
    expect(root.innerHTML).toContain('行动完成');
    expect(root.innerHTML).toContain('已安装「深空测绘阵列」');
    expect(root.innerHTML).toContain('下一条跑商或经营建议已刷新');

    ActionGuideUI.render(null);
    expect(root.classList.contains('is-complete')).toBe(false);
  });
});
