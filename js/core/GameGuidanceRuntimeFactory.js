// js/core/GameGuidanceRuntimeFactory.js — 行动引导与专题教学节点装配

import * as Economy from '../systems/economy/Economy.js';
import * as Trade from '../systems/trade/TradeSystem.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as Tutorial from '../systems/tutorial/TutorialSystem.js';
import * as Guidance from '../systems/guidance/GuidanceSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import * as ActionGuideUI from '../ui/ActionGuideUI.js';
import * as EventUI from '../ui/EventUI.js';
import * as MapUI from '../ui/MapUI.js';
import * as Modal from '../ui/Modal.js';
import * as UIManager from '../ui/UIManager.js';
import { hasBlockingSurfaceOpen } from '../ui/SurfaceManager.js';
import { resolveDirtyRegions } from './ActionPresentation.js';
import { createGameGuidanceRuntime } from './GameGuidanceRuntime.js';

export function createGameGuidanceRuntimeFactory(context) {
  var resolve = context.resolve;
  var getState = context.getState;
  var getSessionToken = context.getSessionToken;
  var isSessionTokenCurrent = context.isSessionTokenCurrent;
  var updateUI = context.updateUI;
  var emitLog = context.emitLog;

  function _getFeatureRuntime() { return resolve('features'); }
  function _getUiRuntime() { return resolve('ui'); }
  function _getActionRuntime() { return resolve('actions'); }

  return {
    guidance: function () {
      return createGameGuidanceRuntime({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        features: _getFeatureRuntime(),
        systems: {
          Economy: Economy,
          Exploration: Exploration,
          Fleet: Fleet,
          GalaxyData: GalaxyData,
          Guidance: Guidance,
          MidgameTeachingChain: MidgameTeachingChain,
          Quest: Quest,
          Trade: Trade,
          Tutorial: Tutorial,
        },
        ui: {
          ActionGuideUI: ActionGuideUI,
          EventUI: EventUI,
          MapUI: MapUI,
          Modal: Modal,
          UIManager: UIManager,
        },
        actions: {
          acceptQuest: function () { return _getActionRuntime().archive.onAcceptQuest.apply(null, arguments); },
          explorePoi: function () { return _getActionRuntime().exploration.explorePoi.apply(null, arguments); },
          getFleetActions: function () { return _getActionRuntime().fleet; },
          getPoiStatus: function () { return _getActionRuntime().exploration.getPoiStatus.apply(null, arguments); },
          refuel: function () { return _getActionRuntime().trade.refuel.apply(null, arguments); },
          travel: function () { return _getActionRuntime().travel.travel.apply(null, arguments); },
        },
        selectors: { hasBlockingSurfaceOpen: hasBlockingSurfaceOpen },
        callbacks: {
          emitLog: emitLog,
          invalidate: function (regions) { updateUI(resolveDirtyRegions(regions)); },
          renderFleet: function (FleetUI) { return _getUiRuntime().renderFleet(FleetUI); },
          reportError: function (scope, error) {
            console.error('[GameGuidanceRuntime] Failed in ' + scope + '.', error);
          },
        },
      });
    },
  };
}
