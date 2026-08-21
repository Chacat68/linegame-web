// js/core/GameUiRuntimeFactory.js — eager UI 壳与延迟工作区节点装配

import * as Trade from '../systems/trade/TradeSystem.js';
import * as Tutorial from '../systems/tutorial/TutorialSystem.js';
import * as Renderer3D from '../ui/StarmapRenderer.js';
import * as HUD from '../ui/HUD.js';
import * as ShipUI from '../ui/ShipUI.js';
import * as MapUI from '../ui/MapUI.js';
import * as Modal from '../ui/Modal.js';
import * as ContextInspector from '../ui/ContextInspector.js';
import * as DeferredFeatureStatusUI from '../ui/DeferredFeatureStatusUI.js';
import * as WorkspaceDetailSurface from '../ui/WorkspaceDetailSurface.js';
import * as UIManager from '../ui/UIManager.js';
import * as Dispatch from './DispatchController.js';
import { DIFFICULTY_LEVELS } from '../data/constants.js';
import { SYSTEMS } from '../data/systems.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, resolveDirtyRegions } from './ActionPresentation.js';
import { createGameUiApplicationRuntime } from './GameUiApplicationRuntime.js';
import {
  bindBlockingSurfaceDismiss,
  hideBlockingSurface,
  showBlockingSurface,
} from '../ui/SurfaceManager.js';

export function createGameUiRuntimeFactory(context) {
  var resolve = context.resolve;
  var getState = context.getState;
  var getSettings = context.getSettings;
  var getRevision = context.getRevision;
  var getSessionToken = context.getSessionToken;
  var isSessionTokenCurrent = context.isSessionTokenCurrent;
  var updateUI = context.updateUI;
  var emitLog = context.emitLog;

  function _getFeatureRuntime() { return resolve('features'); }
  function _getGameLoopRuntime() { return resolve('gameLoop'); }
  function _getActionRuntime() { return resolve('actions'); }
  function _getGuidanceRuntime() { return resolve('guidance'); }
  function _getVictoryController() { return resolve('victory'); }
  function _getPersistenceController() { return resolve('persistence'); }

  function _setDeferredUiState(surface, state) {
    if (typeof document === 'undefined' || !document.body || !document.body.dataset) return;
    document.body.dataset[surface + 'UiState'] = state;
  }

  return {
    ui: function () {
      return createGameUiApplicationRuntime({
        getState: getState,
        getRevision: getRevision,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        features: _getFeatureRuntime(),
        events: context.events,
        ui: {
          HUD: HUD,
          ShipUI: ShipUI,
          MapUI: MapUI,
          UIManager: UIManager,
          Modal: Modal,
          Renderer: Renderer3D,
          ContextInspector: ContextInspector,
          DeferredFeatureStatusUI: DeferredFeatureStatusUI,
          WorkspaceDetailSurface: WorkspaceDetailSurface,
        },
        systems: {
          Trade: Trade,
          Dispatch: Dispatch,
          Tutorial: Tutorial,
          systems: SYSTEMS,
        },
        services: {
          getActionRuntime: _getActionRuntime,
          getGuidanceRuntime: _getGuidanceRuntime,
          getPersistenceController: _getPersistenceController,
          getVictoryController: _getVictoryController,
        },
        callbacks: {
          getSettings: getSettings,
          bindSettingsStatusSurfaceDismiss: function (onDismiss) {
            return bindBlockingSurfaceDismiss('settings-modal', { onDismiss: onDismiss });
          },
          showSettingsStatusSurface: function () {
            return showBlockingSurface('settings-modal', {
              focusSelector: '[data-deferred-feature-status="settings"]',
            });
          },
          hideSettingsSurface: function () { return hideBlockingSurface('settings-modal'); },
          onDifficultyChanged: function (nextDifficulty) {
            if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
            var state = getState();
            if (state) state.difficulty = nextDifficulty;
            updateUI(DEFAULT_ACTION_DIRTY_REGIONS);
          },
          onRealtimeDayDurationChanged: function (nextDurationMs) {
            _getGameLoopRuntime().handleDayDurationChange(nextDurationMs);
          },
          onResetTutorial: function () {
            _getPersistenceController().restart('settings-tutorial-reset');
          },
          onClearSaves: function () { return _getPersistenceController().clearAllSlots(); },
          emitLog: emitLog,
          invalidate: function (regions) { updateUI(resolveDirtyRegions(regions)); },
          setTelemetryState: _setDeferredUiState,
          refuel: function () { return _getActionRuntime().trade.refuel(); },
          travel: function (systemId) { return _getActionRuntime().travel.travel(systemId); },
          galaxyJump: function (systemId) { return _getActionRuntime().travel.travel(systemId); },
          explorePoi: function (systemId, poiId) {
            return _getActionRuntime().exploration.explorePoi(systemId, poiId);
          },
          getPoiStatus: function (systemId, poiId) {
            return _getActionRuntime().exploration.getPoiStatus(systemId, poiId);
          },
          confirmTrade: function () { return _getActionRuntime().trade.confirm.apply(null, arguments); },
        },
      });
    },
  };
}
