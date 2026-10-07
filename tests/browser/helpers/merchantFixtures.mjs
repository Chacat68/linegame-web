import { restoreLegacyMerchantAccess } from '../../../js/systems/merchant/MerchantTechnology.js';
import { expect } from '@playwright/test';
import { MERCHANT_18_LEVEL_MAP, MERCHANT_LEGACY_LEVEL_MAP } from '../../../js/data/merchant.js';
import { createInitialState, createSaveMeta } from '../../../js/data/constants.js';
import { init as initializeMerchant } from '../../../js/systems/merchant/MerchantSystem.js';

export async function openTools(page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
}

// 测试档只在 Node 中生成，经玩家可见的导入与读档操作进入独立测试上下文。
export async function importFixture(page, { level = 1, credits = 12000, legacyPort = false, legacyTech = false, legacyWaiting = false, legacyAccess = true, configure, schemaVersion } = {}, slot = 1) {
  const state = createInitialState({ companyName: '浏览器验收商队', credits });
  initializeMerchant(state);
  // 通用经营验收不重播新手流程，专用新局场景使用浏览器的真实初始状态。
  state.merchant.onboarding = { step: 5, skipped: false };
  state.merchant.companyLevel = schemaVersion && schemaVersion < 33
    ? (schemaVersion < 28 ? MERCHANT_LEGACY_LEVEL_MAP[level] : MERCHANT_18_LEVEL_MAP[level]) : level;
  if (legacyPort) state.merchant.unlockedPorts.push('nebula_forge');
  if (legacyTech) state.merchant.researchedTechIds.push('fast_navigation');
  // 通用航运场景使用旧档已获得的能力；新科技场景显式关闭此资格准备。
  if (legacyAccess) restoreLegacyMerchantAccess(state.merchant);
  if (legacyWaiting) {
    // 旧版等待任务经正常导入恢复，运行 tick 接管原任务的等待与续跑。
    state.credits -= 220;
    state.merchant.markets.sol_prime.supply.food = 0;
    state.merchant.nextId = 3;
    state.merchant.tasks = [{
      id: 'task-2', from: 'sol_prime', to: 'mineral_belt', goodId: 'food',
      shipIds: ['ship-1'], budget: 220, available: 220, rounds: 0, profit: 0,
      recent: [], pending: null, stopping: false, createdAt: state.merchant.lastTickAt,
    }];
    Object.assign(state.merchant.ships[0], {
      taskId: 'task-2', phase: 'waiting', waitReason: '出发港暂时无货，等待供货恢复。',
    });
  }
  configure?.(state);
  const meta = createSaveMeta(slot, state);
  if (schemaVersion) meta.schemaVersion = schemaVersion;
  const data = structuredClone(state);
  if (schemaVersion && schemaVersion < 33) data.merchant.companyLevel = level;
  const raw = JSON.stringify({ meta, data });
  await openTools(page);
  await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator(`[data-tool="import"][data-slot="${slot}"]`).click(),
  ]);
  await chooser.setFiles({ name: 'merchant-test.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(page.locator('#merchant-tools-status')).toContainText('导入成功');
  await page.locator(`[data-tool="load"][data-slot="${slot}"]`).click();
  await page.locator('[data-tool="confirm-yes"]').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('#company-name-display')).toContainText(state.companyName);
  return state;
}
