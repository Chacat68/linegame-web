// 当前商圈地点和星系主题身份；贸易数值在 merchant.js 中维护。
export const SYSTEMS = Object.freeze([
  {
    "id": "sol_prime",
    "name": "太阳主星",
    "type": "agricultural",
    "typeLabel": "农业",
    "color": "#4CAF50",
    "galaxyId": "milky_way"
  },
  {
    "id": "mineral_belt",
    "name": "矿石带",
    "type": "mining",
    "typeLabel": "矿业",
    "color": "#FF9800",
    "galaxyId": "milky_way"
  },
  {
    "id": "nebula_forge",
    "name": "星云工厂",
    "type": "industrial",
    "typeLabel": "工业",
    "color": "#FF7043",
    "galaxyId": "milky_way"
  },
  { "id": "aurora_depot", "name": "极光原料港", "type": "mining", "typeLabel": "原料", "color": "#80CBC4", "galaxyId": "milky_way" }
]);
export const GALAXIES = Object.freeze([
  {
    "id": "milky_way",
    "name": "银河系"
  },
  {
    "id": "andromeda",
    "name": "仙女座星系"
  },
  {
    "id": "orion_arm",
    "name": "猎户座旋臂"
  },
  {
    "id": "magellanic_cloud",
    "name": "麦哲伦星云"
  },
  {
    "id": "dark_sector",
    "name": "暗星域"
  },
  {
    "id": "phoenix_nebula",
    "name": "凤凰星云"
  },
  {
    "id": "jade_expanse",
    "name": "翠玉疆域"
  },
  {
    "id": "chrono_rift",
    "name": "时空裂隙"
  }
]);
export function findSystem(id) { return SYSTEMS.find(system => system.id === id) || null; }
export function findGalaxy(id) { return GALAXIES.find(galaxy => galaxy.id === id) || null; }
export function getSystemsByGalaxy(id) { return SYSTEMS.filter(system => system.galaxyId === id); }
