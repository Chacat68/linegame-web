import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  getTradeStationCandidateIntel,
  parseMarketBatchSystemIds,
  renderMarketOperationsWorkspace,
  updateMarketOperationsSortModes,
} from '../js/ui/MarketOperationsPresenter.js';

function createStation(systemId, name, overrides) {
  var entry = {
    station: {
      systemId: systemId,
      level: 1,
      strategyId: 'balanced',
      totalIncome: 1200,
      lastIncome: 90,
      investment: 100000,
      buildDay: 3,
    },
    system: {
      id: systemId,
      name: name,
      typeLabel: '工业',
      marketDepth: 260,
      description: name + ' 的贸易节点',
    },
    levelConfig: { name: '贸易前哨' },
    projectedIncome: 320,
    economicFactor: 1.1,
    role: { name: '补给站' },
    regionalSynergy: null,
    strategy: { id: 'balanced', name: '稳健经营' },
    strategyRecommendation: {
      strategyId: 'expansion',
      strategy: { id: 'expansion', name: '薄利多销' },
      shouldSwitch: true,
      confidence: 'high',
      reason: '货运吞吐量充足。',
    },
    explorationEffect: null,
    nextLevel: { level: 2, name: '小型贸易站' },
    nextUpgradeCost: 70000,
  };
  return Object.assign(entry, overrides || {});
}

function createPorts(options) {
  var opts = options || {};
  var ownedStations = opts.ownedStations || [createStation('sol_prime', '太阳主星')];
  var buildCandidates = opts.buildCandidates || [];
  return {
    finance: {
      getTradeInvestmentOptions: vi.fn(function (state, systemIds) {
        return systemIds.map(function (systemId, index) {
          var station = ownedStations.find(function (entry) { return entry.station.systemId === systemId; });
          return {
            systemId: systemId,
            name: station ? station.system.name : systemId,
            suggestedAmount: 5000,
            investedAmount: (index + 1) * 1000,
            expectedYieldRate: station && station.projectedIncome > 300 ? 0.004 : 0.003,
            expectedDailyDividend: 20,
            estimatedPaybackDays: 250,
            totalDividends: 400,
            canRedeem: true,
            estimatedExitValue: 900,
            redeemableDay: 31,
          };
        });
      }),
    },
    tradeStation: {
      getSummary: vi.fn(function () { return { count: ownedStations.length, totalIncome: 4800 }; }),
      getOwnedStations: vi.fn(function () { return ownedStations; }),
      getBuildCandidates: vi.fn(function () { return buildCandidates; }),
      getNextNetworkAction: vi.fn(function () {
        return {
          title: '升级太阳主星',
          reason: '该站点现金流稳定。',
          actionLabel: '升级站点',
          disabled: false,
          payload: { action: 'market-upgrade-station', systemId: 'sol_prime' },
        };
      }),
    },
    commerce: {
      getCommerceSnapshot: vi.fn(function () {
        return {
          creditRating: 680,
          ownedStationCount: ownedStations.length,
          stationDailyIncome: 320,
          tradeInvestmentValue: 5000,
          totalLoans: 0,
        };
      }),
    },
    exploration: {
      getSurveyDecisionIntel: vi.fn(function () { return null; }),
    },
  };
}

function renderWorkspace(overrides) {
  var input = overrides || {};
  var ports = input.ports || createPorts();
  return renderMarketOperationsWorkspace({
    state: input.state || {
      credits: 200000,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
      tradeInvestments: {},
    },
    systemId: input.systemId || 'sol_prime',
    isCurrentSystem: input.isCurrentSystem !== false,
    sortModes: input.sortModes,
    finance: ports.finance,
    tradeStation: ports.tradeStation,
    commerce: ports.commerce,
    exploration: ports.exploration,
  });
}

