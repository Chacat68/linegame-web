// tests/helpers.js — 测试辅助工具
// 创建干净的游戏状态，避免直接依赖 INITIAL_STATE（包含完整的引用链）

/**
 * 创建一个干净的测试用游戏状态
 * @param {object} [overrides] 覆盖默认值
 * @returns {object} 游戏状态
 */
export function createTestState(overrides) {
  const state = {
    companyName:       '测试公司',
    credits:           1000,
    day:               1,
    currentSystem:     'sol_prime',
    currentGalaxy:     'milky_way',
    viewingGalaxy:     'milky_way',
    mapView:           'planets',
    cargo:             {},
    cargoCost:         {},
    maxCargo:          20,
    fuel:              100,
    maxFuel:           100,
    fuelEfficiency:    1.0,
    purchasedUpgrades: [],
    hoveredSystem:     null,

    shipHull:          100,
    maxHull:           100,
    autoRepair:        0,

    factionRelations:  null,
    reputation:        0,

    researchedTechs:   [],
    currentResearch:   null,
    researchQueue:     [],
    researchOptions:   [],
    techBuyDiscount:   0,
    techSellBonus:     0,

    tradeCount:        0,
    totalProfit:       0,
    maxSingleProfit:   0,
    goodsTraded:       {},
    totalEvents:       0,
    daysWithoutDamage: 0,

    playerLevel:       1,
    experience:        0,

    companyLevel:      1,
    companyExperience: 0,

    questPhase:        1,
    quests:            [],
    completedQuests:   [],

    achievements:      [],

    fleet:             [],
    activeShipIndex:   0,
    fleetSlots:        1,

    visitedSystems:    ['sol_prime'],
    visitedGalaxies:   ['milky_way'],
  };

  if (overrides) {
    Object.assign(state, overrides);
  }

  return state;
}
