import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MARKET_COMMAND,
  createMarketCommand,
  normalizeMarketCommand,
} from '../js/core/MarketCommand.js';
import { readApplicationComposition } from './runtimeCompositionSource.js';

describe('MarketCommand', function () {
  it('规范化公开与黑市交易并保留领域商品引用', function () {
    var good = { id: 'food', name: '食品' };
    var command = createMarketCommand(MARKET_COMMAND.OPEN_TRADE, {
      action: 'sell',
      marketMode: 'black',
      good: good,
    });

    expect(command).toEqual({
      type: MARKET_COMMAND.OPEN_TRADE,
      action: 'sell',
      marketMode: 'black',
      good: good,
    });
    expect(Object.isFrozen(command)).toBe(true);
  });

  it('批量 command 去空、去重并规范化可选金额', function () {
    var command = normalizeMarketCommand({
      type: MARKET_COMMAND.BATCH_INVEST_STATIONS,
      systemIds: ' sol_prime, nova_station,sol_prime, ',
      amount: '5000',
    });

    expect(command).toEqual({
      type: MARKET_COMMAND.BATCH_INVEST_STATIONS,
      systemIds: ['sol_prime', 'nova_station'],
      amount: 5000,
    });
    expect(Object.isFrozen(command.systemIds)).toBe(true);
  });

  it('拒绝未知、缺少标识或缺少商品的 command', function () {
    expect(normalizeMarketCommand(null)).toBeNull();
    expect(normalizeMarketCommand({ type: 'market.unknown' })).toBeNull();
    expect(normalizeMarketCommand({ type: MARKET_COMMAND.TAKE_LOAN })).toBeNull();
    expect(normalizeMarketCommand({
      type: MARKET_COMMAND.OPEN_TRADE,
      action: 'buy',
      good: null,
    })).toBeNull();
    expect(function () {
      createMarketCommand(MARKET_COMMAND.BUILD_STATION, {});
    }).toThrow(/Invalid market command/);
  });

  it('策略 command 固定参数顺序所需的结构字段', function () {
    expect(createMarketCommand(MARKET_COMMAND.SET_STATION_STRATEGY, {
      systemId: 'sol_prime',
      strategyId: 'growth',
    })).toEqual({
      type: MARKET_COMMAND.SET_STATION_STRATEGY,
      systemId: 'sol_prime',
      strategyId: 'growth',
    });
    expect(createMarketCommand(MARKET_COMMAND.BATCH_SET_STATION_STRATEGY, {
      systemIds: ['sol_prime', 'nova_station'],
      strategyId: 'balanced',
    })).toEqual({
      type: MARKET_COMMAND.BATCH_SET_STATION_STRATEGY,
      strategyId: 'balanced',
      systemIds: ['sol_prime', 'nova_station'],
    });
  });

  it('市场 UI 与组合根之间只保留一个 command 端口', function () {
    var gameManager = readApplicationComposition();
    var uiApplication = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');
    var coordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');

    expect(gameManager).toContain("from './GameUiApplicationRuntime.js'");
    expect(uiApplication).toContain('onCommand: market.handleCommand');
    expect(gameManager).not.toContain('getFinanceActions:');
    expect(coordinator).toContain("onCommand: _action(actions, 'market', 'onCommand')");
    expect(coordinator).not.toContain("_action(actions, 'market', 'onOpenBuy')");
    expect(marketUi).toContain('export function render(request)');
    expect(marketUi).toContain('export function renderRegions(request, regions)');
    expect(marketUi).toContain('export function renderSpot(request)');
    expect(marketUi).toContain('export function renderCapital(request)');
    expect(marketUi).toContain('export function renderOperations(request)');
    expect(marketUi).not.toContain('financeActions');
    expect(marketUi).not.toContain('capitalContainer, operationsContainer');
    expect(marketUi).toContain('function _bindMarketFinanceCommands(container, context, options)');
    expect(marketUi).toContain('container.onclick = function');
    expect(marketUi).toContain('quickTradeDockEl.onclick = function');
  });
});
