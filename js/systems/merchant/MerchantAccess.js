// 市场数据会提前初始化；港口与商路只在探索船完整返港后对玩家开放。
export function isPortOpen(merchant, portId) {
  if (!merchant?.unlockedPorts?.includes(portId)) return false;
  const event = merchant.exploration?.event;
  return event?.portId !== portId || event.status === 'completed';
}

export function getOpenPortIds(merchant) {
  return (merchant?.unlockedPorts || []).filter(id => isPortOpen(merchant, id));
}
