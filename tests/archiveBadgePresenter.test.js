import { describe, expect, it } from 'vitest';
import { createTestState } from './helpers.js';
import {
  buildArchiveBadgeSnapshot,
  renderArchiveBadges,
} from '../js/ui/ArchiveBadgePresenter.js';

function createElement() {
  return { hidden: true, textContent: '', title: '' };
}

function createDocument() {
  var elements = {
    'archive-tab-quest-badge': createElement(),
    'archive-tab-exploration-badge': createElement(),
    'archive-tab-research-badge': createElement(),
    'archive-tab-faction-badge': createElement(),
    'archive-tab-achievement-badge': createElement(),
    'archive-nav-badge': createElement(),
  };
  return {
    elements: elements,
    getElementById: function (id) { return elements[id] || null; },
  };
}

describe('ArchiveBadgePresenter', function () {
  it('从领域 selector 构造冻结的档案待处理快照', function () {
    var state = createTestState({
      quests: [{ id: 'active_quest' }],
      researchOptions: ['cargo_optimization'],
      currentResearch: { techId: 'market_analysis' },
      achievements: ['first_trade'],
      factionRelations: { federation: 35 },
    });

    var snapshot = buildArchiveBadgeSnapshot(state);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.quest).toBeGreaterThan(0);
    expect(snapshot.research).toBe(2);
    expect(snapshot.faction).toBe(1);
    expect(snapshot.achievement).toBe(1);
    expect(snapshot.nav).toBeGreaterThan(0);
  });

  it('只更新六个声明式 badge，并统一隐藏零值与 title 语义', function () {
    var doc = createDocument();
    var state = createTestState({
      quests: [{ id: 'active_quest' }],
      researchOptions: ['cargo_optimization'],
      achievements: ['first_trade'],
      factionRelations: { federation: 35 },
    });

    var snapshot = renderArchiveBadges(state, doc);

    expect(doc.elements['archive-tab-quest-badge'].hidden).toBe(false);
    expect(doc.elements['archive-tab-quest-badge'].title).toBe('任务待处理：' + snapshot.quest);
    expect(doc.elements['archive-tab-exploration-badge'].hidden).toBe(true);
    expect(doc.elements['archive-tab-exploration-badge'].textContent).toBe('0');
    expect(doc.elements['archive-tab-research-badge'].textContent).toBe('1');
    expect(doc.elements['archive-tab-faction-badge'].textContent).toBe('1');
    expect(doc.elements['archive-tab-achievement-badge'].textContent).toBe('1');
    expect(doc.elements['archive-nav-badge'].title).toBe('档案待处理：' + snapshot.nav);
  });
});
