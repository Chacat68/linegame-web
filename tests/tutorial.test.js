import { beforeEach, describe, expect, it } from 'vitest';
import * as Tutorial from '../js/systems/tutorial/TutorialSystem.js';
import { createTestState } from './helpers.js';

if (typeof globalThis.localStorage === 'undefined') {
  let storage = {};
  globalThis.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setItem(key, value) {
      storage[key] = String(value);
    },
    removeItem(key) {
      delete storage[key];
    },
    clear() {
      storage = {};
    },
  };
}

function advanceToStep(stepId) {
  while (Tutorial.getStep() && Tutorial.getStep().id !== stepId) {
    const step = Tutorial.getStep();

    if (step.trigger === 'manual') {
      Tutorial.advance();
      continue;
    }

    if (step.trigger === 'action:buy') {
      Tutorial.checkTrigger('buy');
      continue;
    }

    if (step.trigger === 'action:travel') {
      Tutorial.checkTrigger('travel');
      continue;
    }

    if (step.trigger === 'action:sell') {
      Tutorial.checkTrigger('sell');
      continue;
    }

    throw new Error('Unexpected tutorial trigger: ' + step.trigger);
  }
}

describe('TutorialSystem', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    Tutorial.reset();
  });

  it('卖出后进入燃料安全和行动条交接步骤', () => {
    const state = createTestState();

    Tutorial.init(state);
    Tutorial.start();
    advanceToStep('buy_goods');

    expect(Tutorial.getStep().id).toBe('buy_goods');
    Tutorial.checkTrigger('buy');
    expect(Tutorial.getStep().id).toBe('travel_hint');
    Tutorial.checkTrigger('travel');
    expect(Tutorial.getStep().id).toBe('sell_goods');
    Tutorial.checkTrigger('sell');
    expect(Tutorial.getStep().id).toBe('fuel_safety');
    Tutorial.advance();
    expect(Tutorial.getStep().id).toBe('action_guide_handoff');
    Tutorial.advance();
    expect(Tutorial.getStep().id).toBe('tutorial_complete');
  });

  it('遮罩教程不再强制接取和完成任务', () => {
    const ids = Tutorial.STEPS.map(function (step) { return step.id; });

    expect(ids).not.toContain('show_quest_board');
    expect(ids).not.toContain('accept_first_quest');
    expect(ids).not.toContain('complete_first_quest');
    expect(ids).not.toContain('quest_tracker');
    expect(ids).toEqual([
      'welcome',
      'show_stats',
      'show_ship',
      'explain_market',
      'buy_goods',
      'travel_hint',
      'sell_goods',
      'fuel_safety',
      'action_guide_handoff',
      'tutorial_complete',
    ]);
    expect(ids.indexOf('fuel_safety')).toBeGreaterThan(ids.indexOf('sell_goods'));
    expect(ids.indexOf('action_guide_handoff')).toBeLessThan(ids.indexOf('tutorial_complete'));
  });

  it('教程高亮入口使用当前界面的稳定选择器', () => {
    const staleSelectors = ['#market-view-btn', '#market-tbody', '#fuel-fill', '#map-canvas'];
    const highlights = Tutorial.STEPS.map(function (step) {
      return step.highlight;
    }).filter(Boolean);

    staleSelectors.forEach(function (selector) {
      expect(highlights).not.toContain(selector);
    });
    expect(highlights).toContain('.bottom-nav-btn[data-view="market"]');
    expect(highlights).toContain('#status-fuel-fill');
    expect(highlights).toContain('#map-3d-canvas');
  });

  it('选线步骤提供可核对收益的路线推荐入口', () => {
    const buyStep = Tutorial.STEPS.find(function (entry) {
      return entry.id === 'buy_goods';
    });
    const step = Tutorial.STEPS.find(function (entry) {
      return entry.id === 'travel_hint';
    });

    expect(buyStep.helperAction).toEqual({
      id: 'recommend_first_trade',
      label: '推荐首单商品',
    });
    expect(step.helperAction).toEqual({
      id: 'recommend_sell_route',
      label: '推荐一个卖货点',
    });
  });

  it('教程补贴与贸易结算分开披露', () => {
    const sellStep = Tutorial.STEPS.find(function (entry) { return entry.id === 'sell_goods'; });
    const completeStep = Tutorial.STEPS.find(function (entry) { return entry.id === 'tutorial_complete'; });

    expect(sellStep.reward).toBeNull();
    expect(completeStep.reward.credits).toBe(100);
    expect(completeStep.content).toContain('100 信用积分启动补贴');
    expect(completeStep.content).toContain('贸易利润仍以卖出结算为准');
  });
});
