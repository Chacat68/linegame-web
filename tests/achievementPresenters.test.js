import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import { buildAchievementBoardView, getAchievementCategoryStatus } from '../js/ui/AchievementBoardPresenter.js';
import { buildAchievementContextView, buildAchievementWorkspaceDetailView } from '../js/ui/AchievementDetailPresenter.js';
import { createTestState } from './helpers.js';

describe('Achievement presenters', function () {
  it('纯投影成就总览、分类进度与可检查卡片', function () {
    var first = ACHIEVEMENTS[0];
    var state = createTestState({ achievements: [first.id] });
    var view = buildAchievementBoardView({ state: state });
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.totalCount).toBe(ACHIEVEMENTS.length);
    expect(view.unlockedCount).toBe(1);
    expect(view.html).toContain('archive-achievement-console');
    expect(view.html).toContain('完成进度');
    expect(view.html).toContain('data-achievement-id="' + first.id + '"');
    expect(view.html).toContain('data-achievement-state="unlocked"');
    expect(view.html).toContain('data-achievement-state="locked"');
  });

  it('分类状态模型被冻结并准确统计待完成项', function () {
    var status = getAchievementCategoryStatus('trade', [
      { id: 'a', unlocked: true },
      { id: 'b', unlocked: false },
    ]);
    expect(status).toEqual(expect.objectContaining({
      label: '贸易',
      code: 'TRD',
      unlocked: 1,
      total: 2,
      pending: 1,
      pct: 50,
    }));
    expect(Object.isFrozen(status)).toBe(true);
  });

  it('Context 与 L4 详情由独立 Presenter 生成并拒绝错误类型', function () {
    var first = ACHIEVEMENTS[0];
    var state = createTestState({ achievements: [first.id] });
    var contextView = buildAchievementContextView({ context: { type: 'achievement', id: first.id }, state: state });
    var detailView = buildAchievementWorkspaceDetailView({ detail: { type: 'archive-achievement', id: first.id }, state: state });
    expect(contextView.html).toContain('workspace-context-card--achievement');
    expect(contextView.html).toContain('查看完整成就详情');
    expect(detailView.html).toContain('奖励总览');
    expect(Object.isFrozen(contextView)).toBe(true);
    expect(Object.isFrozen(detailView)).toBe(true);
    expect(buildAchievementContextView({ context: { type: 'quest', id: first.id }, state: state })).toBeNull();
  });

  it('源码所有权阻止 DOM、listener 和领域 selector 回流兼容门面', function () {
    var facade = readFileSync('js/ui/AchievementUI.js', 'utf8');
    var board = readFileSync('js/ui/AchievementBoardPresenter.js', 'utf8');
    var detail = readFileSync('js/ui/AchievementDetailPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/AchievementBoardController.js', 'utf8');
    expect(facade).toContain("from './AchievementBoardController.js'");
    expect(facade).toContain("from './AchievementBoardPresenter.js'");
    expect(facade).toContain("from './AchievementDetailPresenter.js'");
    expect(facade).not.toContain('querySelectorAll');
    expect(facade).not.toContain('addEventListener');
    expect(facade).not.toContain('AchievementSystem');
    expect(board).not.toContain('document.');
    expect(board).not.toContain('onclick');
    expect(detail).not.toContain('document.');
    expect(controller).not.toContain('innerHTML');
  });
});
