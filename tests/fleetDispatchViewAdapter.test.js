import { describe, expect, it } from 'vitest';
import { createFleetDispatchViewAdapter } from '../js/ui/FleetDispatchViewAdapter.js';

function createFakeElement() {
  var attributes = Object.create(null);
  return {
    className: '',
    dataset: {},
    disabled: false,
    innerHTML: '',
    onclick: null,
    onchange: null,
    oninput: null,
    ontoggle: null,
    open: false,
    textContent: '',
    value: '',
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) { delete attributes[name]; },
  };
}

function createFakeSelect(initialValue) {
  var element = createFakeElement();
  var optionValues = [];
  var value = initialValue || '';
  var html = '';
  Object.defineProperty(element, 'innerHTML', {
    configurable: true,
    get: function () { return html; },
    set: function (next) {
      html = String(next || '');
      optionValues = [];
      var match;
      var optionPattern = /<option[^>]*value="([^"]*)"/g;
      while ((match = optionPattern.exec(html))) optionValues.push(match[1]);
      if (!optionValues.length) value = '';
      else if (!optionValues.includes(value)) value = optionValues[0];
    },
  });
  Object.defineProperty(element, 'value', {
    configurable: true,
    get: function () { return value; },
    set: function (next) { value = String(next || ''); },
  });
  Object.defineProperty(element, 'options', {
    configurable: true,
    get: function () { return optionValues.map(function (optionValue) { return { value: optionValue }; }); },
  });
  Object.defineProperty(element, 'selectedIndex', {
    configurable: true,
    get: function () { return optionValues.indexOf(value); },
    set: function (index) {
      if (optionValues[index] !== undefined) value = optionValues[index];
    },
  });
  return element;
}

function createDispatchDom() {
  var elements = {
    'dispatch-modal': createFakeElement(),
    'dispatch-title': createFakeElement(),
    'dispatch-primary-hint': createFakeElement(),
    'dispatch-route-summary': createFakeElement(),
    'dispatch-summary-buy': createFakeElement(),
    'dispatch-summary-sell': createFakeElement(),
    'dispatch-summary-good': createFakeElement(),
    'dispatch-summary-policy': createFakeElement(),
    'dispatch-buy-system': createFakeSelect(),
    'dispatch-sell-system': createFakeSelect(),
    'dispatch-good': createFakeSelect(),
    'dispatch-market-mode': createFakeSelect('open'),
    'dispatch-risk-mode': createFakeSelect('balanced'),
    'dispatch-max-buy-price': createFakeElement(),
    'dispatch-min-sell-price': createFakeElement(),
    'dispatch-min-profit-rate': createFakeElement(),
    'dispatch-policy-status': createFakeElement(),
    'dispatch-estimate': createFakeElement(),
    'dispatch-confirm': createFakeElement(),
    'dispatch-cancel': createFakeElement(),
    'dispatch-advanced-panel': createFakeElement(),
  };
  return {
    elements: elements,
    document: { getElementById: function (id) { return elements[id] || null; } },
  };
}

