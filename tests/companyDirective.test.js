import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestState } from './helpers.js';
import {
  claimAllCompanyDirectiveRewards,
  claimCompanyDirectiveReward,
  getCompanyDirectiveActionSuggestion,
  getCompanyDirectiveBoard,
  getDirectiveSuggestion,
} from '../js/systems/company/CompanyDirectiveSystem.js';
import * as Guidance from '../js/systems/guidance/GuidanceSystem.js';

function createFakeClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
  };
}

function createFakeElement(initialClasses) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  var html = '';
  return {
    dataset: {},
    disabled: false,
    classList: createFakeClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, preventDefault: function () {} });
      }, this);
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = String(value);
    },
  };
}

describe('CompanyDirectiveSystem', function () {
  it('生成贸易、情报和商网三类公司指令', function () {
    var state = createTestState({
      companyLevel: 4,
      tradeCount: 8,
      totalProfit: 2400,
      visitedSystems: ['sol_prime', 'luna_base', 'mars_colony'],
      credits: 12000,
      galaxyStates: {
        sol_prime: {
          exploration: {
            reports: [{ id: 'scan' }, { id: 'poi' }],
            pois: [{ resolved: true }, { resolved: true }],
          },
        },
      },
      tradeStations: {
        sol_prime: { systemId: 'sol_prime', level: 1 },
      },
    });

    var board = getCompanyDirectiveBoard(state);
    var directiveIds = board.directives.map(function (directive) { return directive.id; });
    var survey = board.directives.find(function (directive) { return directive.id === 'survey'; });
    var network = board.directives.find(function (directive) { return directive.id === 'network'; });

    expect(directiveIds).toEqual(['cashflow', 'survey', 'network']);
    expect(board.companyLevel).toBe(4);
    expect(survey.requirements.find(function (req) { return req.id === 'survey-reports'; }).current).toBe(2);
    expect(survey.completedSurveyCount).toBe(1);
    expect(network.nextAction.payload).toMatchObject({
      workspaceId: 'operations',
      subworkspaceId: 'stations',
    });
  });

  it('追踪指令会转换成行动条建议', function () {
    var state = createTestState({
      companyLevel: 4,
      credits: 12000,
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      tradeStations: {},
      visitedSystems: ['sol_prime'],
    });

    var suggestion = getDirectiveSuggestion(state, 'network');
    var current = Guidance.getCurrentSuggestion(state, {
      directiveSuggestion: suggestion,
      tutorialActive: false,
      blockingModalOpen: false,
    });

    expect(suggestion).toMatchObject({
      id: 'company-directive-network',
      actionType: 'market.open',
      surface: 'market',
    });
    expect(current.id).toBe('company-directive-network');
    expect(current.title).toContain('商网扩张');
  });

  it('可领取奖励会优先转换成行动条领取建议', function () {
    var state = createTestState({
      companyLevel: 1,
      tradeCount: 8,
      totalProfit: 3500,
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
    });

    var suggestion = getCompanyDirectiveActionSuggestion(state, 'network');
    var current = Guidance.getCurrentSuggestion(state, {
      directiveSuggestion: suggestion,
      tutorialActive: false,
      blockingModalOpen: false,
    });

    expect(suggestion).toMatchObject({
      id: 'company-directive-claim-rewards',
      priority: 94,
      actionType: 'company.directive.claimAll',
      actionLabel: '领取奖励',
      surface: 'company',
    });
    expect(current.id).toBe('company-directive-claim-rewards');
    expect(current.title).toContain('领取');
  });

  it('完成指令后可以领取奖励且不能重复领取', function () {
    var state = createTestState({
      companyLevel: 1,
      companyExperience: 0,
      credits: 1000,
      reputation: 0,
      tradeCount: 8,
      totalProfit: 3500,
    });

    var beforeBoard = getCompanyDirectiveBoard(state);
    var cashflow = beforeBoard.directives.find(function (directive) { return directive.id === 'cashflow'; });
    expect(cashflow.completed).toBe(true);
    expect(cashflow.claimable).toBe(true);

    var result = claimCompanyDirectiveReward(state, 'cashflow');
    expect(result.ok).toBe(true);
    expect(state.credits).toBe(1650);
    expect(state.reputation).toBe(3);
    expect(state.companyExperience).toBe(80);
    expect(state.companyDirectiveClaims['cashflow:L1']).toMatchObject({
      directiveId: 'cashflow',
      title: '现金流校准',
      code: 'CF-01',
      claimedIndex: 1,
      rewardLabel: '650 cr · 公司经验 +80 · 声望 +3',
    });
    expect(result.rewardLabel).toContain('公司经验 +80');
    expect(result.recentClaim).toMatchObject({
      directiveId: 'cashflow',
      title: '现金流校准',
      code: 'CF-01',
    });
    expect(result.nextDirective.label).toContain('下一轮目标');

    var afterBoard = getCompanyDirectiveBoard(state);
    expect(afterBoard.recentClaim.title).toBe('现金流校准');
    expect(afterBoard.claimedRewardCount).toBe(1);
    expect(afterBoard.rewardLoopLabel).toContain('最近结算');

    var duplicate = claimCompanyDirectiveReward(state, 'cashflow');
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toBe('already-claimed');
  });

  it('可以按当前指令快照批量领取所有已完成奖励', function () {
    var state = createTestState({
      companyLevel: 1,
      companyExperience: 0,
      credits: 1000,
      reputation: 0,
      tradeCount: 8,
      totalProfit: 3500,
      visitedSystems: ['sol_prime', 'luna_base', 'mars_colony', 'terra_hub'],
      galaxyStates: {
        sol_prime: {
          exploration: {
            reports: [{ id: 'scan' }, { id: 'poi' }],
            pois: [{ resolved: true }],
          },
        },
      },
    });

    var result = claimAllCompanyDirectiveRewards(state);

    expect(result.ok).toBe(true);
    expect(result.claimedCount).toBe(2);
    expect(state.credits).toBe(2050);
    expect(state.reputation).toBe(9);
    expect(state.companyExperience).toBe(150);
    expect(state.companyDirectiveClaims['cashflow:L1']).toBeTruthy();
    expect(state.companyDirectiveClaims['survey:L1']).toBeTruthy();
    expect(result.msgs[0].text).toContain('批量结算：2 项');
    expect(result.rewardLabel).toContain('公司经验 +150');
    expect(result.recentClaim).toMatchObject({
      directiveId: 'survey',
      title: '情报归档',
    });
    expect(result.rewardLoopLabel).toContain('最近结算');
  });
});

