import { findSystem } from '../data/systems.js';
import { getShipType } from '../systems/merchant/MerchantSystem.js';
import { getMerchantDisplayGalaxy } from './MerchantTheme.js';

// 星图只读真实经营与探索航次；计时、解锁与收益由 MerchantSystem 独占。
export function buildMerchantStarmapProjection(state, now = Date.now()) {
  if (!state?.merchant) return null;
  const merchant = state.merchant;
  const routes = merchant.ships.flatMap((ship, shipIndex) => {
    const event = merchant.exploration?.event;
    if (event?.shipId === ship.id && ship.taskId === event.id && ['exploring', 'explore_return'].includes(ship.phase)) {
      const returning = ship.phase === 'explore_return';
      const startedAt = returning ? event.arriveAt - event.legMs : event.startedAt;
      const progress = Math.max(0, Math.min(1, (now - startedAt) / event.legMs));
      return [{
        id: `merchant-${ship.id}`, source: 'exploration', shipIndex,
        shipTypeId: getShipType(ship.typeId)?.sceneType || 'shuttle',
        routeRevision: `${event.id}:${ship.phase}:${startedAt}`,
        startSystemId: returning ? event.portId : event.from,
        endSystemId: returning ? event.from : event.portId,
        currentSystemId: event.from, sourceSystemId: event.from, targetSystemId: event.portId,
        isTraveling: true, isMoving: returning || progress < 1,
        hasTravelSegment: true, sameSystemRoute: false,
        statusLabel: returning ? '探索返港' : progress < 1 ? '探索去程' : '勘察中', progress,
      }];
    }
    const task = merchant.tasks.find(item => item.id === ship.taskId);
    if (!task) return [];
    const returning = ship.phase === 'return';
    const fromId = returning ? task.to : task.from;
    const toId = returning ? task.from : task.to;
    const traveling = ship.phase === 'outbound' || returning;
    const progress = traveling && ship.arriveAt > ship.departAt
      ? Math.max(0, Math.min(1, (now - ship.departAt) / (ship.arriveAt - ship.departAt)))
      : 0;
    return [{
      id: `merchant-${ship.id}`,
      source: 'merchant',
      shipIndex,
      shipTypeId: getShipType(ship.typeId)?.sceneType || 'shuttle',
      routeRevision: `${task.id}:${ship.phase}:${ship.departAt}`,
      startSystemId: fromId,
      endSystemId: toId,
      currentSystemId: fromId,
      sourceSystemId: fromId,
      targetSystemId: toId,
      isTraveling: traveling,
      hasTravelSegment: true,
      sameSystemRoute: false,
      statusLabel: returning ? '空载返程' : traveling ? '载货去程' : '等待出发',
      progress,
    }];
  });
  const home = findSystem(routes[0]?.startSystemId || 'sol_prime');
  return {
    ...state,
    merchantStarmapRoutes: routes,
    currentSystem: home?.id || 'sol_prime',
    currentGalaxy: home?.galaxyId || 'milky_way',
    viewingGalaxy: getMerchantDisplayGalaxy(state),
  };
}
