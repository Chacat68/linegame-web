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
