// 胜利路线信条的纯数据访问层。
// 选择存在 storyDecisions.victory_policy 中，因此无需增加新存档字段。

import { VICTORY_PATHS } from '../../data/victoryConditions.js';

const LEGACY_VICTORY_PATH_ALIASES = {
  galactic_monopolist: 'trade_baron',
  transcendence: 'tech_supremacy',
  shadow_broker: 'diplomatic_unity',
  eternal_voyager: 'galactic_explorer',
  legacy_master: 'fleet_commander',
};

export function normalizeVictoryPathId(pathId) {
  return LEGACY_VICTORY_PATH_ALIASES[pathId] || pathId || '';
}

export function getSelectedVictoryPolicy(state) {
  const pathId = normalizeVictoryPathId(state && state.storyDecisions && state.storyDecisions.victory_policy);
  if (!pathId) return null;
  const path = VICTORY_PATHS.find(function (entry) { return entry.id === pathId; });
  if (!path || !path.policy) return null;
  return {
    pathId: path.id,
    pathName: path.name,
    name: path.policy.name,
    summary: path.policy.summary,
    benefit: path.policy.benefit,
    tradeoff: path.policy.tradeoff,
    effects: Object.assign({}, path.policy.effects || {}),
  };
}

export function getVictoryPolicyEffects(state) {
  const selected = getSelectedVictoryPolicy(state);
  return selected ? selected.effects : {};
}
