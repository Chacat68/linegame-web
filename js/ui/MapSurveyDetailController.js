// js/ui/MapSurveyDetailController.js — 地图探索 L4 renderer 与导航 intent 适配器

import {
  MAP_SURVEY_INTENT,
  buildMapSurveyArchiveView,
  buildMapSurveyReportView,
  createMapSurveyReportDetailId,
  getMapSurveyLauncherReturnSelector,
  getMapSurveyReportReturnSelector,
  normalizeMapSurveyIntent,
  parseMapSurveyReportDetailId,
} from './MapSurveyDetailPresenter.js';

function _required(options, name) {
  if (!options || typeof options[name] !== 'function') {
    throw new TypeError('MapSurveyDetailController requires ' + name + '().');
  }
  return options[name];
}

export function createMapSurveyDetailController(options) {
  var opts = options || {};
  var surface = opts.surface;
  if (!surface || typeof surface.registerRenderer !== 'function' ||
      typeof surface.open !== 'function' || typeof surface.close !== 'function') {
    throw new TypeError('MapSurveyDetailController requires a detail surface port.');
  }

  var getState = _required(opts, 'getState');
  var getRevision = _required(opts, 'getRevision');
  var findSystem = _required(opts, 'findSystem');
  var getSurveySummary = _required(opts, 'getSurveySummary');
  var getMarketAction = _required(opts, 'getMarketAction');
  var openMarket = _required(opts, 'openMarket');
  var releaseArchiveRenderer = null;
  var releaseReportRenderer = null;
  var registered = false;

  function _handleIntent(action, systemId) {
    var intent = normalizeMapSurveyIntent(action, systemId);
    if (!intent) return false;

    if (intent.type === MAP_SURVEY_INTENT.OPEN_MARKET) {
      surface.close();
      openMarket(action.state || getState(), intent.systemId, {
        workspaceId: intent.workspaceId,
        subworkspaceId: intent.subworkspaceId,
        marketMode: intent.marketMode,
      });
      return true;
    }

    return surface.open({
      type: 'map-report',
      id: createMapSurveyReportDetailId(systemId, intent.reportId),
      workspaceId: 'map',
      source: 'survey-archive',
      revision: getRevision(),
    }, {
      triggerElement: action.target,
      returnFocusSelector: getMapSurveyReportReturnSelector(intent.reportId),
    });
  }

  function _renderArchive(request) {
    var detail = request && request.detail;
    var state = request && request.state ? request.state : getState();
    var container = request && request.container;
    var systemId = detail && detail.id;
    var system = findSystem(systemId);
    var summary = state && systemId ? getSurveySummary(state, systemId) : null;
    var view = buildMapSurveyArchiveView({
      system: system,
      summary: summary,
      marketAction: getMarketAction(state, systemId),
    });
    if (!container || !view) return false;

    container.innerHTML = view.html;
    return {
      title: view.title,
      onAction: function (action) { return _handleIntent(action, systemId); },
    };
  }

  function _renderReport(request) {
    var detail = request && request.detail;
    var state = request && request.state ? request.state : getState();
    var container = request && request.container;
    var parsed = detail ? parseMapSurveyReportDetailId(detail.id) : null;
    var system = parsed ? findSystem(parsed.systemId) : null;
    var summary = state && parsed ? getSurveySummary(state, parsed.systemId) : null;
    var view = buildMapSurveyReportView({
      system: system,
      summary: summary,
      reportId: parsed && parsed.reportId,
    });
    if (!container || !view) return false;

    container.innerHTML = view.html;
    return { title: view.title };
  }

  function register() {
    if (registered) return false;
    registered = true;
    releaseArchiveRenderer = surface.registerRenderer('map-survey', _renderArchive);
    releaseReportRenderer = surface.registerRenderer('map-report', _renderReport);
    return true;
  }

  function open(systemId, triggerElement) {
    if (!systemId) return false;
    return surface.open({
      type: 'map-survey',
      id: systemId,
      workspaceId: 'map',
      source: 'map-context',
      revision: getRevision(),
    }, {
      triggerElement: triggerElement,
      returnFocusSelector: getMapSurveyLauncherReturnSelector(systemId),
    });
  }

  function dispose() {
    if (!registered) return false;
    registered = false;
    if (typeof releaseArchiveRenderer === 'function') releaseArchiveRenderer();
    if (typeof releaseReportRenderer === 'function') releaseReportRenderer();
    releaseArchiveRenderer = null;
    releaseReportRenderer = null;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({ registered: registered });
  }

  return Object.freeze({
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    open: open,
    register: register,
  });
}
