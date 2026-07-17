import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('MapUI exploration entry', function () {
  it('主界面不再渲染独立探索终端按钮和浮层', function () {
    const html = readFileSync('index.html', 'utf8');

    expect(html).not.toContain('id="exploration-terminal-btn"');
    expect(html).not.toContain('exploration-terminal-menu-btn');
    expect(html).not.toContain('id="rail-icon-explore"');
    expect(html).not.toContain('id="current-system-exploration-card"');
    expect(html).not.toContain('id="hud-target-detail-open"');
  });

  it('星球详情仍保留直接调查 POI 的入口', function () {
    const js = readFileSync('js/ui/MapUI.js', 'utf8');

    expect(js).toContain('function _buildExplorationSection');
    expect(js).toContain("type: 'poi'");
    expect(js).toContain('调查当前航点探索点');
  });
});
