import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('Bridge OS global UI contracts', function () {
  it('loads the canonical design layers last and in dependency order', function () {
    var entry = read('css/style.css');
    var tokens = entry.indexOf('@import url("tokens.css")');
    var primitives = entry.indexOf('@import url("primitives.css")');
    var surfaces = entry.indexOf('@import url("surfaces.css")');
    var responsive = entry.indexOf('@import url("bridge-responsive.css")');
    var globalShell = entry.indexOf('@import url("global-shell-v2.css")');

    expect(tokens).toBeGreaterThan(-1);
    expect(primitives).toBeGreaterThan(tokens);
    expect(surfaces).toBeGreaterThan(primitives);
    expect(responsive).toBeGreaterThan(surfaces);
    expect(globalShell).toBeGreaterThan(responsive);
    expect(entry.trim().endsWith('@import url("global-shell-v2.css");')).toBe(true);
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
    expect(responsive).toContain('body:has(.modal:not(.hidden)) .bottom-nav');
    expect(responsive).toContain('max-height: 190px !important');
    expect(tokens).toContain('--ui-command-reserve: 76px');
    expect(responsive).toContain('--ui-command-reserve: 132px');
    expect(surfaces).toMatch(/#market-overlay\.workspace-surface--trade\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(surfaces).toMatch(/\.workspace-surface\.workspace-surface--archive,[\s\S]*?padding:[\s\S]*?var\(--ui-command-reserve\)/);
    expect(responsive).toMatch(/#market-overlay\.workspace-surface--trade\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(shell).toMatch(/#context-inspector\.context-inspector:not\(\[data-workspace-id="map"\]\)\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
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
    var market = read('css/market-terminal.css');
    var fleet = read('css/fleet.css');

    expect(legacy).toContain('--starmap-rail-size: var(--ui-control-lg, 44px)');
    expect(legacy).not.toContain('--starmap-rail-size: 38px');
    expect(legacy).not.toContain('--starmap-rail-size: 36px');
    expect(legacy).not.toMatch(/\.market-spot-intel-grid,[\s\S]{0,600}grid-template-columns:\s*1fr !important/);
    expect(responsive).toContain('.starmap-control-rail .starmap-rail-btn');
    expect(responsive).toMatch(/#action-guide \.action-guide-primary\.command-action-btn\s*\{[^}]*min-height:\s*var\(--ui-control-lg\)/);
    expect(market).toMatch(/\.market-workspace-v2 \.kline-range-btn,[\s\S]*?min-height:\s*var\(--ui-control-lg\)/);
    expect(surfaces).toContain('#trade-panel .trade-panel-toggle.workspace-terminal-close');
    expect(surfaces).toContain('background: rgba(2, 10, 18, 0.76) !important');
    expect(fleet).not.toContain('.market-close-btn {');
  });

  it('keeps the mobile Context Inspector above the command slot and resets legacy detail positioning', function () {
    var shell = read('css/global-shell-v2.css');

    expect(shell).toMatch(/@media \(max-width: 620px\)[\s\S]*?#context-inspector\.context-inspector\s*\{[^}]*top:\s*calc\(var\(--ui-control-lg\)[^}]*bottom:\s*auto/);
    expect(shell).toMatch(/@media \(max-width: 620px\)[\s\S]*?#context-inspector\.context-inspector:not\(\[data-workspace-id="map"\]\)\s*\{[^}]*top:\s*calc\(var\(--ui-control-lg\)[^}]*bottom:\s*auto/);
    expect(shell).toMatch(/@media \(max-width: 700px\), \(max-height: 620px\)[\s\S]*?#context-inspector #planet-detail-panel\.visible,[\s\S]*?left:\s*auto !important;[\s\S]*?bottom:\s*auto !important;[\s\S]*?width:\s*100% !important;/);
  });
});
