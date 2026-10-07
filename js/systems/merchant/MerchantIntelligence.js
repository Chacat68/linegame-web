import { MERCHANT_INTELLIGENCE, isMerchantViewUnlocked } from '../../data/merchant.js';
import { isPortOpen } from './MerchantAccess.js';

export const getIntelligence = id => MERCHANT_INTELLIGENCE.find(item => item.id === id);
export const getPlanetIntelligence = (merchant, portId) => MERCHANT_INTELLIGENCE.find(item =>
  item.type === 'planet' && item.targetPortId === portId && merchant?.purchasedIntelIds?.includes(item.id));

export function isValidIntelligenceState(merchant) {
  const ids = merchant.purchasedIntelIds;
  return Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => Boolean(getIntelligence(id)));
}

export function previewIntelligence(state, intelId, operatingReserve = 0) {
  const intel = getIntelligence(intelId);
  if (!intel) return null;
  const merchant = state.merchant;
  const purchased = Boolean(merchant.purchasedIntelIds?.includes(intel.id));
  const opened = isPortOpen(merchant, intel.targetPortId);
  const event = merchant.exploration?.event;
  const surveyed = event?.portId === intel.targetPortId && ['returning', 'completed'].includes(event.status);
  const known = purchased || opened || surveyed;
  const reason = purchased ? '情报已收藏，无需重复购买。'
    : opened || surveyed ? '勘察已获取此情报，无需购买。'
      : !isMerchantViewUnlocked(merchant, 'market') ? '请先研发市场通讯，开放情报交易。'
        : merchant.companyLevel < intel.companyLevel ? `公司 Lv.${intel.companyLevel} 开放这份情报。`
          : state.credits < intel.cost ? `可用 CR 不足，需要 ${intel.cost.toLocaleString('zh-CN')} CR。`
            : state.credits - intel.cost < operatingReserve ? `需保留至少 ${operatingReserve.toLocaleString('zh-CN')} CR 首航货本。` : '';
  return { ...intel, purchased, opened, known, ok: !reason, reason };
}

export function buyIntelligence(state, input, operatingReserve) {
  const offer = previewIntelligence(state, input?.intelId, operatingReserve);
  if (!offer) return { ok: false, msg: '找不到这份情报。' };
  if (!offer.ok) return { ok: false, msg: offer.reason };
  // 校验完成后才扣款；记录与货币由同一经营命令保存，重复点击不重复付费。
  state.credits -= offer.cost;
  state.merchant.purchasedIntelIds.push(offer.id);
  return { ok: true, msg: '星球情报已收藏。探索船完整返港后开放新港与商路。', intelId: offer.id };
}