describe('FleetDispatchViewAdapter', function () {
  it('区分缺失 document 与缺失必需节点，不激活半开视图', function () {
    var adapter = createFleetDispatchViewAdapter({ getDocument: function () { return null; } });
    expect(adapter.prepare()).toBe(false);
    expect(adapter.getDiagnostics()).toEqual(expect.objectContaining({
      active: false,
      lastPrepareStatus: 'missing-document',
    }));

    adapter = createFleetDispatchViewAdapter({
      getDocument: function () { return { getElementById: function () { return null; } }; },
    });
    expect(adapter.prepare()).toBe(false);
    expect(adapter.getDiagnostics().lastPrepareStatus).toBe('missing-dom');
  });

  it('独占表单读写、选项保留、状态投影与单组处理器', function () {
    var dom = createDispatchDom();
    var adapter = createFleetDispatchViewAdapter({ getDocument: function () { return dom.document; } });
    expect(adapter.prepare()).toBe(true);
    expect(adapter.activatePrepared()).toBe(true);
    adapter.renderTitle('自动跑商「测试舰」');
    adapter.renderPolicyInputs({ maxBuyPrice: 10, minSellPrice: 20, minProfitRate: 0.15, riskMode: 'safe', marketMode: 'open' });
    adapter.renderMarketOptions({
      buyOptionsHtml: '<option value="alpha">Alpha</option><option value="beta">Beta</option>',
      sellOptionsHtml: '<option value="alpha">Alpha</option><option value="beta">Beta</option>',
      goodOptionsHtml: '<option value="food">食物</option><option value="ore">矿石</option>',
      existingRoute: { buySystemId: 'beta', sellSystemId: 'alpha', goodId: 'ore' },
    });
    adapter.setAdvancedOpen(true);

    expect(adapter.readForm()).toMatchObject({
      advancedOpen: true,
      buySystemId: 'beta',
      sellSystemId: 'alpha',
      goodId: 'ore',
      policyInput: {
        maxBuyPrice: 10,
        minSellPrice: 20,
        minProfitRatePercent: 15,
        riskMode: 'safe',
        marketMode: 'open',
      },
    });

    var calls = [];
    adapter.bind({
      onSelectionChange: function () { calls.push('selection'); },
      onMarketModeChange: function () { calls.push('market'); },
      onAdvancedToggle: function () { calls.push('advanced'); },
      onConfirm: function () { calls.push('confirm'); },
      onCancel: function () { calls.push('cancel'); },
    });
    dom.elements['dispatch-buy-system'].onchange();
    dom.elements['dispatch-market-mode'].onchange();
    dom.elements['dispatch-advanced-panel'].ontoggle();
    dom.elements['dispatch-confirm'].onclick();
    dom.elements['dispatch-cancel'].onclick();
    expect(calls).toEqual(['selection', 'market', 'advanced', 'confirm', 'cancel']);
    expect(adapter.getDiagnostics()).toEqual(expect.objectContaining({ active: true, bindCount: 1, bindingCount: 11 }));
  });

  it('投影校验、路线、主操作和失败状态，并在 release/reset 时释放处理器', function () {
    var dom = createDispatchDom();
    var adapter = createFleetDispatchViewAdapter({ getDocument: function () { return dom.document; } });
    adapter.prepare();
    adapter.activatePrepared();
    adapter.bind({ onSelectionChange: function () {}, onConfirm: function () {} });
    adapter.renderPolicyValidation({
      fieldValidity: { maxBuyPrice: false, minSellPrice: true, minProfitRatePercent: true },
    }, { state: 'invalid', className: 'policy-invalid', text: '输入有误' });
    adapter.renderRouteSummary({
      buyLabel: 'Alpha', sellLabel: 'Beta', goodLabel: '食物', policyLabel: '公开市场', state: 'ready',
    });
    adapter.renderPrimaryView({
      buttonLabel: '启动路线', disabled: false, state: 'ready', className: 'dispatch-ready', text: '可以启动',
    });
    adapter.renderEstimateHtml('<strong>估算</strong>');

    expect(dom.elements['dispatch-max-buy-price'].getAttribute('aria-invalid')).toBe('true');
    expect(dom.elements['dispatch-modal'].dataset).toMatchObject({ dispatchPolicyState: 'invalid', dispatchState: 'ready' });
    expect(dom.elements['dispatch-summary-buy'].textContent).toBe('Alpha');
    expect(dom.elements['dispatch-estimate'].innerHTML).toBe('<strong>估算</strong>');
    expect(adapter.isConfirmDisabled()).toBe(false);

    adapter.renderBlocked('启动失败');
    expect(dom.elements['dispatch-primary-hint'].textContent).toBe('启动失败');
    expect(dom.elements['dispatch-modal'].dataset.dispatchState).toBe('blocked');
    expect(adapter.release()).toBe(true);
    expect(dom.elements['dispatch-confirm'].onclick).toBe(null);
    expect(dom.elements['dispatch-buy-system'].onchange).toBe(null);
    expect(adapter.reset()).toEqual(expect.objectContaining({ active: false, resetCount: 1 }));
  });
});
