import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import {
  buildFleetDispatchEstimate,
  buildFleetDispatchGoodOptions,
  buildFleetDispatchPolicyStatus,
  buildFleetDispatchPrimaryView,
  buildFleetDispatchRouteSummary,
  buildFleetDispatchSystemOptions,
  buildFleetDispatchWarnings,
  formatFleetDispatchMarketMode,
  formatFleetDispatchRiskMode,
  getFleetDispatchReadiness,
  hasCustomFleetDispatchPolicy,
  parseFleetDispatchPolicy,
  renderFleetDispatchEstimate,
  validateFleetDispatchPolicy,
} from '../js/ui/FleetDispatchPresenter.js';
import { createTestState } from './helpers.js';

function createDispatchContext(overrides) {
  var state = createTestState(Object.assign({
    credits: 50000,
    currentSystem: 'sol_prime',
    currentGalaxy: 'milky_way',
    playerLevel: 5,
  }, overrides));
  Economy.init();
  Fleet.init(state);
  var ship = state.fleet[0];
  return {
    state: state,
    ship: ship,
    shipIndex: 0,
    effectiveShipStats: Fleet.getEffectiveShipStats(state, ship),
    currentLocationSystemId: state.currentSystem,
    dispatchGalaxyId: state.currentGalaxy,
    playerLevel: state.playerLevel,
  };
}

function createSelection(overrides) {
  return Object.assign({
    buySystemId: 'sol_prime',
    sellSystemId: 'war_front',
    goodId: 'food',
    tradePolicy: parseFleetDispatchPolicy({ riskMode: 'balanced', marketMode: 'open' }),
  }, overrides);
}

describe('FleetDispatchPresenter', function () {
  it('规范化交易策略并统一字段验证和状态文案', function () {
    var policy = parseFleetDispatchPolicy({
      maxBuyPrice: '120',
      minSellPrice: '',
      minProfitRatePercent: '15',
      riskMode: 'safe',
      marketMode: 'black',
    });
    expect(policy).toEqual({
      maxBuyPrice: 120,
      minSellPrice: null,
      minProfitRate: 0.15,
      riskMode: 'safe',
      marketMode: 'black',
    });
    expect(hasCustomFleetDispatchPolicy(policy)).toBe(true);
    expect(formatFleetDispatchRiskMode('safe')).toBe('保守');
    expect(formatFleetDispatchMarketMode('black')).toBe('黑市');

    var invalid = validateFleetDispatchPolicy({ maxBuyPrice: '-1', minSellPrice: 'x', minProfitRatePercent: '' });
    expect(invalid.valid).toBe(false);
    expect(invalid.fieldValidity).toMatchObject({ maxBuyPrice: false, minSellPrice: false, minProfitRatePercent: true });
    expect(buildFleetDispatchPolicyStatus(invalid)).toMatchObject({ state: 'invalid' });
    expect(buildFleetDispatchPolicyStatus(invalid).text).toContain('最高买入价需填写 0 或更大的数字');
  });

  it('从最新状态计算路线估算，并覆盖路线、维护度和资金阻塞', function () {
    var context = createDispatchContext();
    var estimate = buildFleetDispatchEstimate(context, createSelection());
    expect(estimate).toMatchObject({ buyId: 'sol_prime', sellId: 'war_front', goodId: 'food', deliveryOnly: false });
    expect(estimate.maxQty).toBeGreaterThan(0);
    expect(getFleetDispatchReadiness(context, estimate)).toMatchObject({ ok: true, code: 'ready' });

    var sameSystem = buildFleetDispatchEstimate(context, createSelection({ sellSystemId: 'sol_prime' }));
    expect(getFleetDispatchReadiness(context, sameSystem)).toMatchObject({ ok: false, code: 'same_system', buttonLabel: '路线无效' });

    context.ship.maintenance = 10;
    expect(getFleetDispatchReadiness(context, estimate)).toMatchObject({ ok: false, code: 'maintenance' });
    context.ship.maintenance = 100;
    context.state.credits = 0;
    var noCredits = buildFleetDispatchEstimate(context, createSelection());
    expect(getFleetDispatchReadiness(context, noCredits)).toMatchObject({ ok: false, code: 'insufficient_credits' });
  });

  it('投影路线摘要、等待警告与主操作状态', function () {
    var context = createDispatchContext();
    var selection = createSelection({
      tradePolicy: parseFleetDispatchPolicy({ maxBuyPrice: '1', riskMode: 'safe', marketMode: 'open' }),
    });
    var estimate = buildFleetDispatchEstimate(context, selection);
    var readiness = getFleetDispatchReadiness(context, estimate);
    var warnings = buildFleetDispatchWarnings(context.state, estimate);
    var summary = buildFleetDispatchRouteSummary(selection, estimate, warnings, readiness);
    expect(summary.buyLabel).toBe('太阳主星');
    expect(summary.goodLabel).toBe('🌾 食物');
    expect(summary.state).toBe('waiting');
    expect(summary.policyLabel).toContain('等待设置调整');

    var view = buildFleetDispatchPrimaryView({
      estimate: estimate,
      validation: validateFleetDispatchPolicy({ maxBuyPrice: '1' }),
      readiness: readiness,
      selection: selection,
      hasExistingRoute: false,
    });
    expect(view).toMatchObject({ state: 'custom', disabled: false, buttonLabel: '开始跑商' });
  });

  it('输出估算、风险和选项 HTML，同时对动态标签转义', function () {
    var context = createDispatchContext();
    var estimate = buildFleetDispatchEstimate(context, createSelection());
    var readiness = getFleetDispatchReadiness(context, estimate);
    var html = renderFleetDispatchEstimate(context, {
      estimate: estimate,
      readiness: readiness,
      warnings: [],
      recommendation: { buySystemName: '<太阳>', sellSystemName: '战争前线', goodName: '食物' },
    });
    expect(html).toContain('aria-label="自动跑商估算"');
    expect(html).toContain('aria-label="路线风险明细"');
    expect(html).toContain('&lt;太阳&gt;');
    expect(buildFleetDispatchGoodOptions('open')).toContain('value="food"');
    expect(buildFleetDispatchGoodOptions('open')).not.toContain('value="fuel"');

    var optionHtml = buildFleetDispatchSystemOptions([
      { id: 'alpha', name: '<Alpha>', typeLabel: '枢纽', galaxyId: 'milky_way' },
    ], 'milky_way');
    expect(optionHtml).toContain('银河系 · 当前星系');
    expect(optionHtml).toContain('&lt;Alpha&gt;');
  });

  it('FleetUI 只协调 DOM，派遣计算与 HTML 由无 DOM Presenter 承担', function () {
    var uiSource = readFileSync('js/ui/FleetUI.js', 'utf8');
    var presenterSource = readFileSync('js/ui/FleetDispatchPresenter.js', 'utf8');
    expect(uiSource).toContain('buildFleetDispatchEstimate(dispatchContext, _readSelection())');
    expect(uiSource).toContain('renderFleetDispatchEstimate(dispatchContext');
    expect(uiSource).toContain('buildFleetDispatchPrimaryView({');
    expect(uiSource).not.toContain('function _buildRiskSummary');
    expect(presenterSource).not.toContain('document.');
    expect(presenterSource).not.toContain('.onclick');
  });
});
