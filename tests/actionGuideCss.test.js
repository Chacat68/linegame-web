import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Action guide responsive CSS', function () {
  it('窄屏下会把行动条按钮移到第二行并限制文案高度', function () {
    var css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');

    expect(css).toContain('.action-guide-title');
    expect(css).toContain('-webkit-line-clamp: 2');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('grid-template-areas:');
    expect(css).toContain('"status copy"');
    expect(css).toContain('"status actions"');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).not.toContain('.action-guide-toggle');
    expect(css).not.toContain('.action-guide-mini');
    expect(css).toContain('text-overflow: ellipsis');
  });

  it('样式入口会加载行动条适配版本', function () {
    var css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    expect(css).toContain('@import url("interstellar-trader.css")');
  });

  it('现行设计体系会移除双层套框并使用独立的上下文、正文和操作区域', function () {
    var surfaces = readFileSync(new URL('../css/surfaces.css', import.meta.url), 'utf8');
    var responsive = readFileSync(new URL('../css/bridge-responsive.css', import.meta.url), 'utf8');

    expect(surfaces).toContain('#action-guide.action-guide');
    expect(surfaces).toContain('background: transparent');
    expect(surfaces).toContain('#action-guide .action-guide-shell::before');
    expect(surfaces).toContain('"status kicker primary"');
    expect(surfaces).toContain('"status main primary"');
    expect(surfaces).toContain('display: contents');
    expect(surfaces).toContain('grid-area: primary');
    expect(surfaces).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(surfaces).toMatch(/\.action-guide-primary \.command-action-kicker\s*\{[^}]*display:\s*none/);
    expect(surfaces).toMatch(/\.action-guide-reason\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(surfaces).toContain('#action-guide .action-guide-outcome');
    expect(surfaces).toContain('#action-guide .action-guide-flow-label');
    expect(responsive).toContain('@media (max-width: 560px)');
    expect(responsive).toContain('"status primary"');
  });

  it('机库和档案覆盖层会使用 panel-open 作为可见状态', function () {
    var css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');

    expect(css).toContain('#info-panel.side-panel-overlay.panel-open');
    expect(css).toContain('#trade-panel.side-panel-overlay.panel-open');
  });
});
