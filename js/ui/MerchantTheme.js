import { findGalaxy } from '../data/systems.js';
import { getSceneEnvironment } from '../data/sceneVisuals.js';

// 主题由正在查看的星系决定，不随任意一艘船的航次变化。
export function getMerchantDisplayGalaxy(state) {
  return findGalaxy(state?.viewingGalaxy)?.id || findGalaxy(state?.currentGalaxy)?.id || 'milky_way';
}

export function applyMerchantTheme(state, surface = globalThis.document?.body) {
  if (!surface?.style || !surface.dataset) return;
  const galaxyId = getMerchantDisplayGalaxy(state);
  if (surface.dataset.merchantGalaxy === galaxyId) return;
  const environment = getSceneEnvironment(galaxyId);
  surface.dataset.merchantGalaxy = galaxyId;
  surface.style.setProperty('--ui-accent', environment.accent);
  surface.style.setProperty('--ui-accent-strong', environment.accentLight);
  surface.style.setProperty('--ui-scene-space', environment.background);
  surface.style.setProperty('--ui-scene-nebula', environment.nebula);
  surface.style.setProperty('--ui-scene-dust', environment.dust);
}
