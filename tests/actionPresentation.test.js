import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTION_DIRTY_REGIONS,
  DEFAULT_ACTION_PRESENTATION,
  UI_REGION,
  createActionPresentation,
  normalizeDirtyRegions,
} from '../js/core/ActionPresentation.js';

describe('ActionPresentation', function () {
  it('默认动作只失效可见投影，不要求重绘隐藏终端或存档面板', function () {
    var gameManager = readFileSync('js/core/GameApplication.js', 'utf8') + '\n' +
      readFileSync('js/core/GameRuntimeNodeFactories.js', 'utf8');
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
    expect(actionRuntime).toContain('invalidate(DEFAULT_ACTION_DIRTY_REGIONS)');
    expect(actionRuntime).toContain('normalizeDirtyRegions(presentation)');
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
});
