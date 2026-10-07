import { MERCHANT_PORTS } from '../data/merchant.js';
import { getExplorationStage } from '../systems/merchant/MerchantExploration.js';
import { isPortOpen, getOpenPortIds } from '../systems/merchant/MerchantAccess.js';

const portIds = new Set(MERCHANT_PORTS.map(port => port.id));
const composition = Object.freeze({
  sol_prime: Object.freeze([-36, 0, -24]),
  mineral_belt: Object.freeze([40, -1, 10]),
  nebula_forge: Object.freeze([-8, 1, 44]),
  aurora_depot: Object.freeze([-66, 0, 48]),
});

// 未勘察的位置只有未知天体；勘察后可展示地表，完整返港才开放港口。
export function getMerchantExplorationSignal(state) {
  const event = state?.merchant?.exploration?.event;
  return event && event.status !== 'completed' && !isPortOpen(state.merchant, event.portId)
    ? { ...event, stage: getExplorationStage(event, state.merchantStarmapNow ?? Date.now()) } : null;
}

// 只改变当前商圈的构图，不改变 MerchantSystem 使用的商路距离与计时。
export function getPresentedSceneSystems(systems, state) {
  if (!state?.merchant) return systems;
  const opened = new Set(getOpenPortIds(state.merchant));
  return systems.filter(system => portIds.has(system.id) && opened.has(system.id));
}

export function getPresentedSystemCoordinates(system, state) {
  const point = state?.merchant && composition[system.id];
  return point
    ? { x: .5 + point[0] / 140, y: .48 + point[2] / 140 }
    : { x: system.position?.x ?? system.x, y: system.position?.y ?? system.y };
}

export function composeMerchantScene(positions, state) {
  if (!state?.merchant) return positions;
  for (const [id, point] of positions) {
    if (composition[id]) point.set(...composition[id]);
  }
  return positions;
}
