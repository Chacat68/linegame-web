import { describe, expect, it, vi } from 'vitest';
import { MARKET_COMMAND, normalizeMarketCommand } from '../js/core/MarketCommand.js';
import { createMarketFinanceController } from '../js/ui/MarketFinanceController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createFakeElement() {
  var attributes = Object.create(null);
  return {
    dataset: {},
    disabled: false,
    innerHTML: '',
    onclick: null,
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
  };
}

function createHarness() {
  var session = createMarketWorkspaceSession();
  var capital = createFakeElement();
  var operations = createFakeElement();
  var elements = {
    'market-capital-pane': capital,
    'market-operations-pane': operations,
  };
  var snapshot = { creditRating: 83, networkValue: 4000 };
  var commerce = {
    getCommerceSnapshot: vi.fn(function () { return snapshot; }),
  };
  var navigation = {
    bindSubworkspaceTabs: vi.fn(),
    renderSubworkspace: vi.fn(function (workspaceId, sections) {
      return 'SUB:' + workspaceId + ':' + Object.keys(sections).join(',');
    }),
  };
  var renderCapitalWorkspace = vi.fn(function () {
    return { overviewHtml: 'CAPITAL_OVERVIEW', localHtml: 'CAPITAL_LOCAL' };
  });
  var renderOperationsWorkspace = vi.fn(function () {
    return {
      overviewHtml: 'OPERATIONS_OVERVIEW',
      sections: { local: 'LOCAL', network: 'NETWORK', stations: 'STATIONS' },
    };
  });
  var publishCommand = vi.fn(function (onCommand, type, payload) {
    var command = normalizeMarketCommand(Object.assign({}, payload || {}, { type: type }));
    return command ? onCommand(command) : false;
  });
  var controller = createMarketFinanceController({
    session: session,
    navigation: navigation,
    commerce: commerce,
    getDocument: function () {
      return {
        getElementById: function (id) { return elements[id] || null; },
      };
    },
    renderCapitalWorkspace: renderCapitalWorkspace,
    renderOperationsWorkspace: renderOperationsWorkspace,
    publishCommand: publishCommand,
  });
  var onCommand = vi.fn();
  var rerenderOperations = vi.fn();
  var request = {
    state: { currentSystem: 'sol_prime', credits: 12000 },
    systemId: 'sol_prime',
    isCurrentSystem: true,
    progression: { workspace: {} },
    onCommand: onCommand,
    rerenderOperations: rerenderOperations,
  };

  return {
    capital: capital,
    commerce: commerce,
    controller: controller,
    navigation: navigation,
    onCommand: onCommand,
    operations: operations,
    publishCommand: publishCommand,
    renderCapitalWorkspace: renderCapitalWorkspace,
    renderOperationsWorkspace: renderOperationsWorkspace,
    request: request,
    rerenderOperations: rerenderOperations,
    session: session,
    snapshot: snapshot,
  };
}

