// js/ui/QuestObjectivePresenter.js — 任务目标文案与计量单位纯投影

import { getQuestGoodName, getQuestSystemName } from './QuestRoutePresenter.js';

export function getQuestObjectiveText(objective) {
  var input = objective || {};
  var targetSystemName = getQuestSystemName(input.targetSystem);
  var goodName = getQuestGoodName(input.goodId);
  switch (input.type) {
    case 'deliver': return '运送 ' + goodName + ' 到 ' + targetSystemName;
    case 'buy_at': return '在 ' + targetSystemName + ' 购买 ' + goodName;
    case 'sell_at': return '在 ' + targetSystemName + ' 卖出 ' + goodName;
    case 'earn_profit': return '累计赚取利润';
    case 'trade_count': return '完成交易次数';
    case 'trade_good': return '交易 ' + goodName;
    case 'visit_systems': return '造访不同星系';
    case 'visit_system': return '前往 ' + targetSystemName;
    case 'faction_trade': return '在派系区域交易';
    case 'sell_in_faction': return '在派系区域卖出 ' + goodName;
    case 'faction_relation': return '提升与派系关系';
    case 'survive_days': return '星际航行天数';
    case 'galaxy_jump': return '跨星系跃迁';
    case 'research_count': return '完成科技研究';
    case 'explore_pois': return '完成探索点调查';
    case 'fleet_size': return '扩充舰队规模';
    case 'crew_count': return '雇佣专业船员';
    case 'dispatch_routes': return '确认自动跑商路线';
    case 'finance_actions': return '申请贷款或投资';
    case 'trade_stations': return '建设贸易站';
    case 'visited_galaxies': return '探索不同星系';
    case 'victory_policy': return '选择长期经营路线';
    default: return '完成目标';
  }
}

export function getQuestObjectivePlanText(objective) {
  if (!objective) return '查看任务详情';
  var base = getQuestObjectiveText(objective);
  var amount = Number(objective.amount) || 1;
  switch (objective.type) {
    case 'deliver':
    case 'buy_at':
    case 'sell_at':
    case 'trade_good':
    case 'sell_in_faction':
      return base + ' · ' + amount + ' 单位';
    case 'earn_profit':
      return base + ' · ' + amount.toLocaleString() + ' 积分';
    case 'trade_count':
    case 'faction_trade':
    case 'galaxy_jump':
      return base + ' · ' + amount + ' 次';
    case 'visit_systems':
      return base + ' · ' + amount + ' 个星球';
    case 'visit_system':
      return amount > 1 ? base + ' · ' + amount + ' 次' : base;
    case 'faction_relation':
      return base + ' · 关系值 ' + amount;
    case 'survive_days':
      return base + ' · ' + amount + ' 天';
    case 'research_count':
      return base + ' · ' + amount + ' 项';
    case 'explore_pois':
      return base + ' · ' + amount + ' 个探索点';
    case 'fleet_size':
      return base + ' · ' + amount + ' 艘';
    case 'crew_count':
      return base + ' · ' + amount + ' 名';
    case 'dispatch_routes':
    case 'finance_actions':
      return base + ' · ' + amount + ' 次';
    case 'trade_stations':
      return base + ' · ' + amount + ' 座';
    case 'visited_galaxies':
      return base + ' · ' + amount + ' 个星系';
    default:
      return amount > 1 ? base + ' · x' + amount : base;
  }
}
