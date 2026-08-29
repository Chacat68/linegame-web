import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Action guide responsive CSS', function () {
  it('legacy 与 Global Shell 不再拥有 Action Guide 组件规则', function () {
    var legacy = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');
    var shell = readFileSync(new URL('../css/global-shell-v2.css', import.meta.url), 'utf8');

    expect(legacy).not.toMatch(/#action-guide|\.action-guide/);
    expect(legacy).not.toContain('action-guide-pulse');
    expect(shell).not.toMatch(/#action-guide|\.action-guide/);
    expect(shell).toContain('.floating-command-stack');
  });

  it('样式入口会加载行动条适配版本', function () {
    var css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    expect(css).toContain('@import url("interstellar-trader.css")');
  });

  it('Surface 独立拥有组件布局、语义状态与反馈动画', function () {
    var surfaces = readFileSync(new URL('../css/surfaces.css', import.meta.url), 'utf8');

    expect(surfaces).toContain('#action-guide.action-guide');
    expect(surfaces).toContain('#action-guide.action-guide[hidden]');
    expect(surfaces).toContain('background: transparent');
    expect(surfaces).toContain('#action-guide .action-guide-shell::before');
    expect(surfaces).toContain('grid-template-areas: "status main primary"');
    expect(surfaces).toContain('grid-template-columns: auto minmax(0, 1fr)');
    expect(surfaces).toContain('grid-area: primary');
    expect(surfaces).toMatch(/\.action-guide-primary \.command-action-kicker\s*\{[^}]*display:\s*none/);
    expect(surfaces).toMatch(/\.action-guide-reason\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(surfaces).toContain('#action-guide .action-guide-outcome');
    expect(surfaces).toContain('#action-guide .action-guide-flow-label');
    expect(surfaces).toContain('[data-guide-surface="quest"]');
    expect(surfaces).toContain('[data-guide-surface="exploration"]');
    expect(surfaces).toContain('[data-guide-surface="navigation"]');
    expect(surfaces).toContain('#action-guide.action-guide.is-processing');
    expect(surfaces).toContain('#action-guide.action-guide.is-complete');
    expect(surfaces).toContain('@keyframes action-guide-pulse');
  });

  it('Bridge 在窄屏把 Command Slot 改为正文加主操作两行，并负责阻塞态避让', function () {
    var responsive = readFileSync(new URL('../css/bridge-responsive.css', import.meta.url), 'utf8');
    var inspector = readFileSync(new URL('../css/context-inspector.css', import.meta.url), 'utf8');

    expect(responsive).toMatch(/@media \(max-width: 900px\)[\s\S]*?#action-guide \.action-guide-outcome\s*\{[^}]*display:\s*none/);
    expect(responsive).toMatch(/@media \(max-width: 620px\)[\s\S]*?grid-template-areas:\s*"status main"\s*"status primary"/);
    expect(responsive).toMatch(/@media \(max-width: 620px\)[\s\S]*?#action-guide \.action-guide-copy\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(responsive).not.toContain('body:has(#action-guide:not([hidden])) .planet-detail-panel');
    expect(inspector).toMatch(/#context-inspector\.context-inspector:not\(\[data-workspace-id="map"\]\)\s*\{[\s\S]*?var\(--ui-command-reserve\)/);
    expect(responsive).toContain('body:has(.modal:not(.hidden)) #action-guide');
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
    expect(shell).toMatch(/\.floating-command-stack\s*\{[^}]*bottom:\s*calc\(var\(--ui-nav-height\)/);
    expect(shell).toMatch(/body:has\(#context-inspector:not\(\[hidden\]\)\) \.floating-command-stack\s*\{[^}]*left:\s*calc\(\(100vw - var\(--ui-context-width\)/);
    expect(shell).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.floating-command-stack\s*\{[^}]*left:\s*max\(7px, var\(--ui-safe-left\)\)[^}]*transform:\s*none/);
    expect(surfaces).not.toMatch(/\.floating-command-stack\s*\{/);
    expect(legacy).not.toMatch(/#action-guide|\.action-guide|\.floating-command-stack/);
    expect(responsive).toContain('body:has(.modal:not(.hidden)) #action-guide');
  });
});
