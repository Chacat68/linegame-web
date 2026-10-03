import { getMerchantSummary } from '../systems/merchant/MerchantSystem.js';
export function renderMerchantHeader(state, doc = globalThis.document) {
  if (!doc || !state?.merchant) return null;
    const summary = getMerchantSummary(state);
    const text = (id, content) => {
      const element = doc.getElementById?.(id);
      if (element && element.textContent !== String(content)) element.textContent = String(content);
    };
    text('credits', Math.floor(summary.cash).toLocaleString('zh-CN'));
    return Object.freeze(summary);
}
