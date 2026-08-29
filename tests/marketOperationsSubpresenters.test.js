import { describe, expect, it, vi } from 'vitest';
import {
  getMarketBatchAffordablePlan,
  getMarketInvestmentBatchPlan,
  renderMarketBatchPlanningPanel,
} from '../js/ui/MarketBatchPlanPresenter.js';
import { renderMarketLocalOperations } from '../js/ui/MarketLocalOperationsPresenter.js';
import {
  renderMarketOperationsCommandDeck,
  renderMarketOperationsNetwork,
} from '../js/ui/MarketOperationsOverviewPresenter.js';
import {
  getTradeStationCandidateIntel,
  renderMarketTradeStationList,
} from '../js/ui/MarketTradeStationListPresenter.js';

function createPlan(targets) {
  return {
    targetCount: targets.length,
    affordableCount: targets.length,
    affordableCost: 0,
    totalCost: 0,
    targets: targets,
    affordableTargets: targets,
    deferredTargets: [],
  };
}

function createProjection(overrides) {
  return Object.assign({
    state: { credits: 50000 },
    viewingSystem: 'sol_prime',
    isCurrentSystem: true,
    commerceSnapshot: {
      creditRating: 680,
      ownedStationCount: 0,
      stationDailyIncome: 0,
      tradeInvestmentValue: 0,
      totalLoans: 0,
    },
    tradeSummary: { count: 0, totalIncome: 0 },
    ownedStations: [],
    buildCandidates: [],
    localStation: null,
    buildCandidate: null,
    localInvestment: null,
    nextNetworkAction: null,
    networkInvestmentPlan: createPlan([]),
    networkUpgradePlan: createPlan([]),
    sortModes: { investment: 'yield', upgrade: 'income', strategy: 'income' },
  }, overrides || {});
}

describe('Market operations subpresenters', function () {
  it('批量预算计划按输入顺序划分本轮覆盖与后置目标', function () {
    var plan = getMarketBatchAffordablePlan([
      { id: 'alpha', cost: 60 },
      { id: 'beta', cost: 50 },
      { id: 'gamma', cost: 30 },
    ], 100, function (entry) { return entry.cost; });

    expect(plan.affordableTargets.map(function (entry) { return entry.id; })).toEqual(['alpha', 'gamma']);
    expect(plan.deferredTargets.map(function (entry) { return entry.id; })).toEqual(['beta']);
    expect(plan.affordableCost).toBe(90);
    expect(plan.totalCost).toBe(140);
  });

  it('投资计划通过注入端口采集站点并给出统一单站金额', function () {
    var finance = {
      getTradeInvestmentOptions: vi.fn(function () {
        return [{ systemId: 'sol_prime', suggestedAmount: 5000 }];
      }),
    };
    var plan = getMarketInvestmentBatchPlan(
      { credits: 8000 },
      [{ station: { systemId: 'sol_prime' } }],
      finance
    );

    expect(finance.getTradeInvestmentOptions).toHaveBeenCalledWith(
      { credits: 8000 },
      ['sol_prime']
    );
    expect(plan.amountPerTarget).toBe(5000);
    expect(plan.affordableCount).toBe(1);
  });

  it('批量面板只把可覆盖目标写入 command 清单', function () {
    var owned = [{
      station: { systemId: 'sol_prime', strategyId: 'balanced', level: 1 },
      system: { name: '太阳主星' },
      strategy: { name: '稳健经营' },
      projectedIncome: 300,
    }];
    var investment = createPlan([{
      systemId: 'sol_prime',
      name: '太阳主星',
      expectedYieldRate: 0.004,
      investedAmount: 1000,
      planCost: 5000,
    }]);
    investment.amountPerTarget = 5000;
    investment.suggestedAmount = 5000;
    investment.affordableCost = 5000;
    investment.totalCost = 5000;
    var html = renderMarketBatchPlanningPanel(
      { credits: 5000 },
      owned,
      investment,
      createPlan([]),
      { investment: 'yield', upgrade: 'income', strategy: 'income' }
    );

    expect(html).toContain('data-action="market-batch-invest-trade-stations"');
    expect(html).toContain('data-system-ids="sol_prime"');
    expect(html).toContain('data-batch-amount="5000"');
  });

  it('本地经营 Presenter 在远程地点只发布只读状态', function () {
    var html = renderMarketLocalOperations(createProjection({
      isCurrentSystem: false,
      tradeSummary: { count: 1, totalIncome: 100 },
    }));

    expect(html).toContain('远程只读');
    expect(html).toContain('远程地点尚未开放经营');
    expect(html).not.toContain('data-action=');
  });

  it('指挥台独立投影地点、商网规模与批量覆盖', function () {
    var html = renderMarketOperationsCommandDeck(createProjection({
      tradeSummary: { count: 2, totalIncome: 900 },
      ownedStations: [{}, {}],
      networkUpgradePlan: Object.assign(createPlan([{}]), { affordableCount: 1 }),
    }));

    expect(html).toContain('商网指挥台 · 等待解锁');
    expect(html).toContain('商网规模');
    expect(html).toContain('1/1');
  });

  it('网络概览在无站点时保留待处理空态且不渲染批量面板', function () {
    var html = renderMarketOperationsNetwork(createProjection());

    expect(html).toContain('📡 商业网络总览');
    expect(html).toContain('暂无待处理');
    expect(html).not.toContain('批量计划面板');
  });

  it('站点列表在空商网中同时解释候选和已建站空态', function () {
    var html = renderMarketTradeStationList(createProjection());

    expect(html).toContain('先探索更多星球');
    expect(html).toContain('还没有贸易站');
    expect(html).toContain('aria-label="商网列表摘要"');
  });

  it('候选情报保持独立探索端口与优先级', function () {
    var exploration = {
      getSurveyDecisionIntel: vi.fn(function () {
        return {
          hasIntel: true,
          depotSignal: true,
          routeSignal: true,
          anomalyHint: '仓库结构完好。',
        };
      }),
    };

    expect(getTradeStationCandidateIntel({}, 'nova_station', exploration)).toEqual({
      systemId: 'nova_station',
      signal: 'logistics',
      label: '废弃补给站',
      note: '仓库结构完好。',
    });
  });
});
