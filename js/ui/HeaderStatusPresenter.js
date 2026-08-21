// js/ui/HeaderStatusPresenter.js — Header 全局状态与星图工具的纯 DOM 投影

import { findSystem, findGalaxy } from '../data/systems.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as PlayerLevels from '../data/playerLevels.js';

function _resolveDocument(source) {
  if (source && typeof source.getElementById === 'function') return source;
  return typeof document === 'undefined' ? null : document;
}

function _clampNumber(value, min, max) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.max(min, Math.min(max, numberValue));
}

function _setTextWithTitle(element, value) {
  if (!element) return;
  var text = String(value == null ? '' : value);
  element.textContent = text;
  if (text) element.setAttribute('title', text);
  else element.removeAttribute('title');
}

function _setMeterValue(element, value, options) {
  if (!element || typeof element.setAttribute !== 'function') return;
  var opts = options || {};
  var min = opts.min != null ? Number(opts.min) : 0;
  var max = opts.max != null ? Number(opts.max) : 100;
  var normalizedMin = Number.isFinite(min) ? min : 0;
  var normalizedMax = Number.isFinite(max) ? max : 100;
  var now = _clampNumber(value, normalizedMin, normalizedMax);

  element.setAttribute('aria-valuemin', String(normalizedMin));
  element.setAttribute('aria-valuemax', String(normalizedMax));
  element.setAttribute('aria-valuenow', String(Math.round(now)));
  if (opts.valueText) {
    element.setAttribute('aria-valuetext', opts.valueText);
    element.setAttribute('title', opts.valueText);
  } else {
    element.removeAttribute('aria-valuetext');
    element.removeAttribute('title');
  }
  if (element.dataset) element.dataset.meterState = opts.state || 'nominal';
}

function _resourceMeterState(percent, dangerWhenHigh) {
  if (dangerWhenHigh) {
    if (percent >= 95) return 'critical';
    if (percent >= 75) return 'warning';
    return 'nominal';
  }
  if (percent <= 20) return 'critical';
  if (percent <= 40) return 'warning';
  return 'nominal';
}

function _renderResourceMeters(state, doc) {
  var fuelPct = state.maxFuel > 0 ? Math.round((state.fuel / state.maxFuel) * 100) : 100;
  fuelPct = _clampNumber(fuelPct, 0, 100);
  var fuelText = '燃料 ' + (state.fuel || 0) + '/' + (state.maxFuel || 0) + '（' + fuelPct + '%）';
  var fuelFill = doc.getElementById('status-fuel-fill');
  var fuelValue = doc.getElementById('status-fuel-pct');
  if (fuelFill) fuelFill.style.width = fuelPct + '%';
  if (fuelValue) {
    fuelValue.textContent = fuelPct + '%';
    fuelValue.setAttribute('title', fuelText);
  }
  _setMeterValue(doc.getElementById('status-fuel-meter'), fuelPct, {
    valueText: fuelText,
    state: _resourceMeterState(fuelPct, false),
  });

  var currentHull = state.shipHull != null ? state.shipHull : state.maxHull;
  var hullPct = state.maxHull > 0 ? Math.round((currentHull / state.maxHull) * 100) : 100;
  hullPct = _clampNumber(hullPct, 0, 100);
  var hullText = '护盾 ' + (currentHull || 0) + '/' + (state.maxHull || 0) + '（' + hullPct + '%）';
  var hullFill = doc.getElementById('status-shield-fill');
  var hullValue = doc.getElementById('status-shield-pct');
  if (hullFill) hullFill.style.width = hullPct + '%';
  if (hullValue) {
    hullValue.textContent = hullPct + '%';
    hullValue.setAttribute('title', hullText);
  }
  _setMeterValue(doc.getElementById('status-shield-meter'), hullPct, {
    valueText: hullText,
    state: _resourceMeterState(hullPct, false),
  });

  var cargoUsed = state.cargo
    ? Object.values(state.cargo).reduce(function (sum, quantity) { return sum + quantity; }, 0)
    : 0;
  var cargoPct = state.maxCargo > 0 ? Math.round((cargoUsed / state.maxCargo) * 100) : 0;
  cargoPct = _clampNumber(cargoPct, 0, 100);
  var cargoText = '货舱 ' + cargoUsed + '/' + (state.maxCargo || 0) + '（' + cargoPct + '%）';
  var cargoFill = doc.getElementById('status-cargo-fill');
  var cargoValue = doc.getElementById('status-cargo-pct');
  if (cargoFill) cargoFill.style.width = cargoPct + '%';
  if (cargoValue) {
    cargoValue.textContent = cargoPct + '%';
    cargoValue.setAttribute('title', cargoText);
  }
  _setMeterValue(doc.getElementById('status-cargo-meter'), cargoPct, {
    valueText: cargoText,
    state: _resourceMeterState(cargoPct, true),
  });

  return Object.freeze({ cargoPct: cargoPct, cargoUsed: cargoUsed, fuelPct: fuelPct, hullPct: hullPct });
}

