import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');

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

  it('keeps primary and secondary terminals dismissible and focusable', function () {
    ['info-panel', 'trade-panel', 'console-panel'].forEach(function (id) {
      const tag = openingTag(id);
      expect(tag).toContain('role="dialog"');
      expect(tag).toContain('aria-modal="false"');
      expect(tag).toContain('aria-hidden="true"');
      expect(tag).toContain('tabindex="-1"');
    });

    const marketTag = openingTag('market-overlay');
    expect(marketTag).toContain('role="region"');
    expect(marketTag).toContain('aria-hidden="true"');
    expect(marketTag).toContain('tabindex="-1"');
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

  it('uses one workspace-scoped context inspector instead of parallel HUD mini applications', function () {
    expect(html).not.toContain('data-hud-dock-toggle');
    expect(html).not.toContain('rail-icon-dock');
    expect(html).not.toContain('id="galaxy-view-btn"');
    expect(html).toContain('id="hud-galactic-map-toggle"');
    expect(html).not.toContain('data-hud-dock-panel=');
    expect((html.match(/id="context-inspector"/g) || []).length).toBe(1);
    expect((html.match(/data-context-inspector-toggle/g) || []).length).toBe(4);
    expect((html.match(/data-context-inspector-tab=/g) || []).length).toBe(0);
    expect((html.match(/data-context-inspector-pane=/g) || []).length).toBe(0);
    expect((html.match(/id="context-inspector-content"/g) || []).length).toBe(1);
    expect((html.match(/id="planet-detail-panel"/g) || []).length).toBe(1);
    expect(html).not.toContain('id="hud-market-overview-body"');
    expect(html).not.toContain('id="hud-network-signal"');
    expect(html).not.toContain('id="quest-tracker"');
  });
});
