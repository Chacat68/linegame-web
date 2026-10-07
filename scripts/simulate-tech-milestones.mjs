import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { MERCHANT_TECHS, getMerchantTechPricing } from '../js/data/merchant.js';
import { measureFleet } from './simulate-company-pricing.mjs';

const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--write'), '仅支持 --write。');
const milestones = MERCHANT_TECHS.filter(tech => tech.milestone).map(tech => {
  const fleets = ['investment', 'throughput'].map(policy => measureFleet({ level: tech.companyLevel, policy, deferredTechId: tech.id }));
  const fleet = fleets.reduce((best, item) => item.netProfit > best.netProfit ? item : best);
  assert.ok(fleet.profitPerMinute > 0 && fleet.allocatedShips === fleet.ships);
  return { id: tech.id, name: tech.name, level: tech.companyLevel, milestone: tech.milestone.label,
    ...getMerchantTechPricing(tech), requires: tech.requires, fleet,
    accumulationMinutes: Number((tech.cost / fleet.profitPerMinute).toFixed(2)) };
});
const result = { assumptions: '核心研发前的当级最大船队：除该核心外所有已开放科技及完整前置实际付费研发，采购基础与已研发扩容的全部船位，划拨全船队货本。只有已完成勘察返港的港口经营；60分钟共享真实供需，比较两种混编策略。不读取玩家存档，也不把实验现金计作经营收入。积累分钟是研发费用/这支完整船队实测净利，仅作资金门槛参考，不代表从新局到达节点的时间。',
  totalResearchCost: MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0), milestones };
if (args.includes('--write')) await writeFile(new URL('../docs/2.1/科技树核心门槛.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
