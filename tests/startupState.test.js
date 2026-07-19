import { beforeEach, describe, expect, it } from 'vitest';
import { resolveStartupState } from '../js/core/StartupState.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import { createTestState } from './helpers.js';

describe('StartupState', function () {
  beforeEach(function () {
    globalThis.localStorage.clear();
  });

  it('冷启动会自动恢复 slot 0', function () {
    const saved = createTestState({ day: 12, credits: 4321, currentSystem: 'nova_station' });
    expect(Save.saveGame(0, saved, { isAutosave: true }).ok).toBe(true);

    const result = resolveStartupState(null, { difficulty: 'hard' });

    expect(result.restoredAutosave).toBe(true);
    expect(result.state.day).toBe(12);
    expect(result.state.credits).toBe(4321);
    expect(result.state.currentSystem).toBe('nova_station');
  });

  it('明确重新开始时忽略旧自动存档并应用所选难度', function () {
    const saved = createTestState({ day: 12, credits: 4321 });
    Save.saveGame(0, saved, { isAutosave: true });

    const result = resolveStartupState('easy', { difficulty: 'hard' }, { restoreAutosave: false });

    expect(result.restoredAutosave).toBe(false);
    expect(result.state.day).toBe(1);
    expect(result.state.difficulty).toBe('easy');
    expect(result.state.credits).not.toBe(4321);
  });
});
