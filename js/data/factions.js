// js/data/factions.js — 派系定义（群星风格外交关系）
// 依赖：无
// 导出：FACTIONS, FACTION_LEVELS

/**
 * 派系系统设计（参考群星）：
 * - 3 大派系控制不同星系
 * - 每个派系有独特的意识形态和贸易偏好
 * - 与派系的关系影响交易税、特殊事件和可用商品
 * - 关系通过交易活动和事件选择变化
 */

export const FACTION_LEVELS = [
  { id: 'hostile',   name: '敌对',   min: -Infinity, max: -50, taxMod: 1.30, emoji: '⚔️' },
  { id: 'unfriendly', name: '不友好', min: -50,       max: -10, taxMod: 1.15, emoji: '😠' },
  { id: 'neutral',   name: '中立',   min: -10,       max: 30,  taxMod: 1.00, emoji: '😐' },
  { id: 'friendly',  name: '友好',   min: 30,        max: 70,  taxMod: 0.90, emoji: '😊' },
  { id: 'allied',    name: '盟友',   min: 70,        max: Infinity, taxMod: 0.80, emoji: '🤝' },
];

export const FACTIONS = [
  {
    id: 'federation',
    name: '银河联邦',
    icon: '🏛️',
    color: '#4fc3f7',
    ideology: '秩序与法治',
    description: '银河系最大的政治实体。联邦信奉法治与秩序，维护星际航线安全，但对走私和黑市交易零容忍。',
    controlledSystems: ['sol_prime', 'nova_station', 'imperial_capital'],
    tradePreference: {
      liked: ['food', 'technology', 'medicine'],   // 交易这些商品获得更多好感
      disliked: ['weapons'],                        // 交易这些商品降低好感
    },
    bonuses: {
      friendly: '联邦星系内贸易税 -10%',
      allied:   '联邦提供免费护航，海盗事件概率 -50%',
    },
  },
  {
    id: 'syndicate',
    name: '星际辛迪加',
    icon: '💀',
    color: '#ef5350',
    ideology: '自由与利润',
    description: '游走在法律边缘的松散联盟。辛迪加控制着银河系的地下经济，提供高利润但高风险的交易机会。',
    controlledSystems: ['shadow_haven', 'war_front', 'luxury_port'],
    tradePreference: {
      liked: ['weapons', 'luxury'],
      disliked: ['food'],
    },
    bonuses: {
      friendly: '辛迪加星系内可访问黑市，独家商品',
      allied:   '辛迪加成员为你提供海盗免疫',
    },
  },
  {
    id: 'technocracy',
    name: '科技共同体',
    icon: '🔮',
    color: '#ab47bc',
    ideology: '知识与进步',
    description: '由跨星系科研机构组成的松散邦联。他们追求知识和科技进步，乐于与支持科研的商人合作。',
    controlledSystems: ['mineral_belt', 'medical_hub', 'crystal_planet', 'fuel_depot'],
    tradePreference: {
      liked: ['technology', 'medicine', 'minerals'],
      disliked: ['luxury'],
    },
    bonuses: {
      friendly: '共同体星系内科技商品打折 -15%',
      allied:   '解锁高级科技研究选项',
    },
  },
];
