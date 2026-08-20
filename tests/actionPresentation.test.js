import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTION_DIRTY_REGIONS,
  DEFAULT_ACTION_PRESENTATION,
  ARCHIVE_QUEST_ACTION_PRESENTATION,
  ARCHIVE_RESEARCH_ACTION_PRESENTATION,
  FLEET_HANGAR_ACTION_PRESENTATION,
  FLEET_HANGAR_SHOP_ACTION_PRESENTATION,
  MARKET_ECONOMY_ACTION_PRESENTATION,
  MARKET_OPERATIONS_ACTION_PRESENTATION,
  UI_REGION,
  createActionPresentation,
  normalizeDirtyRegions,
} from '../js/core/ActionPresentation.js';
import { readApplicationComposition } from './runtimeCompositionSource.js';

describe('ActionPresentation', function () {
  it('默认动作只失效可见投影，不要求重绘隐藏终端或存档面板', function () {
    var gameManager = readApplicationComposition();
    var actionRuntime = readFileSync('js/core/GameActionRuntime.js', 'utf8');
    var fullRefreshFallbacks = actionRuntime.match(/invalidate\(\);/g) || [];

    expect(DEFAULT_ACTION_DIRTY_REGIONS).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
    expect(DEFAULT_ACTION_PRESENTATION.dirtyRegions).toEqual(DEFAULT_ACTION_DIRTY_REGIONS);
    expect(DEFAULT_ACTION_PRESENTATION.dirtyRegions).not.toContain(UI_REGION.SAVE);
    expect(gameManager).toContain("from './GameActionRuntime.js'");
    expect(gameManager).not.toContain("from './ActionExecutionPipeline.js'");
    expect(actionRuntime).toContain('normalizeDirtyRegions(presentation)');
    expect(actionRuntime).toContain('normalizeDirtyRegions(presentation, DEFAULT_ACTION_DIRTY_REGIONS)');
    expect(fullRefreshFallbacks.length).toBeLessThanOrEqual(3);
  });

  it('规范化会去重、过滤未知区域，并让 all 覆盖局部声明', function () {
    expect(normalizeDirtyRegions(['hud', 'unknown', 'hud', 'guide'])).toEqual(['hud', 'guide']);
    expect(normalizeDirtyRegions({ dirtyRegions: ['fleet', 'all', 'guide'] })).toEqual(['all']);
    expect(normalizeDirtyRegions(null, 'archive')).toEqual(['archive']);
  });

  it('创建的 presentation 与 dirtyRegions 均不可变', function () {
    var presentation = createActionPresentation(['market', 'guide']);

    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.dirtyRegions)).toBe(true);
    expect(presentation.dirtyRegions).toEqual(['market', 'guide']);
  });

  it('Fleet 动作在保留当前工作区刷新语义时声明真实内部区域', function () {
    expect(FLEET_HANGAR_ACTION_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.FLEET_HANGAR,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
    expect(FLEET_HANGAR_SHOP_ACTION_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.FLEET_HANGAR,
      UI_REGION.FLEET_SHOP,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
    expect(Object.isFrozen(FLEET_HANGAR_ACTION_PRESENTATION.dirtyRegions)).toBe(true);
    expect(Object.isFrozen(FLEET_HANGAR_SHOP_ACTION_PRESENTATION.dirtyRegions)).toBe(true);
  });

  it('Market 动作按现金联动与纯经营策略声明影响矩阵', function () {
    expect(MARKET_ECONOMY_ACTION_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.MARKET_CHROME,
      UI_REGION.MARKET_SPOT,
      UI_REGION.MARKET_CAPITAL,
      UI_REGION.MARKET_OPERATIONS,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
    expect(MARKET_OPERATIONS_ACTION_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.MARKET_OPERATIONS,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
  });

  it('Archive 任务与科研动作声明各自 presenter 区域', function () {
    expect(ARCHIVE_QUEST_ACTION_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.ARCHIVE_QUEST,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
    expect(ARCHIVE_RESEARCH_ACTION_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.SHIP,
      UI_REGION.ACTIVE_WORKSPACE,
      UI_REGION.ARCHIVE_RESEARCH,
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.DISPATCH,
      UI_REGION.GUIDE,
    ]);
  });
});
