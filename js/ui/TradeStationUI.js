// js/ui/TradeStationUI.js — 旧贸易站入口兼容层

import * as MarketUI from './MarketUI.js';

export const LEGACY_TRADE_STATION_UI_NOTICE = 'TradeStationUI 已并入 MarketUI，保留此文件仅用于兼容旧导入。';

export function getCompatibilityNotice() {
	return LEGACY_TRADE_STATION_UI_NOTICE;
}

export function render() {
	return MarketUI.render.apply(null, arguments);
}

export function showDetail(systemId, marketMode) {
	return MarketUI.showDetail(systemId, marketMode);
}
