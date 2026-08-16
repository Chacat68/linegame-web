// js/core/ActionPresentation.js — 动作提交后的视图失效契约
//
// 领域系统不依赖 UI。动作编排层只声明哪些投影已失效，具体如何渲染
// 由 GameUiCoordinator 决定。这样成功动作无需再触发所有已加载终端重绘。

export const UI_REGION = Object.freeze({
  ALL: 'all',
  HUD: 'hud',
  SHIP: 'ship',
  ACTIVE_WORKSPACE: 'active-workspace',
  MARKET: 'market',
  FLEET: 'fleet',
  ARCHIVE: 'archive',
  SAVE: 'save',
  SCENE: 'scene',
  CONTEXT: 'context',
  DISPATCH: 'dispatch',
  GUIDE: 'guide',
});

const VALID_REGIONS = new Set(Object.values(UI_REGION));

export const DEFAULT_ACTION_DIRTY_REGIONS = Object.freeze([
  UI_REGION.HUD,
  UI_REGION.SHIP,
  UI_REGION.ACTIVE_WORKSPACE,
  UI_REGION.SCENE,
  UI_REGION.CONTEXT,
  UI_REGION.DISPATCH,
  UI_REGION.GUIDE,
]);

function _source(value) {
  if (Array.isArray(value) || typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.dirtyRegions) || typeof value.dirtyRegions === 'string') {
      return value.dirtyRegions;
    }
    if (value.presentation) return _source(value.presentation);
  }
  return null;
}

export function normalizeDirtyRegions(value, fallback) {
  var source = _source(value);
  if (source === null) source = _source(fallback);
  var entries = Array.isArray(source) ? source : (typeof source === 'string' ? [source] : []);
  var normalized = [];

  entries.forEach(function (entry) {
    if (typeof entry !== 'string') return;
    var region = entry.trim();
    if (!VALID_REGIONS.has(region) || normalized.indexOf(region) !== -1) return;
    normalized.push(region);
  });

  return normalized.indexOf(UI_REGION.ALL) !== -1
    ? Object.freeze([UI_REGION.ALL])
    : Object.freeze(normalized);
}

export function createActionPresentation(dirtyRegions) {
  return Object.freeze({
    dirtyRegions: normalizeDirtyRegions(dirtyRegions, DEFAULT_ACTION_DIRTY_REGIONS),
  });
}

export const DEFAULT_ACTION_PRESENTATION = createActionPresentation(DEFAULT_ACTION_DIRTY_REGIONS);
