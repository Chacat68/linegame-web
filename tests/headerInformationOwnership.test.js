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

  it('全局信息由 ShellProjection 单次投影，Coordinator 与 HUD 不再持有兼容刷新门面', function () {
    var shell = readFileSync(new URL('../js/ui/GameShellProjection.js', import.meta.url), 'utf8');
    var coordinator = readFileSync(new URL('../js/ui/GameUiCoordinator.js', import.meta.url), 'utf8');
    var hud = readFileSync(new URL('../js/ui/HUD.js', import.meta.url), 'utf8');
    var presentation = readFileSync(new URL('../js/core/ActionPresentation.js', import.meta.url), 'utf8');
    var runtimeFactory = readFileSync(new URL('../js/core/GameUiRuntimeFactory.js', import.meta.url), 'utf8');

    expect(shell).toContain("from './HeaderStatusPresenter.js'");
    expect(shell).toContain("from './CompanyOverviewPresenter.js'");
    expect(shell).toContain("from './ArchiveBadgePresenter.js'");
    expect(coordinator).toContain("_call(ShellProjection, 'render', [state, netWorth])");
    expect(coordinator).not.toContain("_dependency(ui, 'HUD'");
    expect(coordinator).not.toContain("'updateStats'");
    expect(coordinator).not.toContain("'updateCompanyName'");
    expect(coordinator).not.toContain("'updateArchiveBadges'");
    expect(runtimeFactory).toContain('ShellInteractions: Object.freeze({');
    expect(runtimeFactory).toContain('LogsUI: HUD');
    expect(hud).not.toContain('export function updateStats');
    expect(hud).not.toContain('export function updateCompanyName');
    expect(hud).not.toContain('export function updateArchiveBadges');
    expect(presentation).toContain("SHELL: 'shell'");
    expect(presentation).not.toContain("HUD: 'hud'");
  });

  it('Header 基础布局只由现行 Surface 层覆盖，旧专用样式表不再参与竞争', function () {
    var legacyHeader = readFileSync(new URL('../css/header.css', import.meta.url), 'utf8');
    var competingSources = [
      'css/interstellar-trader.css',
      'css/responsive.css',
      'css/modals.css',
      'css/layout.css',
    ].map(function (file) {
      return readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    }).join('\n');
    var surfaces = readFileSync(new URL('../css/surfaces.css', import.meta.url), 'utf8');
    var responsive = readFileSync(new URL('../css/bridge-responsive.css', import.meta.url), 'utf8');
    var entry = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

    expect(legacyHeader).not.toMatch(/#game-header|\.hdr-/);
    expect(competingSources).not.toMatch(/#game-header|\.hdr-/);
    expect(surfaces).toContain('#game-header {');
    expect(surfaces).toContain('animation: panel-rise 0.5s ease-out both;');
    expect(surfaces).toContain('.hdr-company-name {');
    expect(surfaces).toContain('.hdr-meter-track[data-meter-state="warning"] .hdr-meter-fill');
    expect(surfaces).toContain('.hdr-meter-track[data-meter-state="critical"] .hdr-meter-fill');
    expect(surfaces).not.toContain('.hdr-icon-btn.is-tracking {');
    expect(surfaces).not.toContain('data-company-directive-badge');
    expect(responsive).toContain('@media (max-width: 680px)');
    expect(entry).not.toContain('@import url("animations.css")');
    expect(entry.indexOf('@import url("interstellar-trader.css")'))
      .toBeLessThan(entry.indexOf('@import url("surfaces.css")'));
    expect(entry.indexOf('@import url("surfaces.css")'))
      .toBeLessThan(entry.indexOf('@import url("bridge-responsive.css")'));
  });
});
