// js/core/ActionPresentation.js — 动作提交后的视图失效契约
//
// 领域系统不依赖 UI。动作编排层只声明哪些投影已失效，具体如何渲染
// 由 GameUiCoordinator 决定。这样成功动作无需再触发所有已加载终端重绘。

export const UI_REGION = Object.freeze({
  ALL: 'all',
  SHELL: 'shell',
  SHIP: 'ship',
  ACTIVE_WORKSPACE: 'active-workspace',
  MARKET: 'market',
  MARKET_CHROME: 'market-chrome',
  MARKET_SPOT: 'market-spot',
  MARKET_CAPITAL: 'market-capital',
  MARKET_OPERATIONS: 'market-operations',
  FLEET: 'fleet',
  FLEET_HANGAR: 'fleet-hangar',
  FLEET_SHOP: 'fleet-shop',
  ARCHIVE: 'archive',
  ARCHIVE_QUEST: 'archive-quest',
  ARCHIVE_EXPLORATION: 'archive-exploration',
  ARCHIVE_RESEARCH: 'archive-research',
  ARCHIVE_FACTION: 'archive-faction',
  ARCHIVE_ACHIEVEMENT: 'archive-achievement',
  SAVE: 'save',
  SCENE: 'scene',
  CONTEXT: 'context',
  DISPATCH: 'dispatch',
  GUIDE: 'guide',
});

const VALID_REGIONS = new Set(Object.values(UI_REGION));

export const DEFAULT_ACTION_DIRTY_REGIONS = Object.freeze([
  UI_REGION.SHELL,
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

export function resolveDirtyRegions(value, fallback) {
  var fallbackValue = typeof fallback === 'undefined' ? DEFAULT_ACTION_DIRTY_REGIONS : fallback;
  var normalized = normalizeDirtyRegions(value, fallbackValue);
  if (normalized.length > 0) return normalized;
  var normalizedFallback = normalizeDirtyRegions(fallbackValue, DEFAULT_ACTION_DIRTY_REGIONS);
  return normalizedFallback.length > 0 ? normalizedFallback : DEFAULT_ACTION_DIRTY_REGIONS;
}

export function createActionPresentation(dirtyRegions) {
  return Object.freeze({
    dirtyRegions: normalizeDirtyRegions(dirtyRegions, DEFAULT_ACTION_DIRTY_REGIONS),
  });
}

export const DEFAULT_ACTION_PRESENTATION = createActionPresentation(DEFAULT_ACTION_DIRTY_REGIONS);

export const GUIDANCE_ONLY_PRESENTATION = createActionPresentation([UI_REGION.GUIDE]);

export const NAVIGATION_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.SCENE,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export const COMPANY_IDENTITY_PRESENTATION = createActionPresentation([UI_REGION.SHELL]);

export const ACHIEVEMENT_UNLOCK_PRESENTATION = createActionPresentation([
  UI_REGION.SHELL,
  UI_REGION.ARCHIVE_ACHIEVEMENT,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

// Command Slot 的工作区导航只改变被打开的局部 presenter、Context 与 Guide。
// 它不修改飞船/经济状态，因此不能借用领域动作 presentation 触发 Shell、Ship、
// Scene 或 Dispatch 的默认重绘。
export const MARKET_SPOT_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.MARKET_SPOT,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export const MARKET_CAPITAL_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.MARKET_CAPITAL,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export const MARKET_OPERATIONS_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.MARKET_OPERATIONS,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export const FLEET_HANGAR_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.FLEET_HANGAR,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export const ARCHIVE_QUEST_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.ARCHIVE_QUEST,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export const ARCHIVE_EXPLORATION_FOCUS_PRESENTATION = createActionPresentation([
  UI_REGION.ARCHIVE_EXPLORATION,
  UI_REGION.CONTEXT,
  UI_REGION.GUIDE,
]);

export function getMarketFocusPresentation(workspaceId) {
  if (workspaceId === 'capital') return MARKET_CAPITAL_FOCUS_PRESENTATION;
  if (workspaceId === 'operations') return MARKET_OPERATIONS_FOCUS_PRESENTATION;
  return MARKET_SPOT_FOCUS_PRESENTATION;
}

function _withWorkspaceRegions(regions) {
  var dirtyRegions = DEFAULT_ACTION_DIRTY_REGIONS.slice();
  var insertAt = dirtyRegions.indexOf(UI_REGION.ACTIVE_WORKSPACE) + 1;
  dirtyRegions.splice.apply(dirtyRegions, [insertAt, 0].concat(regions));
  return dirtyRegions;
}

// 市场中现金、货舱、公司成长与经营资格互相影响。交易、融资与有成本的
// 站点动作必须同步四个真实端口；纯经营策略切换只使贸易站投影失效。
export const MARKET_ECONOMY_ACTION_PRESENTATION = createActionPresentation(
  _withWorkspaceRegions([
    UI_REGION.MARKET_CHROME,
    UI_REGION.MARKET_SPOT,
    UI_REGION.MARKET_CAPITAL,
    UI_REGION.MARKET_OPERATIONS,
  ])
);

export const MARKET_OPERATIONS_ACTION_PRESENTATION = createActionPresentation(
  _withWorkspaceRegions([UI_REGION.MARKET_OPERATIONS])
);

// Fleet 的主机库与采购页已经拥有独立 presenter/render 入口。动作仍保留
// ACTIVE_WORKSPACE，让从其他入口触发的动作可以刷新当前工作区；当 Fleet
// 自身处于活动态时，GameUiCoordinator 会优先使用这里声明的内部区域。
export const FLEET_HANGAR_ACTION_PRESENTATION = createActionPresentation(
  _withWorkspaceRegions([UI_REGION.FLEET_HANGAR])
);

export const FLEET_HANGAR_SHOP_ACTION_PRESENTATION = createActionPresentation(
  _withWorkspaceRegions([UI_REGION.FLEET_HANGAR, UI_REGION.FLEET_SHOP])
);

export const ARCHIVE_RESEARCH_ACTION_PRESENTATION = createActionPresentation(
  _withWorkspaceRegions([UI_REGION.ARCHIVE_RESEARCH])
);

export const ARCHIVE_QUEST_ACTION_PRESENTATION = createActionPresentation(
  _withWorkspaceRegions([UI_REGION.ARCHIVE_QUEST])
);
