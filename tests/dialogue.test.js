// tests/dialogue.test.js — 轻量剧情对话系统测试

import { describe, expect, it } from 'vitest';
import { DIALOGUE_SCENES } from '../js/data/dialogues.js';
import { QUESTS } from '../js/data/quests.js';
import * as Dialogue from '../js/systems/story/DialogueSystem.js';
import { createTestState } from './helpers.js';

describe('DialogueSystem', () => {
  it('初始化时会补齐剧情标记与选择容器', () => {
    const state = createTestState({ storyFlags: null, storyDecisions: null });

    Dialogue.init(state);

    expect(state.storyFlags).toEqual({});
    expect(state.storyDecisions).toEqual({});
  });

  it('教程完成后返回动态推荐任务对话', () => {
    const state = createTestState({ companyName: '北冕物流' });
    Dialogue.init(state);

    const scenes = Dialogue.getScenesForTrigger(state, 'tutorial_complete', {
      recommendations: [{ name: '前线补给' }, { name: '疫情救援' }],
    });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].id).toBe('tutorial_postlude');
    expect(scenes[0].lines[0].text).toContain('北冕物流');
    expect(scenes[0].lines[1].text).toContain('前线补给');
    expect(scenes[0].lines[1].text).toContain('疫情救援');
    expect(scenes[0].choices).toHaveLength(3);
  });

  it('结束场景时会记录已选分支', () => {
    const state = createTestState({ day: 6 });
    Dialogue.init(state);

    Dialogue.finalizeScene(state, 'tutorial_postlude', { choiceId: 'network' });

    expect(state.storyFlags.tutorial_postlude).toBe(6);
    expect(state.storyDecisions.tutorial_postlude).toBe('network');
  });

  it('标记已播放后，同一场景不会再次返回', () => {
    const state = createTestState({ day: 6 });
    Dialogue.init(state);

    const first = Dialogue.getScenesForTrigger(state, 'quest_accept', { questId: 'starter_deliver_food' });
    expect(first).toHaveLength(1);

    Dialogue.markSceneSeen(state, first[0].id);

    const second = Dialogue.getScenesForTrigger(state, 'quest_accept', { questId: 'starter_deliver_food' });
    expect(second).toHaveLength(0);
    expect(state.storyFlags[first[0].id]).toBe(6);
  });

  it('章节推进时返回对应章节过场', () => {
    const state = createTestState();
    Dialogue.init(state);

    const scenes = Dialogue.getScenesForTrigger(state, 'phase_unlock', { phaseId: 'phase_2' });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('第二章：立足');
  });

  it('章节过场会根据此前选择返回不同回应', () => {
    const state = createTestState({
      storyDecisions: { tutorial_postlude: 'shadow' },
    });
    Dialogue.init(state);

    const scenes = Dialogue.getScenesForTrigger(state, 'phase_unlock', { phaseId: 'phase_2' });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].lines[1].text).toContain('高风险');
  });

  it('第二章主线任务会返回任务简报', () => {
    const state = createTestState();
    Dialogue.init(state);

    const scenes = Dialogue.getScenesForTrigger(state, 'quest_accept', { questId: 'expand_deliver_tech' });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('研究线不能停');
    expect(scenes[0].footer).toContain('新北京站');
  });

  it('带分支的任务简报与回信会读写对应选择', () => {
    const state = createTestState({
      storyDecisions: { quest_accept_rise_syndicate_sell: 'cautious' },
    });
    Dialogue.init(state);

    const acceptScenes = Dialogue.getScenesForTrigger(state, 'quest_accept', { questId: 'rise_syndicate_sell' });
    const completeScenes = Dialogue.getScenesForTrigger(state, 'quest_complete', { questId: 'rise_syndicate_sell' });

    expect(acceptScenes).toHaveLength(1);
    expect(acceptScenes[0].choices).toHaveLength(2);
    expect(completeScenes).toHaveLength(1);
    expect(completeScenes[0].lines[0].text).toContain('试探水温');
  });

  it('传奇级支线任务会返回任务回信', () => {
    const state = createTestState();
    Dialogue.init(state);

    const scenes = Dialogue.getScenesForTrigger(state, 'quest_complete', { questId: 'legend_ultimate_delivery' });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe('这已经能写进培训手册了');
  });

  it('第三到第五章任务都具备接取与完成对话', () => {
    const targetQuestIds = QUESTS.filter(function (quest) {
      return (quest.phase || 1) >= 3 && (quest.phase || 1) <= 5;
    }).map(function (quest) {
      return quest.id;
    });
    const sceneIds = DIALOGUE_SCENES.map(function (scene) {
      return scene.id;
    });

    targetQuestIds.forEach(function (questId) {
      expect(sceneIds).toContain('quest_accept_' + questId);
      expect(sceneIds).toContain('quest_complete_' + questId);
    });
  });
});