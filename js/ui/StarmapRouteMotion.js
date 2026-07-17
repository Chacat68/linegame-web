const DEFAULT_ROUTE_DURATION_MS = 2400;
const SHIP_APPEAR_END = 0.14;
const SHIP_DISAPPEAR_START = 0.84;

export function buildRouteMotionKey(route) {
  if (!route) return '';
  return [
    route.id || 'route',
    route.routeRevision != null ? route.routeRevision : 'legacy',
    route.startSystemId || '',
    route.endSystemId || '',
    route.statusLabel || '',
  ].join(':');
}

export function resolveRouteMotionState(states, route, now, durationMs) {
  const key = buildRouteMotionKey(route);
  const stateId = route && route.id ? route.id : key;
  if (!states || !route || !stateId) {
    return { route: route, startTime: now, hasPendingRoute: false };
  }

  const existing = states.get(stateId);
  if (!existing) {
    const created = { key: key, route: Object.assign({}, route), startTime: now };
    states.set(stateId, created);
    return { route: created.route, startTime: created.startTime, hasPendingRoute: false };
  }

  if (existing.key === key) {
    existing.route = Object.assign({}, route);
    return { route: existing.route, startTime: existing.startTime, hasPendingRoute: false };
  }

  // 港内作业没有需要播放完的航行动画。下一航段一旦开始，应立即从新起点出现。
  if (existing.route && existing.route.isTraveling === false && route.isTraveling) {
    const departed = { key: key, route: Object.assign({}, route), startTime: now };
    states.set(stateId, departed);
    return { route: departed.route, startTime: departed.startTime, hasPendingRoute: false };
  }

  if (getRouteMotionProgress(now, existing.startTime, 'full', durationMs) < 1) {
    return { route: existing.route, startTime: existing.startTime, hasPendingRoute: true };
  }

  const advanced = { key: key, route: Object.assign({}, route), startTime: now };
  states.set(stateId, advanced);
  return { route: advanced.route, startTime: advanced.startTime, hasPendingRoute: false };
}

export function pruneRouteMotionStates(states, activeIds) {
  if (!states) return;
  states.forEach(function (_, stateId) {
    if (!activeIds || !activeIds.has(stateId)) states.delete(stateId);
  });
}

export function getRouteMotionProgress(time, startTime, motionLevel, durationMs) {
  const elapsed = Math.max(0, (Number(time) || 0) - (Number(startTime) || 0));
  const normalizedDuration = Number.isFinite(durationMs) && durationMs > 0
    ? durationMs
    : DEFAULT_ROUTE_DURATION_MS;
  const progress = Math.min(1, elapsed / normalizedDuration);

  // 关闭动态效果时仍保留航行语义：航段播放期间静置在中点，计时结束后正常推进。
  if (motionLevel === 'off') return progress >= 1 ? 1 : 0.5;
  return progress;
}

export function getRouteVisibilityMode(startVisible, endVisible) {
  if (startVisible && endVisible) return 'local';
  if (!startVisible && endVisible) return 'entering';
  if (startVisible && !endVisible) return 'exiting';
  return 'hidden';
}

export function getShipTravelVisualState(progress, motionLevel, visibilityMode) {
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  const mode = visibilityMode === 'entering' || visibilityMode === 'exiting'
    ? visibilityMode
    : 'local';

  if (motionLevel === 'off') {
    return {
      phase: normalized >= 1 ? 'hidden' : 'cruise',
      opacity: normalized >= 1 ? 0 : 1,
      scale: 1,
      engine: normalized >= 1 ? 0 : 0.42,
      flash: 0,
    };
  }

  const appearEnd = mode === 'entering' ? 0.2 : SHIP_APPEAR_END;
  const disappearStart = mode === 'exiting' ? 0.74 : SHIP_DISAPPEAR_START;
  const appear = _smoothstep(0, appearEnd, normalized);
  const disappear = 1 - _smoothstep(disappearStart, 1, normalized);
  const opacity = Math.max(0, Math.min(1, appear * disappear));
  const appearing = normalized < appearEnd;
  const disappearing = normalized > disappearStart;
  const edgeStrength = appearing
    ? 1 - normalized / appearEnd
    : (disappearing ? (normalized - disappearStart) / Math.max(0.001, 1 - disappearStart) : 0);

  return {
    phase: opacity <= 0.01
      ? 'hidden'
      : (appearing ? 'appearing' : (disappearing ? 'disappearing' : 'cruise')),
    opacity,
    scale: 0.68 + opacity * 0.32 + edgeStrength * 0.08,
    engine: opacity * (0.58 + Math.sin(normalized * Math.PI) * 0.42),
    flash: Math.max(0, Math.min(1, edgeStrength)) * opacity,
  };
}

function _smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