describe('MarketOperationsPresenter', function () {
  it('排序状态更新保持纯函数并修复非法值', function () {
    var current = { investment: 'stake', upgrade: 'bogus', strategy: 'name' };
    var next = updateMarketOperationsSortModes(current, 'upgrade', 'cost');

    expect(next).toEqual({ investment: 'stake', upgrade: 'cost', strategy: 'name' });
    expect(current).toEqual({ investment: 'stake', upgrade: 'bogus', strategy: 'name' });
    expect(updateMarketOperationsSortModes(current, 'upgrade', 'bogus')).toEqual({
      investment: 'stake',
      upgrade: 'income',
      strategy: 'name',
    });
  });

  it('批量系统清单会去空、去重并保持顺序', function () {
    expect(parseMarketBatchSystemIds(' sol_prime, nova_station,sol_prime, , ')).toEqual([
      'sol_prime',
      'nova_station',
    ]);
    expect(parseMarketBatchSystemIds('')).toEqual([]);
  });

  it('候选情报优先投影航线线索且允许注入探索端口', function () {
    var exploration = {
      getSurveyDecisionIntel: vi.fn(function () {
        return {
          hasIntel: true,
          routeSignal: true,
          marketSignal: true,
          dispatchHint: '可缩短自动派遣航程。',
        };
      }),
    };

    expect(getTradeStationCandidateIntel({}, 'nova_station', exploration)).toEqual({
      systemId: 'nova_station',
      signal: 'route',
      label: '隐藏航线图',
      note: '可缩短自动派遣航程。',
    });
    expect(exploration.getSurveyDecisionIntel).toHaveBeenCalledWith({}, 'nova_station');
  });

  it('一次构造本地、商网和站点三个经营分区', function () {
    var view = renderWorkspace();

    expect(view.model.tradeSummary.count).toBe(1);
    expect(view.model.sortModes).toEqual({ investment: 'yield', upgrade: 'income', strategy: 'income' });
    expect(view.overviewHtml).toContain('本地站点在线');
    expect(view.sections.local).toContain('🏪 本地经营');
    expect(view.sections.network).toContain('📡 商业网络总览');
    expect(view.sections.network).toContain('商网待处理项');
    expect(view.sections.stations).toContain('aria-label="已建贸易站列表"');
  });

  it('本地站点发布升级、投资、退出和经营方式 command', function () {
    var local = renderWorkspace().sections.local;

    expect(local).toContain('data-action="market-upgrade-station"');
    expect(local).toContain('data-action="market-invest-trade-station"');
    expect(local).toContain('data-action="market-redeem-trade-station"');
    expect(local).toContain('data-action="market-set-strategy"');
    expect(local).toContain('采用匹配方式');
  });

  it('远程本地页只保留经营事实，不发布本地 command', function () {
    var local = renderWorkspace({ isCurrentSystem: false }).sections.local;

    expect(local).toContain('远程只读');
    expect(local).not.toContain('data-action="market-upgrade-station"');
    expect(local).not.toContain('data-action="market-invest-trade-station"');
    expect(local).not.toContain('data-action="market-redeem-trade-station"');
    expect(local).not.toContain('data-action="market-set-strategy"');
  });

  it('候选站点合并探索情报并发布建站 command', function () {
    var candidate = createStation('nova_station', '新北京站');
    var ports = createPorts({
      ownedStations: [candidate],
      buildCandidates: [{
        system: { id: 'sol_prime', name: '太阳主星', typeLabel: '核心', marketDepth: 300, description: '联盟贸易中心' },
        role: { name: '枢纽站' },
        prospectiveRegionalSynergy: null,
        strategyRecommendation: null,
        explorationEffect: null,
        isCurrent: true,
        canAfford: true,
        buildCost: 30000,
      }],
    });
    ports.exploration.getSurveyDecisionIntel.mockReturnValue({
      hasIntel: true,
      depotSignal: true,
      anomalyHint: '发现可复用的货运仓库。',
    });
    var view = renderWorkspace({ ports: ports });

    expect(view.sections.local).toContain('探索支持 · 废弃补给站');
    expect(view.sections.local).toContain('发现可复用的货运仓库。');
    expect(view.sections.local).toContain('data-action="market-build-station"');
  });

  it('排序选择进入批量计划并使用局部状态术语', function () {
    var view = renderWorkspace({
      sortModes: { investment: 'name', upgrade: 'cost', strategy: 'name' },
    });
    var html = view.overviewHtml + Object.values(view.sections).join('');
    var source = readFileSync('js/ui/MarketOperationsPresenter.js', 'utf8');

    expect(view.sections.network).toContain('data-batch-sort-scope="investment" data-batch-sort-mode="name">地点名');
    expect(view.sections.network).toContain('market-batch-plan-sort-btn active" data-action="market-batch-set-sort" data-batch-sort-scope="investment" data-batch-sort-mode="name"');
    expect(html).toContain('匹配方式');
    expect(source).toContain('参考投入');
    expect(html).not.toMatch(/下一笔商网动作|建议方式|采用建议方式|建议投入/);
  });

  it('MarketUI 只组合经营 presenter，不再持有贸易站 HTML 投影', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var controller = readFileSync('js/ui/MarketFinanceController.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketOperationsPresenter.js', 'utf8');

    expect(marketUi).toContain("from './MarketFinanceController.js'");
    expect(marketUi).toContain("from './MarketOperationsPresenter.js'");
    expect(marketUi).not.toContain('_renderMarketOperationsWorkspace({');
    expect(controller).toContain("from './MarketOperationsPresenter.js'");
    expect(controller).toContain('renderOperationsWorkspace({');
    expect(marketUi).not.toContain('function _renderOperationsCommandDeck');
    expect(marketUi).not.toContain('function _renderLocalOperationsPanel');
    expect(marketUi).not.toContain('function _bindMarketFinanceCommands');
    expect(marketUi).not.toContain('class="trade-station-card-list trade-station-card-list--owned"');
    expect(presenter).toContain('export function renderMarketOperationsWorkspace');
    expect(presenter).toContain('export function updateMarketOperationsSortModes');
  });
});
