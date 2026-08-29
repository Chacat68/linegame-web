import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestState } from './helpers.js';
import { readApplicationComposition } from './runtimeCompositionSource.js';
import { createGameShellProjection } from '../js/ui/GameShellProjection.js';

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
    value: '',
    max: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    onclick: null,
    dataset: {},
    style: {},
    classList: createClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatch: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: element, preventDefault: function () {} });
      });
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
    removeAttribute: function (name) {
      delete attributes[name];
    },
    querySelector: function (selector) {
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return element.modalBox || null;
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    focus: function () { this.focusCount = (this.focusCount || 0) + 1; },
  };
  return element;
}

describe('Settlement surface UI', function () {
  var originalDocument;

  beforeEach(function () {
    vi.resetModules();
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('交易确认弹窗会渲染结算指标和可访问成交状态', async function () {
    var modal = createFakeElement('trade-modal', ['modal', 'hidden']);
    modal.modalBox = createFakeElement('trade-modal-box');
    var elements = {
      'trade-modal': modal,
      'modal-decrease': createFakeElement('modal-decrease'),
      'modal-increase': createFakeElement('modal-increase'),
      'modal-all': createFakeElement('modal-all'),
      'modal-amount': createFakeElement('modal-amount'),
      'modal-cancel': createFakeElement('modal-cancel'),
      'modal-confirm': createFakeElement('modal-confirm'),
      'modal-title': createFakeElement('modal-title'),
      'modal-desc': createFakeElement('modal-desc'),
      'modal-kicker': createFakeElement('modal-kicker'),
      'modal-unit-price': createFakeElement('modal-unit-price'),
      'modal-max-qty': createFakeElement('modal-max-qty'),
      'modal-market-type': createFakeElement('modal-market-type'),
      'trade-impact-summary': createFakeElement('trade-impact-summary'),
      'modal-cargo-before': createFakeElement('modal-cargo-before'),
      'modal-cargo-after': createFakeElement('modal-cargo-after'),
      'modal-credit-delta': createFakeElement('modal-credit-delta'),
      'modal-total': createFakeElement('modal-total'),
    };
    modal.querySelector = function (selector) {
      if (selector === '#modal-amount') return elements['modal-amount'];
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return modal.modalBox;
      return null;
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [modal];
        return [];
      },
      addEventListener: function () {},
    };

    var Modal = await import('../js/ui/Modal.js?v=20260605-tradeimpact1');
    Modal.init(function () {});
    Modal.openTradeModal('buy', {
      id: 'food',
      emoji: '🌾',
      name: '食物',
    }, createTestState({
      credits: 5000,
      maxCargo: 20,
      cargo: {},
      currentSystem: 'sol_prime',
    }), 'open', {
      initialQuantity: 3,
    });

    expect(modal.dataset.tradeAction).toBe('buy');
    expect(modal.dataset.marketType).toBe('open');
    expect(elements['modal-kicker'].textContent).toBe('公开市场');
    expect(elements['modal-unit-price'].textContent).toContain('积分');
    expect(elements['modal-max-qty'].textContent).toBe('20 单位');
    expect(elements['modal-market-type'].textContent).toBe('公开');
    expect(elements['modal-confirm'].textContent).toBe('确认购买');
    expect(elements['modal-confirm'].getAttribute('aria-label')).toBe('确认购买食物');
    expect(elements['modal-all'].textContent).toBe('全部买入');
    expect(elements['modal-amount'].getAttribute('aria-label')).toBe('购买食物的数量');
    expect(elements['modal-cargo-before'].textContent).toBe('0 / 20');
    expect(elements['modal-cargo-after'].textContent).toBe('3 / 20');
    expect(elements['modal-credit-delta'].textContent).toContain('-');
    expect(elements['modal-credit-delta'].textContent).toContain('积分');
    expect(elements['trade-impact-summary'].dataset.tradeValid).toBe('true');
    expect(elements['modal-total'].textContent).toContain('总计:');
    expect(elements['modal-confirm'].disabled).toBe(false);
    expect(elements['modal-amount'].focusCount).toBe(1);

    elements['modal-amount'].value = '0';
    elements['modal-amount'].dispatch('input');

    expect(elements['modal-total'].textContent).toBe('交易数量至少为 1');
    expect(elements['modal-total'].dataset.tradeState).toBe('blocked');
    expect(elements['modal-cargo-after'].textContent).toBe('不可成交');
    expect(elements['modal-credit-delta'].textContent).toBe('不可成交');
    expect(elements['trade-impact-summary'].dataset.tradeValid).toBe('false');
    expect(elements['modal-confirm'].disabled).toBe(true);
    expect(elements['modal-confirm'].getAttribute('aria-disabled')).toBe('true');
    expect(elements['modal-amount'].getAttribute('aria-invalid')).toBe('true');

    elements['modal-amount'].value = '';
    elements['modal-increase'].dispatch('click');
    expect(elements['modal-amount'].value).toBe(1);
    expect(elements['modal-total'].dataset.tradeState).toBe('ready');

    elements['modal-amount'].value = '';
    elements['modal-decrease'].dispatch('click');
    expect(elements['modal-amount'].value).toBe(1);

    elements['modal-amount'].value = '21';
    elements['modal-amount'].dispatch('input');
    expect(elements['modal-total'].textContent).toBe('交易数量超过当前上限 20');
    expect(elements['modal-amount'].getAttribute('aria-valuetext')).toContain('超过当前上限');

    Modal.openTradeModal('sell', {
      id: 'food',
      emoji: '🌾',
      name: '食物',
    }, createTestState({
      credits: 5000,
      maxCargo: 20,
      cargo: {},
      currentSystem: 'sol_prime',
    }), 'open');

    expect(elements['modal-confirm'].textContent).toBe('确认出售');
    expect(elements['modal-all'].textContent).toBe('全部卖出');
    expect(elements['modal-all'].disabled).toBe(true);
    expect(elements['modal-total'].textContent).toBe('当前没有可成交数量');
  });

  it('胜利进度弹窗会渲染总览、路径列表和进度条语义', async function () {
    var victoryModal = createFakeElement('victory-modal', ['modal']);
    var victoryBody = createFakeElement('victory-modal-body');
    var elements = {
      'credits': createFakeElement('credits'),
      'galactic-day': createFakeElement('galactic-day'),
      'net-worth': createFakeElement('net-worth'),
      'victory-progress-summary': createFakeElement('victory-progress-summary'),
      'victory-modal': victoryModal,
      'victory-modal-body': victoryBody,
    };

    globalThis.document = {
      getElementById: function (id) {
        if (!elements[id]) elements[id] = createFakeElement(id);
        return elements[id];
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js?v=20260605-victorysummary1');
    var state = createTestState({
      credits: 12000,
      day: 42,
      questPhase: 5,
      tradeCount: 8,
      completedQuests: ['starter_first_trade'],
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    createGameShellProjection({
      interactions: {
        ensureGalaxyToggle: HUD.ensureGalaxyToggle,
        syncVictoryProgress: HUD.syncVictoryProgress,
      },
    }).render(state, 12000);

    expect(victoryBody.innerHTML).toContain('vp-overview');
    expect(victoryBody.innerHTML).toContain('vp-overview-next');
    expect(victoryBody.innerHTML).toContain('下一缺口');
    expect(victoryBody.innerHTML).toContain('role="list" aria-label="长期路线列表"');
    expect(victoryBody.innerHTML).toContain('role="progressbar"');
    expect(victoryBody.innerHTML).toContain('aria-valuetext=');
    expect(victoryBody.innerHTML).toContain('达成率');
    expect(victoryBody.innerHTML).toContain('vp-card-next');
    expect(victoryBody.innerHTML).toContain('下一条件');
    expect(victoryBody.innerHTML).toContain('vp-card-req');
    expect(victoryBody.getAttribute('role')).toBe('region');
    expect(victoryBody.getAttribute('aria-live')).toBe('polite');
    expect(victoryBody.getAttribute('aria-label')).toBe('长期路线进度详情');
  });

  it('胜利结算允许继续经营，并要求二次确认后才重新开始', async function () {
    var modal = createFakeElement('gameover-modal', ['modal', 'hidden']);
    modal.modalBox = createFakeElement('gameover-box');
    var title = createFakeElement('gameover-title');
    var message = createFakeElement('gameover-message');
    var continueBtn = createFakeElement('continue-playing-btn');
    var restartBtn = createFakeElement('restart-btn');
    var status = createFakeElement('gameover-action-status');
    var elements = {
      'gameover-modal': modal,
      'gameover-title': title,
      'gameover-message': message,
      'continue-playing-btn': continueBtn,
      'restart-btn': restartBtn,
      'gameover-action-status': status,
    };
    modal.querySelector = function (selector) {
      if (selector === '#continue-playing-btn') return continueBtn;
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return modal.modalBox;
      return null;
    };

    globalThis.document = {
      body: createFakeElement('body'),
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [modal];
        return [];
      },
      addEventListener: function () {},
    };

    var continuedPath = null;
    var restartCount = 0;
    var VictoryResultUI = await import('../js/ui/VictoryResultUI.js?v=20260619-endingresult1');
    VictoryResultUI.init({
      onContinue: function (pathId) { continuedPath = pathId; },
      onRestart: function () { restartCount += 1; },
    });

    expect(VictoryResultUI.showVictoryReport({
      path: {
        id: 'trade_empire',
        victoryTitle: '银河商业帝王',
        victoryMessage: '贸易网络已经覆盖银河。',
      },
      stats: [{ label: '净资产', value: '100,000 信用积分' }],
      progress: [{ name: '贸易霸权', icon: 'T', progress: 1, completed: true }],
    })).toBe(true);

    expect(modal.dataset.resultType).toBe('victory');
    expect(modal.dataset.victoryPath).toBe('trade_empire');
    expect(title.textContent).toBe('银河商业帝王');
    expect(message.getAttribute('aria-label')).toBe('胜利结算报告');
    expect(message.innerHTML).toContain('gameover-stat-grid');
    expect(message.innerHTML).toContain('gameover-next-card--danger');
    expect(message.innerHTML).toContain('保留当前公司');
    expect(message.innerHTML).toContain('已选择的长期路线不会改变');
    expect(message.innerHTML).not.toContain('继续推进其他长期路线');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(continueBtn.focusCount).toBe(1);

    restartBtn.dispatch('click');

    expect(restartCount).toBe(0);
    expect(restartBtn.dataset.confirmingRestart).toBe('true');
    expect(restartBtn.textContent).toBe('确认重新开始');
    expect(restartBtn.getAttribute('aria-pressed')).toBe('true');
    expect(status.textContent).toContain('清空当前运行状态');

    continueBtn.dispatch('click');

    expect(continuedPath).toBe('trade_empire');
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(restartBtn.dataset.confirmingRestart).toBe('false');
    expect(restartBtn.textContent).toBe('重新开始');

    VictoryResultUI.showVictoryReport({
      path: { id: 'trade_empire', victoryTitle: '再次结算' },
      progress: [],
    });
    restartBtn.dispatch('click');
    restartBtn.dispatch('click');

    expect(restartCount).toBe(1);
    expect(modal.classList.contains('hidden')).toBe(true);
  });

  it('胜利和结算弹层保留正文描述、空态和进度可读文本锚点', function () {
    var html = readFileSync('index.html', 'utf8');
    var css = readFileSync('css/interstellar-trader.css', 'utf8');
    var victoryPresenter = readFileSync('js/ui/VictoryProgressPresenter.js', 'utf8');
    var gameManager = readApplicationComposition();
    var victoryController = readFileSync('js/core/VictoryRuntimeController.js', 'utf8');

    expect(html).toContain('aria-describedby="victory-modal-desc victory-modal-body"');
    var resultUi = readFileSync('js/ui/VictoryResultUI.js', 'utf8');

    expect(html).toContain('aria-describedby="gameover-message gameover-next-actions gameover-action-status"');
    expect(html).toContain('id="continue-playing-btn" class="btn-primary"');
    expect(html).toContain('id="restart-btn" class="btn-secondary gameover-restart-btn"');
    expect(css).toContain('.vp-empty');
    expect(css).toContain('.vp-overview-next');
    expect(css).toContain('.vp-card-next');
    expect(css).toContain('.gameover-path-empty');
    expect(css).toContain('.gameover-next-actions');
    expect(css).toContain('.gameover-next-card--primary');
    expect(css).toContain('.gameover-next-card--danger');
    expect(css).toContain('.gameover-actions');
    expect(victoryPresenter).toContain("body.setAttribute('aria-label', '长期路线进度详情')");
    expect(victoryPresenter).toContain('export function getVictoryNextRequirement');
    expect(victoryPresenter).toContain('aria-valuetext="');
    expect(gameManager).toContain("from './VictoryRuntimeController.js'");
    expect(victoryController).toContain('VictoryResultUI.showVictoryReport(payload)');
    expect(victoryController).toContain('acknowledgedPathIds = new Set()');
    expect(victoryController).toContain('isSessionTokenCurrent(requestedToken)');
    expect(resultUi).toContain("messageEl.setAttribute('aria-label', '胜利结算报告')");
    expect(resultUi).toContain('aria-label="长期路线完成度"');
    expect(resultUi).toContain('aria-valuetext="');
    expect(resultUi).toContain('id="gameover-next-actions"');
    expect(resultUi).toContain('id="gameover-restart-note"');
    expect(resultUi).toContain("restartBtn.dataset.confirmingRestart = 'true'");
  });
});
