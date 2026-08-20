// js/ui/MapPanelController.js — 星图详情面板的委派事件与 UI intent 路由

function _closest(target, selector) {
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function _inside(panel, element) {
  return !!(element && (!panel || typeof panel.contains !== 'function' || panel.contains(element)));
}

function _consume(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
}

export function createMapPanelController(options) {
  var opts = options || {};

  function _handleClick(event, panel) {
    var target = event && event.target;
    var galaxyButton = _closest(target, '[data-galaxy-action]');
    if (_inside(panel, galaxyButton)) {
      _consume(event);
      var galaxyAction = galaxyButton.dataset ? galaxyButton.dataset.galaxyAction : '';
      var galaxyId = galaxyButton.dataset ? galaxyButton.dataset.galaxyId : '';
      if (galaxyAction === 'open' && typeof opts.openGalaxy === 'function') {
        opts.openGalaxy(galaxyId);
      } else if (galaxyAction === 'return-planets' && typeof opts.returnToPlanets === 'function') {
        opts.returnToPlanets();
      }
      return true;
    }

    var detailButton = _closest(target, '[data-planet-detail-action]');
    if (_inside(panel, detailButton)) {
      _consume(event);
      var detailAction = detailButton.dataset ? detailButton.dataset.planetDetailAction : '';
      var detailSystemId = detailButton.dataset ? detailButton.dataset.systemId : '';
      if (detailAction === 'close-detail' && typeof opts.closeDetail === 'function') {
        opts.closeDetail();
      } else if (detailAction === 'open-survey' && typeof opts.openSurvey === 'function') {
        opts.openSurvey(detailSystemId, detailButton);
      } else if (detailAction === 'travel' && typeof opts.travel === 'function') {
        opts.travel(detailSystemId);
      }
      return true;
    }

    var explorationButton = _closest(target, '[data-exploration-action]');
    if (!_inside(panel, explorationButton) || explorationButton.disabled) return false;
    _consume(event);
    var dataset = explorationButton.dataset || {};
    if (dataset.explorationAction === 'market' && typeof opts.openMarket === 'function') {
      opts.openMarket(dataset.systemId, {
        marketMode: dataset.marketMode || '',
        subworkspaceId: dataset.marketSubworkspaceId,
        workspaceId: dataset.marketWorkspaceId,
      });
    } else if (dataset.explorationAction === 'poi' && typeof opts.explorePoi === 'function') {
      opts.explorePoi(dataset.systemId, dataset.poiId);
    }
    return true;
  }

  function _handleDisclosureClick(event, panel) {
    var summary = _closest(event && event.target, 'summary');
    if (!_inside(panel, summary)) return false;
    var detail = summary.parentElement;
    if (!detail || detail.tagName !== 'DETAILS' || !detail.dataset || !detail.dataset.detailSection) return false;
    if (typeof opts.setDisclosure === 'function') {
      opts.setDisclosure(detail.dataset.detailSection, !detail.open);
    }
    return true;
  }

  function _handleToggle(event) {
    var target = event && event.target;
    if (!target || target.tagName !== 'DETAILS' || !target.dataset || !target.dataset.detailSection) return false;
    if (typeof opts.setDisclosure === 'function') {
      opts.setDisclosure(target.dataset.detailSection, target.open);
    }
    return true;
  }

  function _handleKeydown(event) {
    if (!event || event.key !== 'Escape') return false;
    var handled = false;
    if (typeof opts.hasSelectedSystem === 'function' && opts.hasSelectedSystem()) {
      handled = typeof opts.closeDetail === 'function' ? opts.closeDetail() !== false : false;
    } else if (typeof opts.isGalaxyView === 'function' && opts.isGalaxyView()) {
      handled = typeof opts.returnToPlanets === 'function' ? opts.returnToPlanets() !== false : false;
    }
    if (handled) _consume(event);
    return handled;
  }

  function bind(panel, listen) {
    if (!panel || !panel.dataset || panel.dataset.mapPanelControllerBound === 'true' || typeof listen !== 'function') {
      return false;
    }
    listen(panel, 'click', function (event) { _handleClick(event, panel); });
    listen(panel, 'click', function (event) { _handleDisclosureClick(event, panel); }, true);
    listen(panel, 'toggle', _handleToggle, true);
    listen(panel, 'keydown', _handleKeydown);
    panel.dataset.mapPanelControllerBound = 'true';
    return true;
  }

  return Object.freeze({
    bind: bind,
    handleClick: _handleClick,
    handleDisclosureClick: _handleDisclosureClick,
    handleKeydown: _handleKeydown,
    handleToggle: _handleToggle,
  });
}
