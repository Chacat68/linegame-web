import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Header information ownership', function () {
  it('公司身份只在 Header 提供权威入口，机库保留经营详情而不复制全局状态', function () {
    var html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    var hud = readFileSync(new URL('../js/ui/HUD.js', import.meta.url), 'utf8');
    var header = html.match(/<header id="game-header"[\s\S]*?<\/header>/)[0];
    var fleet = html.match(/<aside\s+id="trade-panel"[\s\S]*?<\/aside>/)[0];

    expect((html.match(/id="company-name-display"/g) || [])).toHaveLength(1);
    expect((html.match(/id="company-name-text"/g) || [])).toHaveLength(1);
    expect(header).toContain('id="company-name-display"');
    expect(header).toContain('id="company-name-text"');
    expect(fleet).toContain('公司经营概览');
    expect(fleet).not.toContain('id="company-name-display"');
    expect(fleet).not.toContain('hdr-credits-mirror');
    expect(fleet).not.toContain('hdr-day-mirror');
    expect(fleet).not.toContain('hdr-cycle-mirror');
    expect(html).not.toContain('id="player-level"');
    expect(html).not.toContain('id="economy-cycle"');
    expect(hud).not.toContain('querySelectorAll(\'.hdr-');
  });

  it('公司身份迁移后不保留旧机库按钮、经营弹窗或声望镜像样式', function () {
    var cssFiles = [
      'css/header.css',
      'css/panels.css',
      'css/modals.css',
      'css/responsive.css',
      'css/animations.css',
      'css/interstellar-trader.css',
    ];
    var css = cssFiles.map(function (file) {
      return readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    }).join('\n');

    expect(css).not.toContain('.company-name-btn');
    expect(css).not.toContain('.company-dashboard-modal');
    expect(css).not.toContain('.company-panel-grid');
    expect(css).not.toContain('.company-panel-card');
    expect(css).not.toContain('.rep-badge');
  });
});
