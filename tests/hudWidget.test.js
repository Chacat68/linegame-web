import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('HUD context ownership', function () {
  it('delegates contextual navigation to the single Context Inspector', function () {
    var hud = read('js/ui/HUD.js');
    var html = read('index.html');

    expect(hud).toContain("import * as ContextInspector from './ContextInspector.js'");
    expect(hud).toContain("window.matchMedia('(max-width: 620px)').matches");
    expect(hud).toContain("stateSource: typeof opts.stateSource === 'function'");
    expect(hud).toContain("revisionSource: typeof opts.revisionSource === 'function'");
    expect(hud).not.toContain('data-hud-widget');
    expect(hud).not.toContain('data-hud-dock-panel');
    expect((html.match(/id="context-inspector"/g) || []).length).toBe(1);
    expect((html.match(/data-context-inspector-pane=/g) || []).length).toBe(0);
    expect(html).toContain('id="context-inspector-render-host"');
    expect(hud).not.toContain('_renderHudMarketOverview');
    expect(hud).not.toContain('_renderHudNetworkStatus');
    expect(hud).not.toContain('_renderQuestTracker');
    expect(html).toMatch(/id="context-inspector"[^>]*aria-hidden="true" hidden/);
  });
});
