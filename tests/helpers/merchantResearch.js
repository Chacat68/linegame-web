import { expect } from 'vitest';
import * as Merchant from '../../js/systems/merchant/MerchantSystem.js';
import { getPendingTechChain } from '../../js/systems/merchant/MerchantTechnology.js';

// Fixtures pay the same ordered prerequisite chain as a new player.
export function researchChain(state, techId, { includeTarget = true, at = state.merchant.lastTickAt } = {}) {
  for (const tech of getPendingTechChain(state.merchant, techId)) {
    if (!includeTarget && tech.id === techId) continue;
    const result = Merchant.command(state, 'researchTech', { techId: tech.id }, at);
    expect(result.ok, `${tech.id}: ${result.msg}`).toBe(true);
  }
}

// Legacy tests must describe already paid outcomes, without adding today's prerequisites or bonuses.
export function historicalResearch(state, techId) {
  state.credits -= Merchant.getTech(techId).cost;
  state.merchant.researchedTechIds.push(techId);
}
