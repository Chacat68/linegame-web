import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_UNLOCK_PRESENTATION,
  ARCHIVE_EXPLORATION_FOCUS_PRESENTATION,
  ARCHIVE_QUEST_FOCUS_PRESENTATION,
  COMPANY_IDENTITY_PRESENTATION,
  DEFAULT_ACTION_DIRTY_REGIONS,
  DEFAULT_ACTION_PRESENTATION,
  GUIDANCE_ONLY_PRESENTATION,
  NAVIGATION_FOCUS_PRESENTATION,
  ARCHIVE_QUEST_ACTION_PRESENTATION,
  ARCHIVE_RESEARCH_ACTION_PRESENTATION,
  FLEET_HANGAR_ACTION_PRESENTATION,
  FLEET_HANGAR_FOCUS_PRESENTATION,
  FLEET_HANGAR_SHOP_ACTION_PRESENTATION,
  MARKET_CAPITAL_FOCUS_PRESENTATION,
  MARKET_ECONOMY_ACTION_PRESENTATION,
  MARKET_OPERATIONS_FOCUS_PRESENTATION,
  MARKET_OPERATIONS_ACTION_PRESENTATION,
  MARKET_SPOT_FOCUS_PRESENTATION,
  UI_REGION,
  createActionPresentation,
  getMarketFocusPresentation,
  normalizeDirtyRegions,
  resolveDirtyRegions,
} from '../js/core/ActionPresentation.js';
import { readApplicationComposition } from './runtimeCompositionSource.js';

describe('ActionPresentation', function () {
  it('默认动作只失效可见投影，不要求重绘隐藏终端或存档面板', function () {
    var gameManager = readApplicationComposition();
    var actionRuntime = readFileSync('js/core/GameActionRuntime.js', 'utf8');

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
    expect(actionRuntime).toContain('resolveDirtyRegions(presentation, DEFAULT_ACTION_DIRTY_REGIONS)');
    expect(actionRuntime).not.toContain('invalidate();');
    expect(actionRuntime).not.toMatch(/invalidate\([^)]*dirtyRegions[^)]*\)\s*;\s*else\s+invalidate/);
  });

  it('规范化会去重、过滤未知区域，并让 all 覆盖局部声明', function () {
    expect(normalizeDirtyRegions(['hud', 'unknown', 'hud', 'guide'])).toEqual(['hud', 'guide']);
    expect(normalizeDirtyRegions({ dirtyRegions: ['fleet', 'all', 'guide'] })).toEqual(['all']);
    expect(normalizeDirtyRegions(null, 'archive')).toEqual(['archive']);
    expect(resolveDirtyRegions()).toEqual(DEFAULT_ACTION_DIRTY_REGIONS);
    expect(resolveDirtyRegions([])).toEqual(DEFAULT_ACTION_DIRTY_REGIONS);
    expect(resolveDirtyRegions(['unknown'])).toEqual(DEFAULT_ACTION_DIRTY_REGIONS);
    expect(resolveDirtyRegions(UI_REGION.ALL)).toEqual([UI_REGION.ALL]);
  });

  it('非领域动作按导航、引导、身份与成就建立最小影响矩阵', function () {
    expect(GUIDANCE_ONLY_PRESENTATION.dirtyRegions).toEqual([UI_REGION.GUIDE]);
    expect(NAVIGATION_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.SCENE,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(COMPANY_IDENTITY_PRESENTATION.dirtyRegions).toEqual([UI_REGION.HUD]);
    expect(ACHIEVEMENT_UNLOCK_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.HUD,
      UI_REGION.ARCHIVE_ACHIEVEMENT,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(MARKET_SPOT_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.MARKET_SPOT,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(MARKET_CAPITAL_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.MARKET_CAPITAL,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(MARKET_OPERATIONS_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.MARKET_OPERATIONS,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(FLEET_HANGAR_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.FLEET_HANGAR,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(ARCHIVE_QUEST_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.ARCHIVE_QUEST,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(ARCHIVE_EXPLORATION_FOCUS_PRESENTATION.dirtyRegions).toEqual([
      UI_REGION.ARCHIVE_EXPLORATION,
      UI_REGION.CONTEXT,
      UI_REGION.GUIDE,
    ]);
    expect(getMarketFocusPresentation('capital')).toBe(MARKET_CAPITAL_FOCUS_PRESENTATION);
    expect(getMarketFocusPresentation('operations')).toBe(MARKET_OPERATIONS_FOCUS_PRESENTATION);
    expect(getMarketFocusPresentation('unknown')).toBe(MARKET_SPOT_FOCUS_PRESENTATION);
  });

  it('core controller 不得重新引入无参数 invalidate 或 updateUI fallback', function () {
    var coreDirectory = new URL('../js/core/', import.meta.url);
    var coreFiles = readdirSync(coreDirectory)
      .filter(function (fileName) { return fileName.endsWith('.js'); });
    var invalidateOffenders = coreFiles
      .filter(function (fileName) {
        return /\binvalidate\(\s*\)/.test(readFileSync(new URL(fileName, coreDirectory), 'utf8'));
      });
    var updateUiOffenders = coreFiles
      .filter(function (fileName) { return fileName.endsWith('.js'); })
      .filter(function (fileName) {
        var source = readFileSync(new URL(fileName, coreDirectory), 'utf8');
        return /\bupdateUI\(\s*\)/.test(source)
          || /_call\([^,\n]+,\s*['"]updateUI['"]\s*\)/.test(source);
      });

    expect(invalidateOffenders).toEqual([]);
    expect(updateUiOffenders).toEqual([]);

    var applicationSource = readFileSync('js/core/GameApplication.js', 'utf8');
    var sessionFactoriesSource = readFileSync('js/core/GameSessionRuntimeFactories.js', 'utf8');
    expect(applicationSource).toContain('invalidate(resolveDirtyRegions(regions))');
    expect(applicationSource).not.toContain('typeof regions === \'undefined\'');
    expect(sessionFactoriesSource).toContain('render: function () { updateUI(UI_REGION.ALL); }');
    [
      'js/core/GameGuidanceRuntimeFactory.js',
      'js/core/GameFeatureRuntimeFactories.js',
      'js/core/GameUiRuntimeFactory.js',
    ].forEach(function (fileName) {
      expect(readFileSync(fileName, 'utf8')).toContain('updateUI(resolveDirtyRegions(regions))');
    });
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
