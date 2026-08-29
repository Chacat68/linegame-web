import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI_ROOT = 'js/ui';
const GLOBAL_GUIDANCE_TERMS = /当前建议|下一步建议|下一步：/;

function listJavaScriptFiles(root) {
  return readdirSync(root).flatMap(function (name) {
    const path = join(root, name);
    return statSync(path).isDirectory() ? listJavaScriptFiles(path) : (name.endsWith('.js') ? [path] : []);
  });
}

describe('UI information ownership', function () {
  it('只有 ActionGuide 可以声明全局行动标签', function () {
    const violations = listJavaScriptFiles('js')
      .filter(function (path) {
        return !path.endsWith('/ActionGuideUI.js') && !path.endsWith('/TutorialUI.js');
      })
      .flatMap(function (path) {
        const source = readFileSync(path, 'utf8');
        return source.split('\n').flatMap(function (line, index) {
          return GLOBAL_GUIDANCE_TERMS.test(line)
            ? [path + ':' + (index + 1) + ' ' + line.trim()]
            : [];
        });
      });

    expect(violations).toEqual([]);
  });

  it('局部面板使用明确的状态或信号术语', function () {
    const expectedTerms = {
      'ArchiveExplorationPresenter.js': '探索报告',
      'AchievementBoardPresenter.js': '完成进度',
      'FactionBoardPresenter.js': '关系信号',
      'QuestBoardPresenter.js': '任务状态',
      'ResearchBoardPresenter.js': '研究状态',
      'SaveWorkspacePresenter.js': '存档状态',
      'FleetModPresenter.js': '处理状态',
      'MarketSpotPresenter.js': '行情信号',
    };

    Object.entries(expectedTerms).forEach(function (entry) {
      const source = readFileSync(join(UI_ROOT, entry[0]), 'utf8');
      expect(source, entry[0]).toContain(entry[1]);
    });
  });

  it('HUD 不再持有已删除的网络仪表盘与伪价格波动模型', function () {
    const source = readFileSync(join(UI_ROOT, 'HUD.js'), 'utf8');
    const html = readFileSync('index.html', 'utf8');

    expect(source).not.toContain('近期价格变化');
    expect(source).not.toContain('hud-network-volatility');
    expect(source).not.toContain('_renderHudNetworkStatus');
    expect(source).not.toMatch(/cargoPct\s*\*\s*0\.08/);
    expect(source).not.toMatch(/netWorth[^\n]+5000/);
    expect(html).not.toContain('id="hud-network-');
  });
});
