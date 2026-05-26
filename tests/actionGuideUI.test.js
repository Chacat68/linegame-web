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
  ActionGuideUI.setCollapsed(false);
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
    expect(root.innerHTML).toContain('接取任务');
    expect(root.innerHTML).toContain('data-command-surface="quest"');
    expect(root.innerHTML).toContain('data-command-intent="任务接取"');

    root.dispatchClick(createTarget('[data-action-guide-action]'));
    expect(clicked).toBe(suggestion);
  });

  it('可以折叠成迷你指挥条', function () {
    var root = createFakeRoot();
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

    root.dispatchClick(createTarget('[data-action-guide-toggle]'));

    expect(ActionGuideUI.isCollapsed()).toBe(true);
    expect(root.classList.contains('is-collapsed')).toBe(true);
    expect(root.innerHTML).toContain('action-guide-mini');
    expect(root.innerHTML).toContain('打开当前市场');
  });

  it('出现新的当前行动时会自动展开', function () {
    var root = createFakeRoot();
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
    root.dispatchClick(createTarget('[data-action-guide-toggle]'));
    expect(ActionGuideUI.isCollapsed()).toBe(true);

    ActionGuideUI.render({
      id: 'confirm-buy-food',
      title: '确认买入食物',
      reason: '这笔交易能推进当前路线。',
      actionLabel: '确认买入',
      actionType: 'trade.buy',
      surface: 'market',
    });

    expect(ActionGuideUI.isCollapsed()).toBe(false);
    expect(root.classList.contains('is-collapsed')).toBe(false);
    expect(root.innerHTML).toContain('确认买入食物');
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
      id: 'scan-current-system',
      title: '扫描当前星球',
      reason: '扫描会揭示本地资源。',
      actionLabel: '执行扫描',
      actionType: 'exploration.scan',
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
      title: '规划「食品」派遣',
      reason: '安装完成后可以继续配置路线。',
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      surface: 'fleet',
    });

    ActionGuideUI.showCompletion('已安装「深空测绘阵列」', '下一条派遣或经营建议已刷新', { durationMs: 0 });

    expect(root.hidden).toBe(false);
    expect(root.classList.contains('is-complete')).toBe(true);
    expect(root.innerHTML).toContain('行动完成');
    expect(root.innerHTML).toContain('已安装「深空测绘阵列」');
    expect(root.innerHTML).toContain('下一条派遣或经营建议已刷新');

    ActionGuideUI.render(null);
    expect(root.classList.contains('is-complete')).toBe(false);
  });
});
