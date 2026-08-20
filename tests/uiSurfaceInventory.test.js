import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');
const cssDirectory = new URL('../css/', import.meta.url);
const workspaceCss = readdirSync(cssDirectory)
  .filter(function (fileName) { return fileName.endsWith('.css'); })
  .map(function (fileName) { return readFileSync(new URL(fileName, cssDirectory), 'utf8'); })
  .join('\n');

function openingTag(id) {
  const markerIndex = html.indexOf(`id="${id}"`);
  expect(markerIndex, `missing #${id}`).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<', markerIndex), html.indexOf('>', markerIndex) + 1);
}

describe('UI surface inventory', function () {
  it('keeps every blocking surface accessible and keyboard focusable', function () {
    const blockingSurfaceIds = [
      'trade-modal',
      'event-modal',
      'dialogue-modal',
      'action-confirm-modal',
      'gameover-modal',
      'dispatch-modal',
      'mod-modal',
      'crew-modal',
      'company-rename-modal',
      'tutorial-start-modal',
      'victory-modal',
      'settings-modal',
    ];

    blockingSurfaceIds.forEach(function (id) {
      const tag = openingTag(id);
      const surfaceStart = html.indexOf(tag);
      const surfaceHead = html.slice(surfaceStart, surfaceStart + 700);

      expect(tag).toContain('class="modal hidden"');
      expect(tag).toMatch(/role="(?:dialog|alertdialog)"/);
      expect(tag).toContain('aria-modal="true"');
      expect(tag).toContain('aria-labelledby=');
      expect(surfaceHead).toMatch(/class="[^"]*modal-box[^"]*" tabindex="-1"/);
    });
  });

  it('declares five canonical workspaces as focusable regions rather than parallel dialog models', function () {
    ['market-overlay', 'info-panel', 'trade-panel', 'console-panel'].forEach(function (id) {
      const tag = openingTag(id);
      expect(tag).toContain('class="workspace-surface ');
      expect(tag).toContain('role="region"');
      expect(tag).not.toContain('aria-modal=');
      expect(tag).toContain('aria-hidden="true"');
      expect(tag).toContain('tabindex="-1"');
      expect(tag).toContain('data-workspace-active="false"');
    });

    const mapTag = openingTag('map-section');
    expect(mapTag).toContain('class="workspace-surface workspace-surface--map is-active"');
    expect(mapTag).toContain('role="region"');
    expect(mapTag).toContain('data-workspace-surface="map"');
    expect(mapTag).toContain('data-workspace-active="true"');

    const marketTag = openingTag('market-overlay');
    expect(marketTag).toContain('role="region"');
    expect(marketTag).toContain('aria-hidden="true"');
    expect(marketTag).toContain('tabindex="-1"');
    ['trade', 'fleet', 'archive', 'logs'].forEach(function (workspaceId) {
      expect(html).toContain('data-workspace-surface="' + workspaceId + '"');
    });
    expect((html.match(/data-workspace-surface=/g) || []).length).toBe(5);
    expect((html.match(/data-workspace-active=/g) || []).length).toBe(5);
    expect(html).not.toContain('side-panel-overlay');
    expect(html).not.toContain('secondary-terminal');
    expect(html).not.toContain('panel-open');
    expect(workspaceCss).not.toMatch(
      /side-panel-overlay|secondary-terminal|panel-open|#market-overlay\.hidden|#market-overlay:not\(\.hidden\)|\.market-overlay\.hidden/i,
    );
    const mapStart = html.lastIndexOf('<section', html.indexOf('id="map-section"'));
    const mapEnd = html.indexOf('</section>', mapStart);
    const tradeStart = html.lastIndexOf('<section', html.indexOf('id="market-overlay"'));
    expect(tradeStart).toBeGreaterThan(mapEnd);
    expect((html.match(/data-workspace-initial-focus/g) || []).length).toBe(4);
  });

  it('keeps tutorial guidance and one authoritative Command Slot in the responsive layer', function () {
    const tutorialTag = openingTag('tutorial-tooltip');
    expect(tutorialTag).toContain('role="dialog"');
    expect(tutorialTag).toContain('aria-hidden="true"');
    expect(tutorialTag).toContain('tabindex="-1"');

    expect(html).toMatch(/id="floating-command-stack"[\s\S]*?id="action-guide"/);
    expect((html.match(/data-command-slot="primary"/g) || []).length).toBe(1);
    expect(html).not.toContain('id="event-notification"');
    expect(css).toContain('.floating-command-stack');
    expect(css).toContain('left: max(12px, var(--safe-left));');
    expect(css).toContain('right: max(12px, var(--safe-right));');
    expect(css).toContain('max-height: calc(100dvh - max(8px, var(--safe-top)) - max(8px, var(--safe-bottom))) !important;');
  });

  it('mounts the global Context Inspector and Command Slot outside the map workspace stacking context', function () {
    const mapIdIndex = html.indexOf('id="map-section"');
    const mapStart = html.lastIndexOf('<section', mapIdIndex);
    const mapEnd = html.indexOf('<!-- Trade workspace', mapStart);
    const mainStart = html.indexOf('<main id="game-main">');
    const mainEnd = html.indexOf('</main>', mainStart);
    const mapMarkup = html.slice(mapStart, mapEnd);
    const mainMarkup = html.slice(mainStart, mainEnd);

    expect(mapStart).toBeGreaterThan(-1);
    expect(mapEnd).toBeGreaterThan(mapStart);
    expect(mainEnd).toBeGreaterThan(mainStart);
    expect(mapMarkup).not.toContain('id="context-inspector"');
    expect(mapMarkup).not.toContain('id="floating-command-stack"');
    expect(mainMarkup).toContain('id="context-inspector"');
    expect(mainMarkup).toContain('id="floating-command-stack"');
  });

  it('uses one workspace-scoped context inspector instead of parallel HUD mini applications', function () {
    expect(html).not.toContain('data-hud-dock-toggle');
    expect(html).not.toContain('rail-icon-dock');
    expect(html).not.toContain('id="galaxy-view-btn"');
    expect(html).toContain('id="hud-galactic-map-toggle"');
    expect(html).not.toContain('data-hud-dock-panel=');
    expect((html.match(/id="context-inspector"/g) || []).length).toBe(1);
    expect((html.match(/data-context-inspector-toggle/g) || []).length).toBe(5);
    ['map', 'trade', 'fleet', 'archive', 'logs'].forEach(function (workspaceId) {
      expect(html).toContain('data-context-workspace="' + workspaceId + '"');
    });
    expect(html).toMatch(/workspace-terminal-shell--logs[\s\S]*?data-context-inspector-toggle[\s\S]*?检查消息/);
    expect((html.match(/data-context-inspector-tab=/g) || []).length).toBe(0);
    expect((html.match(/data-context-inspector-pane=/g) || []).length).toBe(0);
    expect((html.match(/id="context-inspector-content"/g) || []).length).toBe(1);
    expect((html.match(/id="planet-detail-panel"/g) || []).length).toBe(1);
    expect(html).not.toContain('id="hud-market-overview-body"');
    expect(html).not.toContain('id="hud-network-signal"');
    expect(html).not.toContain('id="quest-tracker"');
  });
});
