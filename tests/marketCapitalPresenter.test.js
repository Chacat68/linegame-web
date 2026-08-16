import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMarketCapitalModel,
  renderMarketCapitalWorkspace,
} from '../js/ui/MarketCapitalPresenter.js';

function createPorts(overrides) {
  return Object.assign({
    finance: {
      getOverview: vi.fn(function () {
        return {
          tradeInvestmentValue: 6000,
          outstandingLoanBalance: 9000,
          activeLoanCount: 1,
          creditRating: 520,
        };
      }),
      getLoanOffers: vi.fn(function () {
        return [
          { id: 'starter', name: '周转贷款', principal: 5000, termDays: 20, available: true },
          { id: 'growth', name: '扩张贷款', principal: 20000, termDays: 30, available: false },
        ];
      }),
    },
    commerce: {
      getCommerceSnapshot: vi.fn(function () { return { creditRating: 680 }; }),
    },
    findSystem: vi.fn(function () {
      return { id: 'sol', name: '太阳系', typeLabel: '核心星系' };
    }),
  }, overrides || {});
}

function createState(overrides) {
  return Object.assign({
    credits: 3000,
    loans: [{
      id: 'loan-1',
      name: '经营周转',
      status: 'active',
      balance: 9000,
      dailyPayment: 300,
      remainingDays: 12,
    }],
  }, overrides || {});
}

describe('MarketCapitalPresenter', function () {
  it('一次构造现金、贷款、投资汇总和信用模型', function () {
    var ports = createPorts();
    var model = buildMarketCapitalModel({
      state: createState(),
      systemId: 'sol',
      isCurrentSystem: true,
      finance: ports.finance,
      commerce: ports.commerce,
      findSystem: ports.findSystem,
    });

    expect(model).toMatchObject({
      systemLabel: '太阳系 · 核心星系',
      isCurrentSystem: true,
      credits: 3000,
      investmentValue: 6000,
      overviewLoanBalance: 9000,
      activeLoanCount: 1,
      creditRating: 680,
      loanBalance: 9000,
      dailyPayment: 300,
      runwayDays: 10,
      availableOfferCount: 1,
    });
    expect(ports.finance.getOverview).toHaveBeenCalledOnce();
    expect(ports.finance.getLoanOffers).toHaveBeenCalledOnce();
    expect(ports.commerce.getCommerceSnapshot).toHaveBeenCalledOnce();
  });

  it('只把未结清贷款纳入偿付压力', function () {
    var ports = createPorts();
    var model = buildMarketCapitalModel({
      state: createState({
        credits: 10000,
        loans: [
          { id: 'active', name: '有效贷款', status: 'active', balance: 2000, dailyPayment: 100 },
          { id: 'paid', name: '已结清贷款', status: 'paid', balance: 0, dailyPayment: 500 },
        ],
      }),
      systemId: 'sol',
      isCurrentSystem: true,
      finance: ports.finance,
      commerce: ports.commerce,
      findSystem: ports.findSystem,
    });

    expect(model.activeLoans.map(function (loan) { return loan.id; })).toEqual(['active']);
    expect(model.loanBalance).toBe(2000);
    expect(model.dailyPayment).toBe(100);
    expect(model.runwayDays).toBe(100);
  });

  it('本地资金页发布贷款 command，并把站点投资明确为只读汇总', function () {
    var ports = createPorts();
    var view = renderMarketCapitalWorkspace({
      state: createState(),
      systemId: 'sol',
      isCurrentSystem: true,
      finance: ports.finance,
      commerce: ports.commerce,
      findSystem: ports.findSystem,
    });

    expect(view.overviewHtml).toContain('资金页集中查看现金、贷款与站点投资总额');
    expect(view.overviewHtml).toContain('具体建站和追加投资统一在贸易站页处理');
    expect(view.overviewHtml).toContain('站点投资');
    expect(view.overviewHtml).toContain('只读汇总；具体操作归贸易站页');
    expect(view.localHtml).toContain('🏦 本地贷款管理');
    expect(view.localHtml).toContain('data-action="market-repay-loan"');
    expect(view.localHtml).toContain('data-action="market-take-loan"');
    expect(view.localHtml).not.toContain('market-invest-trade-station');
    expect(view.localHtml).not.toContain('market-redeem-trade-station');
  });

  it('债务高于现金时显示现金流承压和 runway', function () {
    var ports = createPorts();
    var view = renderMarketCapitalWorkspace({
      state: createState(),
      systemId: 'sol',
      isCurrentSystem: true,
      finance: ports.finance,
      commerce: ports.commerce,
      findSystem: ports.findSystem,
    });

    expect(view.localHtml).toContain('data-tone="debt"');
    expect(view.localHtml).toContain('债务现金流承压');
    expect(view.localHtml).toContain('现金约覆盖 10 天');
    expect(view.localHtml).toContain('余额 9,000 · 日扣款 300 · 剩余 12 天');
  });

  it('远程资金页保留事实但不暴露任何贷款动作', function () {
    var ports = createPorts();
    var view = renderMarketCapitalWorkspace({
      state: createState(),
      systemId: 'sol',
      isCurrentSystem: false,
      finance: ports.finance,
      commerce: ports.commerce,
      findSystem: ports.findSystem,
    });

    expect(view.overviewHtml).toContain('远程查看');
    expect(view.localHtml).toContain('远程只读观察');
    expect(view.localHtml).toContain('抵达该地点后，可在这里申请或偿还经营贷款');
    expect(view.localHtml).not.toContain('data-action="market-repay-loan"');
    expect(view.localHtml).not.toContain('data-action="market-take-loan"');
  });

  it('转义系统、贷款和报价名称，并生成稳定关联 id', function () {
    var ports = createPorts({
      finance: {
        getOverview: vi.fn(function () { return {}; }),
        getLoanOffers: vi.fn(function () {
          return [{ id: 'offer bad/id', name: '<扩张>', principal: 500, termDays: 5, available: true }];
        }),
      },
      findSystem: vi.fn(function () { return { name: '<节点>', typeLabel: '核心&区' }; }),
    });
    var view = renderMarketCapitalWorkspace({
      state: createState({
        loans: [{ id: 'loan bad/id', name: '<贷款>', status: 'active', balance: 1, dailyPayment: 1, remainingDays: 1 }],
      }),
      systemId: 'sol',
      isCurrentSystem: true,
      finance: ports.finance,
      commerce: ports.commerce,
      findSystem: ports.findSystem,
    });

    expect(view.overviewHtml).toContain('&lt;节点&gt; · 核心&amp;区');
    expect(view.localHtml).toContain('id="market-loan-title-loan-bad-id"');
    expect(view.localHtml).toContain('&lt;贷款&gt;');
    expect(view.localHtml).toContain('&lt;扩张&gt;');
    expect(view.localHtml).not.toContain('<贷款>');
  });

  it('MarketUI 只组合资金 presenter，不再持有贷款 HTML 投影', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketCapitalPresenter.js', 'utf8');

    expect(marketUi).toContain("from './MarketCapitalPresenter.js'");
    expect(marketUi).not.toContain('function _renderFocusedCapitalOverview');
    expect(marketUi).not.toContain('function _renderFocusedLoanGuard');
    expect(marketUi).not.toContain('aria-label="未结清贷款列表"');
    expect(presenter).toContain('export function buildMarketCapitalModel');
    expect(presenter).toContain('export function renderMarketCapitalWorkspace');
  });
});
