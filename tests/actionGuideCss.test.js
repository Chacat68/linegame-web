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

  it('五个同级工作区只使用 is-active 作为可见状态', function () {
    var css = readFileSync(new URL('../css/surfaces.css', import.meta.url), 'utf8');

    expect(css).toContain('.workspace-surface:not(.is-active)');
    expect(css).toContain('.workspace-surface.is-active');
    expect(css).not.toContain('panel-open');
  });

  it('唯一 Command Slot 使用全局 guide 层级，不会被 L3 档案或机库遮住', function () {
    var tokens = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
    var shell = readFileSync(new URL('../css/global-shell-v2.css', import.meta.url), 'utf8');
    var surfaces = readFileSync(new URL('../css/surfaces.css', import.meta.url), 'utf8');
    var responsive = readFileSync(new URL('../css/bridge-responsive.css', import.meta.url), 'utf8');
    var legacy = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');

    expect(tokens).toContain('--ui-z-workspace: 70');
    expect(tokens).toContain('--ui-z-terminal: 100');
    expect(tokens).toContain('--ui-z-guide: 160');
    expect(shell).toMatch(/\.floating-command-stack\s*\{[^}]*z-index:\s*var\(--ui-z-guide\)/);
    expect(shell).toMatch(/\.floating-command-stack\s*\{[^}]*left:\s*50%[^}]*transform:\s*translateX\(-50%\)/);
    expect(shell).toMatch(/body:has\(#context-inspector:not\(\[hidden\]\)\) \.floating-command-stack\s*\{[^}]*left:\s*calc\(\(100vw - var\(--ui-context-width\)/);
    expect(shell).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.floating-command-stack\s*\{[^}]*left:\s*max\(7px, var\(--ui-safe-left\)\)[^}]*transform:\s*none/);
    expect(surfaces).not.toContain('#map-container:has(> #market-overlay:not(.hidden)) > .floating-command-stack');
    expect(legacy).not.toContain('body:has(#market-overlay:not(.hidden)) #action-guide');
    expect(legacy).not.toContain('body:has(#info-panel.panel-open) #action-guide');
    expect(legacy).not.toContain('body:has(#trade-panel.panel-open) #action-guide');
    expect(legacy).not.toContain('body:has(.modal:not(.hidden)) #action-guide');
    expect(responsive).toContain('body:has(.modal:not(.hidden)) #action-guide');
  });
});
