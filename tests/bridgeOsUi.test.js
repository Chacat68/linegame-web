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

    expect(surfaces).toContain('#map-container > #market-overlay.market-overlay');
    expect(surfaces).toContain('top: var(--ui-space-4) !important');
    expect(surfaces).toContain('max-width: none !important');
    expect(surfaces).toContain('max-height: none !important');
    expect(responsive).toContain('body:has(#market-overlay:not(.hidden)) .bottom-nav');
    expect(responsive).toContain('body:has(#console-panel.panel-open) .bottom-nav');
    expect(responsive).toContain('visibility: visible !important');
    expect(responsive).toContain('max-height: 190px !important');
    expect(tokens).toContain('--ui-command-reserve: 76px');
    expect(responsive).toContain('--ui-command-reserve: 132px');
    expect(surfaces).toMatch(/#map-container > #market-overlay\.market-overlay\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(surfaces).toMatch(/#info-panel\.side-panel-overlay,[\s\S]*?padding:[\s\S]*?var\(--ui-command-reserve\)/);
    expect(responsive).toMatch(/#map-container > #market-overlay\.market-overlay\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
    expect(shell).toMatch(/#context-inspector\.context-inspector:not\(\[data-workspace-id="map"\]\)\s*\{[\s\S]*?bottom:\s*calc\([\s\S]*?var\(--ui-command-reserve\)/);
  });

  it('ships communications as the same terminal surface as archive and hangar', function () {
    var html = read('index.html');
    var surfaces = read('css/surfaces.css');

    expect(html).toContain('id="console-panel"');
    expect(html).toContain('class="secondary-terminal-shell secondary-terminal-shell--logs"');
    expect(html).toContain('role="log"');
    expect(html).toContain('id="console-panel-close"');
    expect(surfaces).toContain('#console-panel.side-panel-overlay');
    expect(surfaces).toContain('.logs-terminal-body');
    expect(surfaces).toMatch(/#console-panel\.side-panel-overlay\.panel-open \.secondary-terminal-shell\s*\{[^}]*opacity:\s*1/);
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
    expect(surfaces).toContain('#trade-panel .trade-panel-toggle.secondary-terminal-close');
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
