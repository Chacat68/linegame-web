import { MERCHANT_TECHS, MERCHANT_SHIPS, MERCHANT_LEGACY_TECH_GROUPS } from '../../data/merchant.js';

export function getTechBonuses(merchant) {
  const researched = merchant?.researchedTechIds || [];
  const bonuses = MERCHANT_TECHS.filter(tech => researched.includes(tech.id)).reduce((sum, tech) => ({
    speed: sum.speed + (tech.speedBonus || 0), capacity: sum.capacity + (tech.capacityBonus || 0), profit: sum.profit + (tech.profitBonus || 0),
  }), { speed: 0, capacity: 0, profit: 0 });
  return Object.fromEntries(Object.entries(bonuses).map(([key, value]) => [key, Math.round(value * 10000) / 10000]));
}

export function getFleetSlotBonus(merchant) {
  return MERCHANT_TECHS.filter(tech => merchant?.researchedTechIds?.includes(tech.id))
    .reduce((sum, tech) => sum + (tech.shipSlotBonus || 0), 0);
}

// v31 及更早的公司等级已包含这些研发船位，迁移为已完成扩容；基础上限使用当前平衡表。
export function restoreLegacyFleetCapacity(merchant) {
  if (!Array.isArray(merchant.researchedTechIds)) return;
  for (const tech of MERCHANT_TECHS) {
    if (tech.shipSlotBonus && tech.companyLevel <= merchant.companyLevel && !merchant.researchedTechIds.includes(tech.id)) {
      merchant.researchedTechIds.push(tech.id);
    }
  }
}

export function restoreGranularMerchantTechs(merchant) {
  const expand = ids => Array.isArray(ids) ? ids.flatMap(id => MERCHANT_LEGACY_TECH_GROUPS[id] || [id]) : ids;
  merchant.researchedTechIds = expand(merchant.researchedTechIds);
  for (const ship of merchant.ships) if (ship.trip) ship.trip.techIds = expand(ship.trip.techIds);
  for (const task of [...merchant.tasks, ...merchant.history]) for (const record of task.recent) {
    if (record.techIds !== undefined) record.techIds = expand(record.techIds);
  }
  for (const event of [...merchant.exploration.completed, ...(merchant.exploration.event ? [merchant.exploration.event] : [])]) event.techIds = expand(event.techIds);
}

export function getShipStats(merchant, typeId) {
  const type = MERCHANT_SHIPS.find(ship => ship.id === typeId);
  if (!type) return null;
  const bonuses = getTechBonuses(merchant);
  return { ...type, capacity: Math.floor(type.capacity * (1 + bonuses.capacity)), speed: type.speed * (1 + bonuses.speed) };
}

export function isValidTechSnapshot(merchant, ids) {
  // 航次锁定的是出发时已支付的效果，按原依赖核验；新分支前置由研发指令检查。
  return Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id =>
    merchant.researchedTechIds.includes(id) && MERCHANT_TECHS.some(tech => tech.id === id && tech.snapshotRequires.every(required => ids.includes(required))));
}

export function getPendingTechChain(merchant, techId) {
  const result = [], visited = new Set();
  function visit(id) {
    if (visited.has(id) || merchant.researchedTechIds.includes(id)) return;
    visited.add(id);
    const tech = MERCHANT_TECHS.find(item => item.id === id);
    if (!tech) return;
    tech.requires.forEach(visit);
    result.push(tech);
  }
  visit(techId);
  return result;
}

// 旧档的等级已开放这些能力；迁移只补资格，不赠送航速、载量或利润加成。
export function restoreLegacyMerchantAccess(merchant) {
  const grants = [
    'clipper_design', 'hauler_design', 'fleet_command', 'market_network', 'planet_survey', 'deep_survey',
  ];
  const oldAdvanced = ['fast_navigation', 'bulk_logistics', 'integrated_freight'].some(id => merchant.researchedTechIds.includes(id));
  for (const id of grants) {
    const level = MERCHANT_TECHS.find(tech => tech.id === id).companyLevel;
    const priorView = ['fleet_command', 'market_network'].includes(id) && (oldAdvanced || merchant.unlockedPorts.includes('nebula_forge'));
    const priorExploration = id === 'planet_survey' && merchant.unlockedPorts.includes('nebula_forge');
    const owned = id === 'clipper_design' && merchant.ships.some(ship => ['clipper', 'hauler'].includes(ship.typeId)) || id === 'hauler_design' && merchant.ships.some(ship => ship.typeId === 'hauler');
    if ((merchant.companyLevel >= level || priorView || priorExploration || owned) && !merchant.researchedTechIds.includes(id)) merchant.researchedTechIds.push(id);
  }
}
