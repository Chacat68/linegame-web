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

  it('将任务接取纳入新手教程主流程', () => {
    const state = createTestState();

    Tutorial.init(state);
    Tutorial.start();
    advanceToQuestAcceptStep();

    expect(Tutorial.getStep().id).toBe('accept_first_quest');
    Tutorial.checkTrigger('accept_quest');
    expect(Tutorial.getStep().id).toBe('quest_tracker');
  });

  it('任务步骤插在燃料提示之前', () => {
    const ids = Tutorial.STEPS.map(function (step) { return step.id; });

    expect(ids).toContain('show_quest_board');
    expect(ids).toContain('accept_first_quest');
    expect(ids).toContain('quest_tracker');
    expect(ids.indexOf('accept_first_quest')).toBeLessThan(ids.indexOf('fuel_warning'));
  });
});