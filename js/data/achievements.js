// js/data/achievements.js — 成就定义（群星风格）
// 依赖：无
// 导出：ACHIEVEMENTS

/**
 * 成就定义
 * condition: (state) => boolean — 检查是否满足解锁条件
 */
export const ACHIEVEMENTS = [
  // ========== 贸易成就 ==========
  {
    id: 'first_trade',
    name: '初次交易',
    description: '完成第一笔贸易交易。',
    icon: '🤝',
    category: 'trade',
    condition: function (state) { return (state.tradeCount || 0) >= 1; },
    reward: { credits: 100 },
  },
  {
    id: 'trade_10',
    name: '交易新手',
    description: '累计完成 10 笔交易。',
    icon: '📊',
    category: 'trade',
    condition: function (state) { return (state.tradeCount || 0) >= 10; },
    reward: { credits: 300 },
  },
  {
    id: 'trade_50',
    name: '贸易专家',
    description: '累计完成 50 笔交易。',
    icon: '💹',
    category: 'trade',
    condition: function (state) { return (state.tradeCount || 0) >= 50; },
    reward: { credits: 1000 },
  },
  {
    id: 'trade_100',
    name: '商业大亨',
    description: '累计完成 100 笔交易。',
    icon: '🏦',
    category: 'trade',
    condition: function (state) { return (state.tradeCount || 0) >= 100; },
    reward: { credits: 3000 },
  },

  // ========== 财富成就 ==========
  {
    id: 'credits_5000',
    name: '小有积蓄',
    description: '信用积分达到 5,000。',
    icon: '💰',
    category: 'wealth',
    condition: function (state) { return state.credits >= 5000; },
    reward: { exp: 20 },
  },
  {
    id: 'credits_10000',
    name: '万元户',
    description: '信用积分达到 10,000。',
    icon: '💎',
    category: 'wealth',
    condition: function (state) { return state.credits >= 10000; },
    reward: { exp: 50 },
  },
  {
    id: 'credits_30000',
    name: '银河富豪',
    description: '信用积分达到 30,000。',
    icon: '👑',
    category: 'wealth',
    condition: function (state) { return state.credits >= 30000; },
    reward: { exp: 100 },
  },

  // ========== 探索成就 ==========
  {
    id: 'explore_5',
    name: '星际旅人',
    description: '到过 5 个不同的星系旅行。',
    icon: '🚀',
    category: 'explore',
    condition: function (state) { return (state.day || 1) >= 10; }, // 简化：旅行 10 天
    reward: { credits: 200 },
  },
  {
    id: 'survive_30',
    name: '银河老手',
    description: '在银河中存活 30 天。',
    icon: '🌍',
    category: 'explore',
    condition: function (state) { return (state.day || 1) >= 30; },
    reward: { credits: 500, exp: 30 },
  },
  {
    id: 'survive_100',
    name: '银河传奇',
    description: '在银河中存活 100 天。',
    icon: '🌟',
    category: 'explore',
    condition: function (state) { return (state.day || 1) >= 100; },
    reward: { credits: 2000, exp: 100 },
  },

  // ========== 科技成就 ==========
  {
    id: 'first_research',
    name: '科技先驱',
    description: '完成第一项科技研究。',
    icon: '🔬',
    category: 'tech',
    condition: function (state) { return (state.researchedTechs || []).length >= 1; },
    reward: { credits: 200, exp: 15 },
  },
  {
    id: 'research_5',
    name: '学究',
    description: '完成 5 项科技研究。',
    icon: '📚',
    category: 'tech',
    condition: function (state) { return (state.researchedTechs || []).length >= 5; },
    reward: { credits: 800, exp: 40 },
  },
  {
    id: 'research_all',
    name: '全知全能',
    description: '完成所有科技研究。',
    icon: '🧠',
    category: 'tech',
    condition: function (state) { return (state.researchedTechs || []).length >= 15; },
    reward: { credits: 5000, exp: 200 },
  },

  // ========== 派系成就 ==========
  {
    id: 'faction_ally',
    name: '外交家',
    description: '与至少一个派系建立盟友关系。',
    icon: '🤝',
    category: 'faction',
    condition: function (state) {
      if (!state.factionRelations) return false;
      return Object.values(state.factionRelations).some(function (v) { return v >= 70; });
    },
    reward: { credits: 1000, exp: 50 },
  },
  {
    id: 'faction_all_friendly',
    name: '银河和平大使',
    description: '与所有派系关系达到友好以上。',
    icon: '🕊️',
    category: 'faction',
    condition: function (state) {
      if (!state.factionRelations) return false;
      return Object.values(state.factionRelations).every(function (v) { return v >= 30; });
    },
    reward: { credits: 3000, exp: 100 },
  },

  // ========== 等级成就 ==========
  {
    id: 'level_5',
    name: '崭露头角',
    description: '达到玩家等级 5。',
    icon: '⭐',
    category: 'level',
    condition: function (state) { return (state.playerLevel || 1) >= 5 || (state.experience || 0) >= 1000; },
    reward: { credits: 800 },
  },
  {
    id: 'level_10',
    name: '帝皇加冕',
    description: '达到最高等级 10。',
    icon: '🌟',
    category: 'level',
    condition: function (state) { return (state.experience || 0) >= 7500; },
    reward: { credits: 5000 },
  },

  // ========== 任务成就 ==========
  {
    id: 'quest_first',
    name: '任务新手',
    description: '完成第一个任务。',
    icon: '📋',
    category: 'quest',
    condition: function (state) { return (state.completedQuests || []).length >= 1; },
    reward: { credits: 200, exp: 15 },
  },
  {
    id: 'quest_5',
    name: '可靠雇佣兵',
    description: '完成 5 个任务。',
    icon: '🎖️',
    category: 'quest',
    condition: function (state) { return (state.completedQuests || []).length >= 5; },
    reward: { credits: 1500, exp: 60 },
  },
];
