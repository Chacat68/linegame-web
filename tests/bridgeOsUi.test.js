import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function readAllCss(exclude) {
  var excluded = new Set(exclude || []);
  return readdirSync(new URL('../css/', import.meta.url))
    .filter(function (name) { return name.endsWith('.css') && !excluded.has(name); })
    .map(function (name) { return read('css/' + name); })
    .join('\n');
}

describe('Bridge OS global UI contracts', function () {
  it('loads the canonical design layers last and in dependency order', function () {
    var entry = read('css/style.css');
    var tokens = entry.indexOf('@import url("tokens.css")');
    var primitives = entry.indexOf('@import url("primitives.css")');
    var surfaces = entry.indexOf('@import url("surfaces.css")');
    var responsive = entry.indexOf('@import url("bridge-responsive.css")');
    var contextInspector = entry.indexOf('@import url("context-inspector.css")');
    var workspaceDetail = entry.indexOf('@import url("workspace-detail.css")');
    var starmapControls = entry.indexOf('@import url("starmap-controls.css")');
    var globalShell = entry.indexOf('@import url("global-shell-v2.css")');
    var saveWorkspace = entry.indexOf('@import url("save-workspace.css")');

    expect(tokens).toBeGreaterThan(-1);
    expect(primitives).toBeGreaterThan(tokens);
    expect(surfaces).toBeGreaterThan(primitives);
    expect(responsive).toBeGreaterThan(surfaces);
    expect(contextInspector).toBeGreaterThan(responsive);
    expect(workspaceDetail).toBeGreaterThan(contextInspector);
    expect(starmapControls).toBeGreaterThan(workspaceDetail);
    expect(globalShell).toBeGreaterThan(starmapControls);
    expect(saveWorkspace).toBeGreaterThan(globalShell);
    expect(entry.trim().endsWith('@import url("save-workspace.css");')).toBe(true);
  });

  it('defines one semantic token source and accessibility primitives', function () {
    var tokens = read('css/tokens.css');
    var primitives = read('css/primitives.css');

    expect(tokens).toContain('--ui-bg-canvas: #02060b');
    expect(tokens).toContain('--ui-text-primary: #edf8ff');
    expect(tokens).toContain('--ui-accent: #6ce7ff');
    expect(tokens).toContain('--ui-commerce: #ffb86b');
    expect(tokens).toContain('--ui-control-lg: 44px');
    expect(tokens).toContain('--ui-z-modal: 140');
    expect(primitives).toContain(':focus-visible');
    expect(primitives).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps global navigation reachable around responsive workspaces', function () {
    var tokens = read('css/tokens.css');
    var surfaces = read('css/surfaces.css');
    var responsive = read('css/bridge-responsive.css');
    var contextInspector = read('css/context-inspector.css');
    var shell = read('css/global-shell-v2.css');
    var legacyNavigation = [
      'css/status.css',
      'css/responsive.css',
      'css/interstellar-trader.css',
    ].map(read).join('\n');

    expect(legacyNavigation).not.toMatch(/#bottom-nav|\.bottom-nav/);
    expect(surfaces).toContain('.bottom-nav {');
    expect(surfaces).toContain('.bottom-nav::before,');
    expect(surfaces).toContain('.bottom-nav-btn[aria-current="page"]::after');
    expect(surfaces).toContain('.bottom-nav-badge[hidden]');
    expect(surfaces).toContain('body.starmap-galaxy-mode .bottom-nav');
    expect(surfaces).toContain('#market-overlay.workspace-surface--trade');
    expect(surfaces).toContain('top: calc(var(--ui-header-height) + var(--ui-space-4)) !important');
    expect(surfaces).toContain('max-width: none !important');
    expect(surfaces).toContain('max-height: none !important');
    expect(responsive).toContain('body:has(.workspace-surface:not(.workspace-surface--map).is-active) .bottom-nav');
    expect(responsive).toContain('visibility: visible !important');
    expect(responsive.match(/top: calc\(var\(--ui-header-height\) \+ max\(var\(--ui-space-2\), var\(--ui-safe-top\)\)\) !important/g)).toHaveLength(2);
    expect(responsive).toContain('body:has(.modal:not(.hidden)) .bottom-nav');
    expect(responsive).toContain('max-height: 190px !important');
    expect(tokens).toContain('--ui-command-reserve: 76px');
    expect(responsive).toContain('--ui-command-reserve: 132px');
    expect(surfaces).toMatch(/#market-overlay\.workspace-surface--trade\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(surfaces).toMatch(/\.workspace-surface\.workspace-surface--archive,[\s\S]*?padding:[\s\S]*?var\(--ui-command-reserve\)/);
    expect(responsive).toMatch(/#market-overlay\.workspace-surface--trade\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(contextInspector).toMatch(/#context-inspector\.context-inspector:not\(\[data-workspace-id="map"\]\)\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(shell).toContain('body:has(#context-inspector:not([hidden])) .floating-command-stack');
  });

  it('ships communications as the same terminal surface as archive and hangar', function () {
    var html = read('index.html');
    var surfaces = read('css/surfaces.css');

    expect(html).toContain('id="console-panel"');
    expect(html).toContain('class="workspace-terminal-shell workspace-terminal-shell--logs"');
    expect(html).toContain('role="log"');
    expect(html).toContain('id="console-panel-close"');
    expect(surfaces).toContain('.workspace-surface.workspace-surface--logs');
    expect(surfaces).toContain('.logs-terminal-body');
    expect(surfaces).toMatch(/\.workspace-surface--logs\.is-active \.workspace-terminal-shell\s*\{[^}]*opacity:\s*1/);
  });

  it('keeps all five desktop header groups in one row below the wide breakpoint', function () {
    var responsive = read('css/bridge-responsive.css');

    expect(responsive).toMatch(/@media \(max-width: 1360px\)[\s\S]*?#game-header\s*\{[^}]*grid-template-columns:\s*auto minmax\(280px, 1fr\) minmax\(250px, 0\.8fr\) auto auto/);
  });

  it('keeps mobile controls at 44px and treats terminal close actions as neutral', function () {
    var legacy = read('css/interstellar-trader.css');
    var surfaces = read('css/surfaces.css');
    var responsive = read('css/bridge-responsive.css');
    var starmapControls = read('css/starmap-controls.css');
    var market = read('css/market-terminal.css');
    var fleet = read('css/fleet.css');

    expect(legacy).not.toMatch(/\.market-spot-intel-grid,[\s\S]{0,600}grid-template-columns:\s*1fr !important/);
    expect(starmapControls).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.starmap-map-tool\s*\{[^}]*min-height:\s*var\(--ui-control-lg\)/);
    expect(responsive).toMatch(/#action-guide \.action-guide-primary\.command-action-btn\s*\{[^}]*min-height:\s*var\(--ui-control-lg\)/);
    expect(responsive).toMatch(/\.workspace-terminal-shell:not\(\.workspace-terminal-shell--logs\) \.workspace-terminal-chrome\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/);
    expect(responsive).toMatch(/\.workspace-terminal-shell:not\(\.workspace-terminal-shell--logs\) \.workspace-context-toggle\s*\{[^}]*grid-column:\s*2/);
    expect(responsive).toMatch(/\.workspace-terminal-shell:not\(\.workspace-terminal-shell--logs\) \.workspace-terminal-close\s*\{[^}]*grid-column:\s*3/);
    expect(market).toMatch(/\.market-workspace-v2 \.kline-range-btn,[\s\S]*?min-height:\s*var\(--ui-control-lg\)/);
    expect(surfaces).toContain('#trade-panel .trade-panel-toggle.workspace-terminal-close');
    expect(surfaces).toMatch(/#trade-panel \.trade-panel-toggle\.workspace-terminal-close\s*\{[^}]*position:\s*static;[^}]*inset:\s*auto/);
    expect(surfaces).toContain('background: rgba(2, 10, 18, 0.76) !important');
    expect(fleet).not.toContain('.market-close-btn {');
  });

  it('gives active starmap tools one owner and removes the retired rail path', function () {
    var html = read('index.html');
    var mapUi = read('js/ui/MapUI.js');
    var owner = read('css/starmap-controls.css');
    var otherCss = readAllCss(['starmap-controls.css']);
    var allCss = owner + '\n' + otherCss;

    expect(owner).toContain('.starmap-map-tools {');
    expect(owner).toContain('.starmap-map-tool {');
    expect(otherCss).not.toMatch(/\.starmap-map-tools?\b/);
    expect(allCss).not.toMatch(/\.starmap-control-rail\b|\.starmap-rail-|\.map-btn-group\b|\.map-overlay-btn\b|\.map-(?:primary|secondary)-entry/);
    expect(html).not.toMatch(/starmap-rail-symbols|starmap-control-rail|map-btn-group|map-3d-toggle-btn/);
    expect(mapUi).not.toContain('map-3d-toggle-btn');
  });

  it('retires the company directives UI while preserving save compatibility', function () {
    var html = read('index.html');
    var allCss = readAllCss();
    var constants = read('js/data/constants.js');
    var saveSystem = read('js/systems/save/SaveSystem.js');

    expect(html + '\n' + allCss).not.toMatch(/company-directives-|company-directive-|company-directives-btn|data-company-directive-badge/);
    expect(constants).toContain('companyDirectiveClaims:');
    expect(saveSystem).toContain('envelope.data.companyDirectiveClaims');
  });

  it('keeps the mobile Context Inspector above the command slot and resets legacy detail positioning', function () {
    var inspector = read('css/context-inspector.css');

    expect(inspector).toMatch(/@media \(max-width: 620px\)[\s\S]*?#context-inspector\.context-inspector\s*\{[^}]*top:\s*calc\(var\(--ui-control-lg\)[^}]*bottom:\s*auto/);
    expect(inspector).toMatch(/@media \(max-width: 620px\)[\s\S]*?#context-inspector\.context-inspector:not\(\[data-workspace-id="map"\]\)\s*\{[^}]*top:\s*calc\(var\(--ui-control-lg\)[^}]*bottom:\s*auto/);
    expect(inspector).toMatch(/@media \(max-width: 620px\)[\s\S]*?#context-inspector\.context-inspector\[data-content-state="empty"\] \.context-inspector-empty\s*\{[^}]*min-height:\s*0/);
    expect(inspector).toContain('#context-inspector.context-inspector[data-content-state="empty"] .context-inspector-empty-mark');
    expect(inspector).toMatch(/@media \(max-width: 700px\), \(max-height: 620px\)[\s\S]*?#context-inspector #planet-detail-panel\.visible,[\s\S]*?left:\s*auto !important;[\s\S]*?bottom:\s*auto !important;[\s\S]*?width:\s*100% !important;/);
  });

  it('keeps Context Inspector and Workspace Detail out of the Global Shell component layer', function () {
    var inspector = read('css/context-inspector.css');
    var detail = read('css/workspace-detail.css');
    var shell = read('css/global-shell-v2.css');

    expect(inspector).toContain('#context-inspector.context-inspector');
    expect(inspector).toContain('.workspace-context-card');
    expect(inspector).not.toContain('.workspace-detail-surface');
    expect(detail).toContain('.workspace-detail-surface');
    expect(detail).toContain('.workspace-detail-report-button');
    expect(detail).not.toContain('.context-inspector-head');
    expect(shell).not.toMatch(/\.context-inspector-|\.workspace-context-|\.workspace-detail-/);
    expect(shell).toContain('body:has(#context-inspector:not([hidden])) .floating-command-stack');
  });
});
