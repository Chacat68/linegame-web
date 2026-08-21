// js/testing/GameApplicationTestHarness.js — application-level integration harness
//
// Importing the real composition root installs its test-mode harness factory.
// Consumers receive commands over the actual singleton Runtime Graph rather
// than a parallel mock application.

import '../core/GameApplication.js';
import { getRegisteredGameApplicationTestHarness } from './GameApplicationTestHarnessRegistry.js';

export function createGameApplicationTestHarness() {
  return getRegisteredGameApplicationTestHarness();
}
