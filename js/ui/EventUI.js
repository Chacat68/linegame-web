// js/ui/EventUI.js — 随机事件 pending 会话与 Surface Controller 兼容门面

import { createEventSurfaceController } from './EventSurfaceController.js';

const _eventSurfaceController = createEventSurfaceController();
let _pendingEvent = null;
let _pendingOnChoice = null;

export function showEvent(event, onChoice) {
  if (!event || typeof event !== 'object') return false;
  var displayedEvent = event;
  var callback = typeof onChoice === 'function' ? onChoice : null;
  _pendingEvent = displayedEvent;
  _pendingOnChoice = callback;
  return _eventSurfaceController.show(displayedEvent, function (choiceIndex, choice) {
    if (_pendingEvent === displayedEvent) {
      _pendingEvent = null;
      _pendingOnChoice = null;
    }
    if (!choice.fallbackClose && callback) callback(choiceIndex);
  });
}

export function hideEvent() {
  return _eventSurfaceController.hide();
}

export function setPendingEvent(event, onChoice) {
  _pendingEvent = event || null;
  _pendingOnChoice = typeof onChoice === 'function' ? onChoice : null;
  return _pendingEvent;
}

export function getPendingEvent() {
  return _pendingEvent;
}

export function hasPendingEvent() {
  return _pendingEvent != null;
}

export function forcePendingEvent() {
  if (!_pendingEvent) return false;
  return showEvent(_pendingEvent, _pendingOnChoice);
}

export function clearPendingEvent() {
  hideEvent();
  _pendingEvent = null;
  _pendingOnChoice = null;
}

export function dispose() {
  _pendingEvent = null;
  _pendingOnChoice = null;
  _eventSurfaceController.dispose();
  return true;
}

export function getDiagnostics() {
  return Object.freeze({
    hasPendingEvent: hasPendingEvent(),
    pendingEventId: _pendingEvent && _pendingEvent.id != null ? String(_pendingEvent.id) : null,
    surface: _eventSurfaceController.getDiagnostics(),
  });
}