describe('CompanyDirectiveUI', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
    localStorage.clear();
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    localStorage.clear();
    vi.resetModules();
  });

  it('渲染指令面板并标记正在追踪的指令', async function () {
    vi.resetModules();
    localStorage.setItem('linegame_company_directive_focus', 'survey');

    var elements = {
      'company-directives-btn': createFakeElement(),
      'company-directives-body': createFakeElement(),
      'company-directives-modal': createFakeElement(['hidden', 'modal']),
      'company-directives-modal-close': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['company-directives-modal']] : [];
      },
      addEventListener: function () {},
    };

    var CompanyDirectiveUI = await import('../js/ui/CompanyDirectiveUI.js');
    var state = createTestState({
      companyLevel: 3,
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
    });

    CompanyDirectiveUI.render(state);

    expect(elements['company-directives-body'].innerHTML).toContain('现金流校准');
    expect(elements['company-directives-body'].innerHTML).toContain('情报归档');
    expect(elements['company-directives-body'].innerHTML).toContain('追踪中');
    expect(elements['company-directives-body'].innerHTML).toContain('role="group"');
    expect(elements['company-directives-body'].innerHTML).toContain('role="progressbar"');
    expect(elements['company-directives-body'].innerHTML).toContain('aria-pressed="true"');
    expect(elements['company-directives-body'].innerHTML).toContain('company-directives-toolbar');
    expect(elements['company-directives-body'].innerHTML).toContain('role="toolbar"');
    expect(elements['company-directives-body'].innerHTML).toContain('aria-controls="company-directive-grid"');
    expect(elements['company-directives-body'].innerHTML).toContain('data-company-directive-filter="all" aria-pressed="true" aria-controls="company-directive-grid" tabindex="0"');
    expect(elements['company-directives-body'].innerHTML).toContain('data-company-directive-filter="tracked"');
    expect(elements['company-directives-body'].innerHTML).toContain('显示全部指令');
    expect(elements['company-directives-btn'].classList.contains('is-tracking')).toBe(true);
    expect(elements['company-directives-btn'].getAttribute('aria-label')).toContain('情报归档');
    expect(elements['company-directives-btn'].getAttribute('aria-label')).toContain('进度');
  });

  it('完成未领取的指令会显示领取奖励入口', async function () {
    vi.resetModules();

    var elements = {
      'company-directives-btn': createFakeElement(),
      'company-directives-body': createFakeElement(),
      'company-directives-modal': createFakeElement(['hidden', 'modal']),
      'company-directives-modal-close': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['company-directives-modal']] : [];
      },
      addEventListener: function () {},
    };

    var CompanyDirectiveUI = await import('../js/ui/CompanyDirectiveUI.js');
    var state = createTestState({
      companyLevel: 1,
      tradeCount: 8,
      totalProfit: 3500,
    });

    CompanyDirectiveUI.render(state);

    expect(elements['company-directives-body'].innerHTML).toContain('可领取');
    expect(elements['company-directives-body'].innerHTML).toContain('领取奖励');
    expect(elements['company-directives-body'].innerHTML).toContain('公司经验 +80');
    expect(elements['company-directives-btn'].classList.contains('has-claimable')).toBe(true);
    expect(elements['company-directives-btn'].dataset.companyDirectiveBadge).toBe('1');
    expect(elements['company-directives-btn'].getAttribute('aria-label')).toContain('1 项奖励可领取');
  });

  it('多项奖励可领取时会显示全部领取入口', async function () {
    vi.resetModules();

    var elements = {
      'company-directives-btn': createFakeElement(),
      'company-directives-body': createFakeElement(),
      'company-directives-modal': createFakeElement(['hidden', 'modal']),
      'company-directives-modal-close': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['company-directives-modal']] : [];
      },
      addEventListener: function () {},
    };

    var CompanyDirectiveUI = await import('../js/ui/CompanyDirectiveUI.js');
    var state = createTestState({
      companyLevel: 1,
      tradeCount: 8,
      totalProfit: 3500,
      visitedSystems: ['sol_prime', 'luna_base', 'mars_colony', 'terra_hub'],
      galaxyStates: {
        sol_prime: {
          exploration: {
            reports: [{ id: 'scan' }, { id: 'poi' }],
            pois: [{ resolved: true }],
          },
        },
      },
    });

    CompanyDirectiveUI.render(state);

    expect(elements['company-directives-body'].innerHTML).toContain('全部领取');
    expect(elements['company-directives-btn'].dataset.companyDirectiveBadge).toBe('2');
  });

  it('指令筛选条会切换当前列表视图', async function () {
    vi.resetModules();

    var elements = {
      'company-directives-btn': createFakeElement(),
      'company-directives-body': createFakeElement(),
      'company-directives-modal': createFakeElement(['hidden', 'modal']),
      'company-directives-modal-close': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['company-directives-modal']] : [];
      },
      addEventListener: function () {},
    };

    var CompanyDirectiveUI = await import('../js/ui/CompanyDirectiveUI.js');
    CompanyDirectiveUI._resetForTest();
    CompanyDirectiveUI.init({});

    var state = createTestState({
      companyLevel: 1,
      tradeCount: 8,
      totalProfit: 3500,
    });

    CompanyDirectiveUI.render(state);
    expect(elements['company-directives-body'].innerHTML).toContain('data-company-directives-filter="all"');
    expect(elements['company-directives-body'].innerHTML).toContain('现金流校准');
    expect(elements['company-directives-body'].innerHTML).toContain('情报归档');

    elements['company-directives-body'].dispatchEvent('click', {
      target: {
        closest: function (selector) {
          if (selector === '[data-company-directive-filter]') {
            return {
              dataset: { companyDirectiveFilter: 'claimable' },
            };
          }
          return null;
        },
      },
    });

    expect(elements['company-directives-body'].innerHTML).toContain('data-company-directives-filter="claimable"');
    expect(elements['company-directives-body'].innerHTML).toContain('显示可领取指令：1 项');
    expect(elements['company-directives-body'].innerHTML).toContain('现金流校准');
    expect(elements['company-directives-body'].innerHTML).not.toContain('情报归档');
  });

  it('指令筛选条支持循环方向键导航并恢复焦点', async function () {
    vi.resetModules();

    var focusedFilter = '';
    var filterButtons = ['all', 'tracked', 'claimable', 'active'].reduce(function (result, filter) {
      result[filter] = {
        dataset: { companyDirectiveFilter: filter },
        focus: function () { focusedFilter = filter; },
      };
      return result;
    }, {});
    var elements = {
      'company-directives-btn': createFakeElement(),
      'company-directives-body': createFakeElement(),
      'company-directives-modal': createFakeElement(['hidden', 'modal']),
      'company-directives-modal-close': createFakeElement(),
    };
    elements['company-directives-body'].querySelector = function (selector) {
      var match = selector.match(/data-company-directive-filter="([^"]+)"/);
      return match ? filterButtons[match[1]] : null;
    };
    elements['company-directives-modal'].querySelector = function (selector) {
      if (selector === '[data-company-directive-filter][aria-pressed="true"]') {
        return filterButtons.all;
      }
      return null;
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['company-directives-modal']] : [];
      },
      addEventListener: function () {},
    };

    var CompanyDirectiveUI = await import('../js/ui/CompanyDirectiveUI.js');
    CompanyDirectiveUI._resetForTest();
    CompanyDirectiveUI.init({});
    CompanyDirectiveUI.render(createTestState({ companyLevel: 1, tradeCount: 8, totalProfit: 3500 }));

    elements['company-directives-btn'].dispatchEvent('click');
    expect(focusedFilter).toBe('all');
    focusedFilter = '';

    var prevented = false;
    elements['company-directives-body'].dispatchEvent('keydown', {
      key: 'ArrowLeft',
      preventDefault: function () { prevented = true; },
      target: {
        closest: function (selector) {
          return selector === '[data-company-directive-filter]' ? filterButtons.all : null;
        },
      },
    });

    expect(prevented).toBe(true);
    expect(focusedFilter).toBe('active');
    expect(elements['company-directives-body'].innerHTML).toContain('data-company-directives-filter="active"');
    expect(elements['company-directives-body'].innerHTML).toContain('data-company-directive-filter="active" aria-pressed="true" aria-controls="company-directive-grid" tabindex="0"');
  });

  it('渲染最近结算和后续行动摘要', async function () {
    vi.resetModules();

    var elements = {
      'company-directives-btn': createFakeElement(),
      'company-directives-body': createFakeElement(),
      'company-directives-modal': createFakeElement(['hidden', 'modal']),
      'company-directives-modal-close': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['company-directives-modal']] : [];
      },
      addEventListener: function () {},
    };

    var CompanyDirectiveUI = await import('../js/ui/CompanyDirectiveUI.js');
    var state = createTestState({
      companyLevel: 1,
      companyDirectiveClaims: {
        'cashflow:L1': {
          directiveId: 'cashflow',
          title: '现金流校准',
          code: 'CF-01',
          claimedDay: 5,
          claimedIndex: 1,
          reward: { credits: 650, companyExperience: 80, reputation: 3 },
        },
      },
    });

    CompanyDirectiveUI.render(state);

    expect(elements['company-directives-body'].innerHTML).toContain('最近结算');
    expect(elements['company-directives-body'].innerHTML).toContain('CF-01 · 现金流校准');
    expect(elements['company-directives-body'].innerHTML).toContain('第 5 天');
    expect(elements['company-directives-body'].innerHTML).toContain('后续行动');
    expect(elements['company-directives-body'].innerHTML).toContain('下一轮目标');
  });
});
