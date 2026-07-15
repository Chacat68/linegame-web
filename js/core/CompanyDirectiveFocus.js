// js/core/CompanyDirectiveFocus.js — 公司指令追踪状态，不依赖终端 UI

const STORAGE_KEY = 'linegame_company_directive_focus';
let _trackedDirectiveId = _readTrackedDirectiveId();

function _readTrackedDirectiveId() {
  try {
    if (!globalThis.localStorage) return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function getTrackedDirectiveId() {
  return _trackedDirectiveId || '';
}

export function setTrackedDirectiveId(directiveId) {
  _trackedDirectiveId = directiveId || '';
  try {
    if (!globalThis.localStorage) return _trackedDirectiveId;
    if (_trackedDirectiveId) localStorage.setItem(STORAGE_KEY, _trackedDirectiveId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // localStorage can be unavailable in tests or privacy-restricted contexts.
  }
  return _trackedDirectiveId;
}

export function _resetTrackedDirectiveFocusForTest() {
  _trackedDirectiveId = '';
}