export function renderGalaxyViewSummary(state, documentSource, onToggleReady) {
  var doc = _resolveDocument(documentSource);
  if (!doc || !state) return false;
  var viewEl = doc.getElementById('hud-galactic-map-view');
  var focusEl = doc.getElementById('hud-galactic-map-focus');
  var captionEl = doc.getElementById('hud-galactic-map-caption');
  var toggleBtn = doc.getElementById('hud-galactic-map-toggle');
  if (!viewEl && !focusEl && !captionEl && !toggleBtn) return false;

  var system = findSystem(state.currentSystem);
  var viewingGalaxy = findGalaxy(state.viewingGalaxy || state.currentGalaxy);
  var currentGalaxy = findGalaxy(state.currentGalaxy);
  var isGalaxyView = state.mapView === 'galaxies';
  var captionText = isGalaxyView ? '返回当前星系局部视图' : '切换到跨星系跃迁总览';

  if (viewEl) viewEl.textContent = isGalaxyView ? '星系总览' : '星球视图';
  if (focusEl) {
    focusEl.textContent = isGalaxyView
      ? ((currentGalaxy ? currentGalaxy.name : '当前星系') + ' · 跃迁网络')
      : ((viewingGalaxy ? viewingGalaxy.name : '未知星系') + (system ? ' · ' + system.name : ''));
  }
  if (captionEl) captionEl.textContent = captionText;
  if (toggleBtn) {
    toggleBtn.textContent = isGalaxyView ? '回到当前星系' : '星系总览';
    toggleBtn.setAttribute('title', captionText);
    if (typeof onToggleReady === 'function') onToggleReady();
  }
  return true;
}

export function renderHeaderStatus(state, documentSource, onToggleReady) {
  var doc = _resolveDocument(documentSource);
  if (!doc || !state) return null;

  var credits = Number.isFinite(Number(state.credits)) ? Math.floor(Number(state.credits)) : 0;
  var creditsEl = doc.getElementById('credits');
  var dayEl = doc.getElementById('galactic-day');
  if (creditsEl) creditsEl.textContent = credits.toLocaleString();
  if (dayEl) dayEl.textContent = '第 ' + (Number(state.day) || 1) + ' 天';

  var meters = _renderResourceMeters(state, doc);
  var system = findSystem(state.currentSystem);
  var galaxy = findGalaxy(state.currentGalaxy || 'milky_way');
  var faction = Faction.getFactionForSystem(state.currentSystem);
  var factionTag = faction ? ' · ' + faction.icon + ' ' + faction.name : '';
  var galaxyTag = galaxy ? galaxy.icon + ' ' + galaxy.name + ' > ' : '';
  var locationText = '📍 ' + galaxyTag + system.name + factionTag;
  _setTextWithTitle(doc.getElementById('current-location'), locationText);
  var locationDesc = doc.getElementById('location-desc');
  if (locationDesc) locationDesc.textContent = system.description;
  var legendLocation = doc.getElementById('map-legend-location');
  if (legendLocation) legendLocation.textContent = locationText;

  var activeShip = Array.isArray(state.fleet) ? state.fleet[state.activeShipIndex || 0] : null;
  _setTextWithTitle(
    doc.getElementById('hdr-ship-name'),
    activeShip ? ((activeShip.emoji ? activeShip.emoji + ' ' : '') + activeShip.name) : '旗舰未配置'
  );

  var reputation = Number(state.reputation || 0);
  var repRank = PlayerLevels.getRepRank(reputation);
  var repPct = _clampNumber(Math.round((reputation + 100) / 10), 0, 100);
  var repText = repRank.name + ' ' + reputation.toLocaleString();
  var repMeterText = '公司声望 ' + repRank.name + '：' + reputation.toLocaleString();
  var repValue = doc.getElementById('hdr-reputation-value');
  var repFill = doc.getElementById('hdr-reputation-fill');
  if (repValue) {
    repValue.textContent = repText;
    repValue.setAttribute('title', repMeterText);
  }
  if (repFill) repFill.style.width = repPct + '%';
  _setMeterValue(doc.getElementById('hdr-reputation-meter'), reputation, {
    min: -100,
    max: 900,
    valueText: repMeterText,
    state: reputation < 0 ? 'critical' : (reputation < 200 ? 'warning' : 'nominal'),
  });

  renderGalaxyViewSummary(state, doc, onToggleReady);
  return Object.freeze({
    cargoPct: meters.cargoPct,
    cargoUsed: meters.cargoUsed,
    credits: credits,
    day: Number(state.day) || 1,
    fuelPct: meters.fuelPct,
    hullPct: meters.hullPct,
    locationText: locationText,
    reputation: reputation,
  });
}
