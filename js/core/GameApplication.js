import { prepareStartupState } from './StartupState.js';
import { createInitialState } from '../data/constants.js';
import { isMerchantViewUnlocked } from '../data/merchant.js';
import { prepareMerchantSessionState, createMerchantGameRuntime } from './MerchantGameRuntime.js';
import { saveGame } from '../systems/save/SaveSystem.js';
import * as MerchantUI from '../ui/MerchantUI.js';
import * as Renderer from '../ui/StarmapRenderer.js';
import { createMerchantTools } from '../ui/MerchantToolsUI.js';
import { loadSettings, applySettings } from './SettingsCore.js';
import * as Audio from './AudioManager.js';
import { hasBlockingSurfaceOpen } from '../ui/SurfaceManager.js';
let state = null, runtime = null, tools = null, timer = null, frame = null, active = false;
const surfaces = { tasks: 'merchant-task-workspace', ships: 'merchant-ship-workspace', starmap: 'map-section', market: 'merchant-market-workspace', reports: 'merchant-report-workspace' };
let currentView = 'tasks';
function message(text) {
  if (!text) return;
  MerchantUI.notify(text);
}
function navigate(view) {
  if (!surfaces[view]) return;
  if (!isMerchantViewUnlocked(state?.merchant, view)) view = 'tasks';
  currentView = view;
  for (const [name, id] of Object.entries(surfaces)) {
    const node = document.getElementById(id), selected = name === view;
    node.classList.toggle('is-active', selected); node.inert = !selected;
    node.setAttribute('aria-hidden', String(!selected)); node.dataset.workspaceActive = String(selected);
  }
  document.body.dataset.activeView = view;
  document.querySelectorAll('#bottom-nav [data-view]').forEach(button => {
    const selected = button.dataset.view === view; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    if (selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  document.getElementById('company-tools').open = false;
  if (!hasBlockingSurfaceOpen()) document.getElementById(surfaces[view]).querySelector('[data-workspace-initial-focus]')?.focus({preventScroll:true});
  MerchantUI.renderScene(state);
}
function persist() { const result = saveGame(0, state); MerchantUI.render(state); if (!result.ok) message(result.msg); return result; }
function begin(nextState) {
  runtime?.stop(); MerchantUI.dispose();
  state = nextState || createInitialState(); prepareMerchantSessionState(state);
  runtime = createMerchantGameRuntime({ getState: () => state, save: value => { const result = saveGame(0,value); if (!result.ok) message(result.msg); return result; } });
  MerchantUI.init({ getState: () => state, execute: (action,target) => { const result = runtime.execute(action,target); if (action !== 'onboarding' || !result.ok) { message(result.msg); Audio.playCue(result.ok ? 'success' : 'error'); } return result; }, navigate });
  runtime.start(); navigate(currentView);
}
function click(event) {
  const button = event.target.closest?.('[data-view]');
  if (button) { navigate(button.dataset.view); return; }
  if (event.target.closest?.('#settings-btn,[data-company-action="settings"]')) { event.preventDefault(); tools.open(); document.getElementById('company-tools').open = false; }
  if (event.target.closest?.('[data-company-action="saves"]')) { tools.open('saves'); document.getElementById('company-tools').open = false; }
  if (event.target.closest?.('#company-name-display')) tools.open('company');
}
function paint() { if (!active) return; MerchantUI.renderScene(state); frame = requestAnimationFrame(paint); }
export function init(_unused, options = {}) {
  shutdown();
  const startup = prepareStartupState(options);
  active = true; currentView = 'tasks';
  const settings = loadSettings(); Audio.init(settings); applySettings(settings, Renderer);
  begin(startup.state);
  tools = createMerchantTools({ getState: () => state, replaceState: begin, renderer: Renderer, persist, onMessage: message });
  document.getElementById('game-shell').addEventListener('click', click);
  timer = setInterval(() => runtime?.tick(), 500); frame = requestAnimationFrame(paint);
  if (startup.warningCode) message(startup.loadMessage);
  message(startup.restoredAutosave ? '经营进度已恢复。' : '商队已就绪。');
  return Promise.resolve(true);
}
export function shutdown(reason) {
  if (reason === 'pagehide') runtime?.tick(true);
  active = false; Audio.dispose(); if (timer !== null) clearInterval(timer); if (frame !== null) cancelAnimationFrame(frame);
  timer = frame = null; runtime?.stop(); runtime = null; tools?.dispose(); tools = null; MerchantUI.dispose();
  document.getElementById('game-shell')?.removeEventListener('click', click);
  return true;
}
