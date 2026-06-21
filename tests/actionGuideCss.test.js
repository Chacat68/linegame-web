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
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 34px');
    expect(css).toContain('.action-guide-mini-kicker');
    expect(css).toContain('text-overflow: ellipsis');
  });

  it('样式入口会加载行动条适配版本', function () {
    var css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    expect(css).toContain('interstellar-trader.css?v=20260621-settingsfallback1');
  });

  it('机库和档案覆盖层会使用 panel-open 作为可见状态', function () {
    var css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');

    expect(css).toContain('#info-panel.side-panel-overlay.panel-open');
    expect(css).toContain('#trade-panel.side-panel-overlay.panel-open');
  });
});
