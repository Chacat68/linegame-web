import { createInitialState } from '../data/constants.js';
import { loadGame } from '../systems/save/SaveSystem.js';
export function prepareStartupState(options = {}) {
  if (options.restoreAutosave === false) return { state: createInitialState(), restoredAutosave: false };
  const result = loadGame(0);
  if (result.ok) return { state: result.state, restoredAutosave: true, warningCode: result.warningCode, loadMessage: result.msg };
  if (result.errorCode === 'SAVE_SLOT_EMPTY') return { state: createInitialState(), restoredAutosave: false };
  const error = new Error(result.msg);
  error.code = 'STARTUP_SAVE_RECOVERY_REQUIRED';
  throw error;
}
