import { beforeEach, describe, expect, it } from 'vitest';
import * as Tutorial from '../js/systems/tutorial/TutorialSystem.js';
import { createTestState } from './helpers.js';

if (typeof globalThis.localStorage === 'undefined') {
  let storage = {};
  globalThis.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setItem(key, value) {
      storage[key] = String(value);
    },
    removeItem(key) {
      delete storage[key];
    },
    clear() {
      storage = {};
    },
  };
}

function advanceToQuestAcceptStep() {
  while (Tutorial.getStep() && Tutorial.getStep().id !== 'accept_first_quest') {
    const step = Tutorial.getStep();

    if (step.trigger === 'manual') {
      Tutorial.advance();
      continue;
    }

    if (step.trigger === 'action:buy') {
      Tutorial.checkTrigger('buy');
      continue;
    }

    if (step.trigger === 'action:travel') {
      Tutorial.checkTrigger('travel');
      continue;
    }

    if (step.trigger === 'action:sell') {
      Tutorial.checkTrigger('sell');
      continue;
    }

    throw new Error('Unexpected tutorial trigger: ' + step.trigger);
  }
}

describe('TutorialSystem', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    Tutorial.reset();
  });

  it('任务接取后会进入首单完成步骤', () => {
    const state = createTestState();

    Tutorial.init(state);
    Tutorial.start();
    advanceToQuestAcceptStep();

    expect(Tutorial.getStep().id).toBe('accept_first_quest');
    Tutorial.checkTrigger('accept_quest');
    expect(Tutorial.getStep().id).toBe('complete_first_quest');
  });

  it('首个任务完成后会推进到任务追踪步骤', () => {
    const state = createTestState();

    Tutorial.init(state);
    Tutorial.start();
    advanceToQuestAcceptStep();

    Tutorial.checkTrigger('accept_quest');
    expect(Tutorial.getStep().id).toBe('complete_first_quest');
    Tutorial.checkTrigger('complete_quest');
    expect(Tutorial.getStep().id).toBe('quest_tracker');
  });

  it('若任务在接取后立即结算，会自动越过完成步骤', () => {
    const state = createTestState();

    Tutorial.init(state);
    Tutorial.start();
    advanceToQuestAcceptStep();

    Tutorial.checkTrigger('complete_quest');
    Tutorial.checkTrigger('accept_quest');

    expect(Tutorial.getStep().id).toBe('quest_tracker');
  });

  it('任务步骤插在燃料提示之前', () => {
    const ids = Tutorial.STEPS.map(function (step) { return step.id; });

    expect(ids).toContain('show_quest_board');
    expect(ids).toContain('accept_first_quest');
    expect(ids).toContain('complete_first_quest');
    expect(ids).toContain('quest_tracker');
    expect(ids.indexOf('accept_first_quest')).toBeLessThan(ids.indexOf('fuel_warning'));
    expect(ids.indexOf('complete_first_quest')).toBeLessThan(ids.indexOf('quest_tracker'));
  });
});