function click(container, dataset, options) {
  var opts = options || {};
  var button = createFakeElement();
  button.dataset = dataset;
  button.disabled = !!opts.disabled;
  button.parentElement = opts.outside ? createFakeElement() : container;
  if (opts.ariaDisabled) button.setAttribute('aria-disabled', 'true');
  var target = { dataset: {}, parentElement: button };
  container.onclick({
    target: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
}

describe('MarketFinanceController', function () {
  it('资金与贸易站在同一渲染周期共享 Commerce 快照并各自挂载稳定容器', function () {
    var harness = createHarness();

    expect(harness.controller.renderCapital(harness.request)).toBe(true);
    expect(harness.controller.renderOperations(harness.request)).toBe(true);

    expect(harness.commerce.getCommerceSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.renderCapitalWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      commerceSnapshot: harness.snapshot,
      systemId: 'sol_prime',
    }));
    expect(harness.renderOperationsWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      commerceSnapshot: harness.snapshot,
      sortModes: { investment: 'yield', upgrade: 'income', strategy: 'income' },
    }));
    expect(harness.capital.innerHTML).toBe(
      'CAPITAL_OVERVIEW<div class="market-workspace-board market-capital-board">SUB:capital:local</div>'
    );
    expect(harness.operations.innerHTML).toBe(
      'OPERATIONS_OVERVIEW<div class="market-workspace-board market-operations-board">SUB:operations:local,network,stations</div>'
    );
    expect(harness.navigation.bindSubworkspaceTabs).toHaveBeenCalledTimes(2);
    expect(harness.controller.getDiagnostics()).toEqual({
      capitalRenderCount: 1,
      operationsRenderCount: 1,
      capitalBindCount: 1,
      operationsBindCount: 1,
      sortChangeCount: 0,
      commandPublishCount: 0,
      commerceSnapshotResolveCount: 1,
      lastCommandType: null,
      lastSortScope: null,
      lastSortMode: null,
      lastSystemId: 'sol_prime',
      lastRegion: 'operations',
    });
  });

  it('用单一 typed command 端口发布全部资金与贸易站意图', function () {
    var harness = createHarness();
    harness.controller.renderCapital(harness.request);
    harness.controller.renderOperations(harness.request);

    click(harness.capital, { action: 'market-take-loan', loanOfferId: 'growth' });
    click(harness.capital, { action: 'market-repay-loan', loanId: 'loan-1' });
    click(harness.operations, { action: 'market-invest-trade-station', systemId: 'sol_prime' });
    click(harness.operations, { action: 'market-redeem-trade-station', systemId: 'sol_prime' });
    click(harness.operations, {
      action: 'market-batch-invest-trade-stations',
      systemIds: 'sol_prime,nova_station,sol_prime',
      batchAmount: '5000',
    });
    click(harness.operations, { action: 'market-build-station', systemId: 'nova_station' });
    click(harness.operations, { action: 'market-upgrade-station', systemId: 'sol_prime' });
    click(harness.operations, {
      action: 'market-set-strategy',
      systemId: 'sol_prime',
      strategyId: 'growth',
    });
    click(harness.operations, {
      action: 'market-batch-upgrade-stations',
      systemIds: 'sol_prime,nova_station',
    });
    click(harness.operations, {
      action: 'market-batch-set-strategy',
      strategyId: 'balanced',
      systemIds: 'sol_prime,nova_station',
    });
    click(harness.operations, { action: 'market-build-station', systemId: 'ignored' }, { disabled: true });
    click(harness.operations, { action: 'market-build-station', systemId: 'ignored' }, { ariaDisabled: true });
    click(harness.operations, { action: 'market-build-station', systemId: 'ignored' }, { outside: true });

    expect(harness.onCommand.mock.calls.map(function (call) { return call[0]; })).toEqual([
      { type: MARKET_COMMAND.TAKE_LOAN, loanOfferId: 'growth' },
      { type: MARKET_COMMAND.REPAY_LOAN, loanId: 'loan-1' },
      { type: MARKET_COMMAND.INVEST_STATION, systemId: 'sol_prime' },
      { type: MARKET_COMMAND.REDEEM_STATION_INVESTMENT, systemId: 'sol_prime' },
      {
        type: MARKET_COMMAND.BATCH_INVEST_STATIONS,
        systemIds: ['sol_prime', 'nova_station'],
        amount: 5000,
      },
      { type: MARKET_COMMAND.BUILD_STATION, systemId: 'nova_station' },
      { type: MARKET_COMMAND.UPGRADE_STATION, systemId: 'sol_prime' },
      { type: MARKET_COMMAND.SET_STATION_STRATEGY, systemId: 'sol_prime', strategyId: 'growth' },
      { type: MARKET_COMMAND.BATCH_UPGRADE_STATIONS, systemIds: ['sol_prime', 'nova_station'] },
      {
        type: MARKET_COMMAND.BATCH_SET_STATION_STRATEGY,
        strategyId: 'balanced',
        systemIds: ['sol_prime', 'nova_station'],
      },
    ]);
    expect(harness.publishCommand).toHaveBeenCalledTimes(10);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      commandPublishCount: 10,
      lastCommandType: MARKET_COMMAND.BATCH_SET_STATION_STRATEGY,
    }));
  });

  it('经营排序只在有效变化时请求贸易站重绘，并可清空冻结 diagnostics', function () {
    var harness = createHarness();
    harness.controller.renderOperations(harness.request);

    click(harness.operations, {
      action: 'market-batch-set-sort',
      batchSortScope: 'investment',
      batchSortMode: 'yield',
    });
    click(harness.operations, {
      action: 'market-batch-set-sort',
      batchSortScope: 'investment',
      batchSortMode: 'system',
    });
    click(harness.operations, {
      action: 'market-batch-set-sort',
      batchSortScope: 'investment',
      batchSortMode: 'name',
    });

    expect(harness.session.getOperationsSortModes()).toEqual({
      investment: 'name',
      upgrade: 'income',
      strategy: 'income',
    });
    expect(harness.rerenderOperations).toHaveBeenCalledTimes(1);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      sortChangeCount: 1,
      lastSortScope: 'investment',
      lastSortMode: 'name',
    }));
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);
    expect(harness.controller.reset()).toEqual({
      capitalRenderCount: 0,
      operationsRenderCount: 0,
      capitalBindCount: 0,
      operationsBindCount: 0,
      sortChangeCount: 0,
      commandPublishCount: 0,
      commerceSnapshotResolveCount: 0,
      lastCommandType: null,
      lastSortScope: null,
      lastSortMode: null,
      lastSystemId: null,
      lastRegion: null,
    });
  });
});
