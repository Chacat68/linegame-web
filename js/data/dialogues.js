// js/data/dialogues.js — 轻量剧情对话场景定义
// 依赖：无
// 导出：DIALOGUE_SCENES

function _formatQuestList(context) {
  var recommendations = context && Array.isArray(context.recommendations) ? context.recommendations : [];
  if (recommendations.length === 0) return '任务板上的起步委托';
  return recommendations.map(function (quest) {
    return '「' + quest.name + '」';
  }).join('、');
}

function _getActiveQuestName(state, context) {
  var activeQuest = context && context.activeQuest;
  if (!activeQuest && state && Array.isArray(state.quests) && state.quests.length > 0) {
    activeQuest = state.quests[0];
  }
  return activeQuest && activeQuest.name ? activeQuest.name : '';
}

function _hasCompletedQuest(state) {
  return !!(state && Array.isArray(state.completedQuests) && state.completedQuests.length > 0);
}

function _line(speaker, icon, text) {
  return {
    speaker: speaker,
    icon: icon,
    text: text,
  };
}

function _choice(id, text, responseLines, hint, responseFooter) {
  return {
    id: id,
    text: text,
    hint: hint,
    responseLines: responseLines,
    responseFooter: responseFooter,
  };
}

function _createQuestScenePair(config) {
  return [
    {
      id: 'quest_accept_' + config.questId,
      label: config.acceptLabel || '任务简报',
      title: config.acceptTitle,
      trigger: { type: 'quest_accept', questId: config.questId },
      footer: config.acceptFooter,
      lines: config.acceptLines,
      choices: config.acceptChoices,
    },
    {
      id: 'quest_complete_' + config.questId,
      label: config.completeLabel || '任务回信',
      title: config.completeTitle,
      trigger: { type: 'quest_complete', questId: config.questId },
      footer: config.completeFooter,
      lines: config.completeLines,
      choices: config.completeChoices,
    },
  ];
}

export const DIALOGUE_SCENES = [
  {
    id: 'tutorial_postlude',
    label: '教程尾声',
    title: '真正的营业开始了',
    trigger: { type: 'tutorial_complete' },
    lines: [
      {
        speaker: '港口管理员 汤姆',
        icon: '👨‍✈️',
        text: function (state, context) {
          var activeQuestName = _getActiveQuestName(state, context);
          if (activeQuestName) {
            return '基础操作你已经学完了，' + (state.companyName || '这家公司') + ' 现在已经接下了第一份正式委托「' + activeQuestName + '」。';
          }
          if (_hasCompletedQuest(state)) {
            return '基础操作你已经学完了，' + (state.companyName || '这家公司') + ' 刚刚已经把第一份正式委托顺利结清。';
          }
          return '基础操作你已经学完了，' + (state.companyName || '这家公司') + ' 终于可以开始接真正的委托了。';
        },
      },
      {
        speaker: '港口管理员 汤姆',
        icon: '👨‍✈️',
        text: function (state, context) {
          var activeQuestName = _getActiveQuestName(state, context);
          if (activeQuestName) {
            return '先把手上的「' + activeQuestName + '」跑稳。我又替你筛了几份后续单子：' + _formatQuestList(context) + '。按你的节奏接着扩张。';
          }
          if (_hasCompletedQuest(state)) {
            return '第一张单子你已经跑通了。我又替你筛了几份后续单子：' + _formatQuestList(context) + '。接下来就把一次成功，扩成稳定航线。';
          }
          return '我替你先筛了几份适合起步的单子：' + _formatQuestList(context) + '。先接一份，让银河重新记住你的名字。';
        },
      },
    ],
    choices: [
      _choice(
        'steady',
        '先跑稳妥委托',
        [_line('港口管理员 汤姆', '👨‍✈️', '稳一点是对的。先把补给、利润和节奏跑顺，等账本厚起来，选择自然会更多。')],
        '先稳住现金流与节奏',
        '选择偏好：稳健起步'
      ),
      _choice(
        'network',
        '先扩航线和声望',
        [_line('港口管理员 汤姆', '👨‍✈️', '那就多跑访问、合同和章节任务。先把人脉和通路铺开，后面很多门会自己打开。')],
        '优先做广度与关系',
        '选择偏好：航线扩张'
      ),
      _choice(
        'shadow',
        '先摸高风险单子',
        [_line('港口管理员 汤姆', '👨‍✈️', '想看高风险也行，但先记住一句话：每一笔刺激的买卖，都要给自己留退路。')],
        '更快接触高波动机会',
        '选择偏好：高风险探索'
      ),
    ],
  },
  {
    id: 'quest_accept_starter_deliver_food',
    label: '任务简报',
    title: '前线补给请求',
    trigger: { type: 'quest_accept', questId: 'starter_deliver_food' },
    footer: '目标：战争前线 · 建议优先从农业星球装货后直飞',
    lines: [
      {
        speaker: '后勤联络官 米拉',
        icon: '🛰️',
        text: '战争前线的配给仓已经见底了。我们不需要英雄，只需要一艘肯准时到达的货船。',
      },
      {
        speaker: '后勤联络官 米拉',
        icon: '🛰️',
        text: '把 5 单位食物送到前线，你送去的不只是货物，也是那边撑过下一个夜班的底气。',
      },
    ],
  },
  {
    id: 'quest_complete_starter_deliver_food',
    label: '任务回信',
    title: '补给已经到位',
    trigger: { type: 'quest_complete', questId: 'starter_deliver_food' },
    lines: [
      {
        speaker: '后勤联络官 米拉',
        icon: '🛰️',
        text: '货舱已经清点完毕，前线今天终于不用按半份口粮过日子了。',
      },
      {
        speaker: '后勤联络官 米拉',
        icon: '🛰️',
        text: '你准时得像军用时钟。以后再有这种急单，我会优先联系你。',
      },
    ],
  },
  {
    id: 'quest_accept_starter_deliver_medicine',
    label: '任务简报',
    title: '前线疫情告急',
    trigger: { type: 'quest_accept', questId: 'starter_deliver_medicine' },
    footer: '路线：医疗中枢采购 → 战争前线交付 · 6 单位医药 · 限时 8 天',
    lines: [
      {
        speaker: '值班医官 艾琳',
        icon: '🩺',
        text: '战争前线暴发疫情，医疗中枢已经备好一批平价医药，只差一艘可靠的船完成采购和转运。',
      },
      {
        speaker: '值班医官 艾琳',
        icon: '🩺',
        text: '在医疗中枢采购 6 单位，再送到战争前线。前线需求价足以覆盖运输成本，合同奖励另行结算。',
      },
    ],
  },
  {
    id: 'quest_complete_starter_deliver_medicine',
    label: '任务回信',
    title: '急救线恢复',
    trigger: { type: 'quest_complete', questId: 'starter_deliver_medicine' },
    lines: [
      {
        speaker: '值班医官 艾琳',
        icon: '🩺',
        text: '药品已经送进前线隔离区，最紧缺的几个治疗舱终于重新开机。',
      },
      {
        speaker: '值班医官 艾琳',
        icon: '🩺',
        text: '救援合同已经结清。把生意做得可持续，下一次警报响起时你才还能准时出现。',
      },
    ],
  },
  {
    id: 'quest_accept_starter_explore_shadow',
    label: '情报线索',
    title: '去一趟暗影港湾',
    trigger: { type: 'quest_accept', questId: 'starter_explore_shadow' },
    footer: '目标：暗影港湾 · 只需要抵达，不必逗留太久',
    lines: [
      {
        speaker: '情报贩子 洛克',
        icon: '🕶️',
        text: '如果你只在合法航线上跑货，那永远只能做个规矩商人。暗影港湾会教你银河的另一面。',
      },
      {
        speaker: '情报贩子 洛克',
        icon: '🕶️',
        text: '去那里看一眼，别急着下注。先把气味、价格和人情味记住，它们以后都用得上。',
      },
    ],
  },
  {
    id: 'quest_complete_starter_explore_shadow',
    label: '情报反馈',
    title: '你看见了另一面银河',
    trigger: { type: 'quest_complete', questId: 'starter_explore_shadow' },
    lines: [
      {
        speaker: '情报贩子 洛克',
        icon: '🕶️',
        text: '能从暗影港湾全身而退，说明你已经学会先观察再出价。',
      },
      {
        speaker: '情报贩子 洛克',
        icon: '🕶️',
        text: '记住那里的秩序不是写在墙上的，而是写在每个人的眼神里。以后你会再用到这份经验。',
      },
    ],
  },
  {
    id: 'phase_unlock_2',
    label: '章节过场',
    title: '第二章：立足',
    trigger: { type: 'phase_unlock', phaseId: 'phase_2' },
    lines: [
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '你的名字已经开始出现在区域任务板的推荐栏里。接下来，单次赚差价已经不够了。',
      },
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: function (state) {
          var decision = state.storyDecisions && state.storyDecisions.tutorial_postlude;
          if (decision === 'steady') {
            return '你当初说先跑稳妥委托，现在方向很明确了：把零散跑单，变成稳定的航线和资金积累。';
          }
          if (decision === 'network') {
            return '你当初想先扩航线和声望，现在正是时候把散点访问，织成真正可复用的商路网络。';
          }
          if (decision === 'shadow') {
            return '你当初想先摸高风险单子，现在先把资金和航线基础做稳。没有底盘，再好的冒险也只是冲动。';
          }
          return '第二章的重点是把零散跑单，变成稳定的航线和资金积累。银河开始把你当成真正的参与者。';
        },
      },
    ],
  },
  {
    id: 'phase_unlock_3',
    label: '章节过场',
    title: '第三章：崛起',
    trigger: { type: 'phase_unlock', phaseId: 'phase_3' },
    lines: [
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '资金能买到货，声望才能买到位置。你现在要面对的，不再只是价差，而是派系的目光。',
      },
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '从这一章开始，谁愿意和你做生意、谁愿意给你放行，会变得和利润同样重要。',
      },
    ],
  },
  {
    id: 'phase_unlock_4',
    label: '章节过场',
    title: '第四章：称霸',
    trigger: { type: 'phase_unlock', phaseId: 'phase_4' },
    lines: [
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '普通商人会盯着市场，巨头会塑造市场。你已经站到那条分界线上了。',
      },
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '高价值线路、跨星系单子和更大的风险，现在都会主动找上门。',
      },
    ],
  },
  {
    id: 'phase_unlock_5',
    label: '章节过场',
    title: '第五章：传奇',
    trigger: { type: 'phase_unlock', phaseId: 'phase_5' },
    lines: [
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '到了这一步，银河已经不再询问你能不能成功，而是在猜你会把秩序改写到什么程度。',
      },
      {
        speaker: '商会记录官 赫伯',
        icon: '📜',
        text: '传奇章节只留给那些能同时驾驭财富、声望与风险的人。接下来每一单，都会像宣言。',
      },
    ],
  },
].concat(
  _createQuestScenePair({
    questId: 'expand_profit_1000',
    acceptTitle: '账本上的第一道门槛',
    acceptFooter: '目标：累计利润 1,000 积分',
    acceptLines: [
      _line('港口经纪人 赛门', '📇', '一千积分听上去不大，但在商会账本里，那是从碰运气变成会算账的分界线。'),
      _line('港口经纪人 赛门', '📇', '把利润做出来。只要账面漂亮，更多线路和更好的委托自然会向你靠拢。'),
    ],
    completeTitle: '你不再只是试水的新手',
    completeLines: [
      _line('港口经纪人 赛门', '📇', '我刚看到你的结算单，利润已经过了四位数。你不再是试水的新手了。'),
      _line('港口经纪人 赛门', '📇', '从现在起，会有人开始认真记住你的报价和抵达时间。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'expand_deliver_tech',
    acceptTitle: '研究线不能停',
    acceptFooter: '目标：向新北京站交付 4 单位科技物资',
    acceptLines: [
      _line('科研采购官 林博士', '🧪', '新北京站的实验舱只差最后一批设备，就能把整条研究线重新点亮。'),
      _line('科研采购官 林博士', '🧪', '送来 4 单位科技物资。你送达的不是货箱，而是下一轮突破的时间差。'),
    ],
    completeTitle: '实验层重新亮了起来',
    completeLines: [
      _line('科研采购官 林博士', '🧪', '设备已经接入，整个实验层重新亮了。你这趟补上的，是研究署最缺的那口气。'),
      _line('科研采购官 林博士', '🧪', '科研圈很记人情。下次需要紧急转运时，我们知道该找谁。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'expand_water_crisis',
    acceptTitle: '前线用水危机',
    acceptFooter: '目标：8 天内向战争前线运送 10 单位水资源',
    acceptLines: [
      _line('前线协调员 萨姆', '🚨', '前线缺的不是火力，是能让人继续活下去的水。'),
      _line('前线协调员 萨姆', '🚨', '8 天内送到 10 单位水资源。晚一天，整个补给表都得跟着重排。'),
    ],
    completeTitle: '危机暂时被推开了',
    completeLines: [
      _line('前线协调员 萨姆', '🚨', '水箱重新灌满了，排队领水的人终于散了。'),
      _line('前线协调员 萨姆', '🚨', '你这次不是赚到差价，是替我们把一场危机往后推开了。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_profit_5000',
    acceptTitle: '利润猎手的试炼',
    acceptFooter: '目标：累计利润 5,000 积分',
    acceptLines: [
      _line('商会审计官 赫伯', '📈', '五千积分利润意味着你开始理解市场，不只是重复跑线。'),
      _line('商会审计官 赫伯', '📈', '做到这一步，下一批派系委托和高风险单子，才会把你当同类。'),
    ],
    completeTitle: '真正的竞争区到了',
    completeLines: [
      _line('商会审计官 赫伯', '📈', '五千利润达标。账面已经足够漂亮，漂亮到足以让人开始防备你。'),
      _line('商会审计官 赫伯', '📈', '欢迎来到真正的竞争区，这里每一笔钱都伴着更高的注视。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_fed_trade',
    acceptTitle: '联邦信誉测试单',
    acceptFooter: '目标：在银河联邦控制区完成 5 次贸易',
    acceptLines: [
      _line('联邦商务专员 凯拉', '🏛️', '联邦不会只看你赚了多少钱，还会看你在他们的港口里做事是否稳定可靠。'),
      _line('联邦商务专员 凯拉', '🏛️', '去联邦控制区做满 5 次交易。把信誉做出来，比一次暴利更值钱。'),
    ],
    completeTitle: '联邦开始把你当正式合作方',
    completeLines: [
      _line('联邦商务专员 凯拉', '🏛️', '五笔联邦区交易已经记录在案，你的履约表现比很多老承运人还稳。'),
      _line('联邦商务专员 凯拉', '🏛️', '从今天起，你不只是过路商人，而是联邦愿意持续接触的合作对象。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_tech_research',
    acceptTitle: '共同体样品交付',
    acceptFooter: '目标：在科技共同体区域卖出 6 单位科技产品',
    acceptLines: [
      _line('共同体联络员 阿莎', '🔬', '科技共同体欢迎有实力的供货方，但前提是你能把样品卖进他们最挑剔的实验港。'),
      _line('共同体联络员 阿莎', '🔬', '带 6 单位科技产品过来成交。价格不是重点，稳定和质量才是他们真正记住的东西。'),
    ],
    completeTitle: '实验港对你打开了门',
    completeLines: [
      _line('共同体联络员 阿莎', '🔬', '共同体已经确认你的供货表现，实验港的采购终端对你开放了更高权限。'),
      _line('共同体联络员 阿莎', '🔬', '别低估这份信号，能进入他们白名单的人，从来不只是会搬货。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_syndicate_sell',
    acceptTitle: '辛迪加的危险试探',
    acceptFooter: '目标：在星际辛迪加区域卖出 8 单位武器',
    acceptLines: [
      _line('暗网掮客 洛克', '🕶️', '辛迪加从不问你从哪来，他们只看你敢不敢把货带进来，还能不能带着钱出去。'),
      _line('暗网掮客 洛克', '🕶️', '去他们的地盘卖出 8 单位武器。别讲大道理，先让他们看到你有资格合作。'),
    ],
    acceptChoices: [
      _choice(
        'profit',
        '先把这笔高利润吃下来',
        [_line('暗网掮客 洛克', '🕶️', '够直接，我喜欢。记住，敢拿高利润的人，也得敢承担高波动。')],
        '更激进的表态',
        '回应立场：利润优先'
      ),
      _choice(
        'cautious',
        '先试一单，摸清辛迪加规矩',
        [_line('暗网掮客 洛克', '🕶️', '谨慎不是软弱，只要你看得够准，辛迪加反而更愿意跟这种人做长线。')],
        '更稳妥的表态',
        '回应立场：谨慎试探'
      ),
    ],
    completeTitle: '你通过了暗网的第一道门',
    completeLines: [
      _line('暗网掮客 洛克', '🕶️', function (state) {
        var decision = state.storyDecisions && state.storyDecisions.quest_accept_rise_syndicate_sell;
        if (decision === 'profit') {
          return '你果然是冲着利润去的，但更重要的是，你把这笔危险买卖做干净了。';
        }
        if (decision === 'cautious') {
          return '你说先试探水温，结果一步没乱，稳稳把辛迪加的第一道门踩开了。';
        }
        return '八单位军火已经在辛迪加地盘成交，这种单子能做干净，本身就是名片。';
      }),
      _line('暗网掮客 洛克', '🕶️', '从现在开始，他们会把你当成能谈更大买卖的人，而不是一次性棋子。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_50_trades',
    acceptTitle: '五十次往返的门槛',
    acceptFooter: '目标：累计完成 50 次贸易交易',
    acceptLines: [
      _line('商会统计员 温斯', '🧾', '五十次交易没有捷径，这比利润更能说明你是不是靠纪律活着。'),
      _line('商会统计员 温斯', '🧾', '把次数堆起来。只有跑过足够多的单子，航线才会真正长进你的直觉。'),
    ],
    completeTitle: '你已经形成了自己的节奏',
    completeLines: [
      _line('商会统计员 温斯', '🧾', '五十笔交易完成。你现在的节奏感，已经不是新手能模仿出来的。'),
      _line('商会统计员 温斯', '🧾', '继续跑下去，你很快就会不靠运气，而靠习惯和判断赚钱。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_deliver_luxury',
    acceptTitle: '贵族采购单',
    acceptFooter: '目标：向奢华港交付 6 单位奢侈品',
    acceptLines: [
      _line('贵族总管 伊莎贝尔', '💎', '奢华港的贵族愿意为准时和体面付高价，但他们对失误的容忍度接近于零。'),
      _line('贵族总管 伊莎贝尔', '💎', '送来 6 单位奢侈品。货物要完整，时间要漂亮，连包装都别显得廉价。'),
    ],
    completeTitle: '奢华港的门口记住了你',
    completeLines: [
      _line('贵族总管 伊莎贝尔', '💎', '货物签收完毕，宴会厅今晚不会因为缺货而失礼。'),
      _line('贵族总管 伊莎贝尔', '💎', '奢华港最看重的是稳定的体面，而你刚好把这件事做到了。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_deliver_weapons',
    acceptTitle: '前线重火力补单',
    acceptFooter: '目标：向战争前线交付 8 单位武器',
    acceptLines: [
      _line('战区军需官 维罗', '🪖', '前线的火力窗口只会开一小段时间，武器晚到，整个作战表都得重写。'),
      _line('战区军需官 维罗', '🪖', '送 8 单位武器过去。利润不会低，但真正值钱的是你能不能把窗口卡准。'),
    ],
    completeTitle: '战区火力线已经补上',
    completeLines: [
      _line('战区军需官 维罗', '🪖', '武器已经到位，前线原本准备缩减的火力线重新拉满了。'),
      _line('战区军需官 维罗', '🪖', '你这次送到的是决定节奏的东西，这比普通承运单更难，也更值。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_explore_10',
    acceptTitle: '核心星图补完计划',
    acceptFooter: '目标：造访 10 个核心星球',
    acceptLines: [
      _line('星图档案员 芙蕾', '🗺️', '熟悉几条赚钱航线不算真正理解银河，真正的商人得知道每个核心港口的脾气。'),
      _line('星图档案员 芙蕾', '🗺️', '去满 10 个核心星球。把路线装进脑子里，未来很多机会才看得出来。'),
    ],
    completeTitle: '核心航线已经刻进你的记忆',
    completeLines: [
      _line('星图档案员 芙蕾', '🗺️', '十个核心星球都留下了你的抵达记录，这意味着你已经不再依赖别人给路线。'),
      _line('星图档案员 芙蕾', '🗺️', '从现在开始，你看的不是地图，而是地图背后的机会密度。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_explore_20',
    acceptTitle: '更远的星图层',
    acceptFooter: '目标：造访 20 个不同星球',
    acceptLines: [
      _line('深空测绘员 塞拉', '🌌', '二十个星球之后，你接触的就不只是市场，而是整张银河的温差和节奏。'),
      _line('深空测绘员 塞拉', '🌌', '继续往外走。地图越厚，你能避开的风险和能抓住的机会就越多。'),
    ],
    completeTitle: '银河对你来说开始变小了',
    completeLines: [
      _line('深空测绘员 塞拉', '🌌', '二十个星球的访问记录已经回传，很多人一辈子都跑不出这个广度。'),
      _line('深空测绘员 塞拉', '🌌', '当银河开始变小，真正扩张的是你的判断半径。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_crystal_minerals',
    acceptTitle: '冰晶矿脉专单',
    acceptFooter: '目标：在冰晶行星采购矿石，并向银河帝都交付 8 单位',
    acceptLines: [
      _line('帝都采购使 诺兰', '💠', '冰晶行星的矿脉很值钱，但真正赚钱的是把它准点送进帝都仓单。'),
      _line('帝都采购使 诺兰', '💠', '先去水晶行星装满 8 单位矿石，再送到银河帝都。路线长，回报也足够像样。'),
    ],
    completeTitle: '帝都交易圈记住了你',
    completeLines: [
      _line('帝都采购使 诺兰', '💠', '帝都仓单已经盖章，冰晶矿石的竞价刚刚被你抬高了一轮。'),
      _line('帝都采购使 诺兰', '💠', '你这一趟跑出的不只是利润，还有进帝都交易圈说话的资格。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'rise_survival',
    acceptTitle: '离开舒适区的长航',
    acceptFooter: '目标：不返回太阳主星，持续航行 30 天并完成 20 次交易',
    acceptLines: [
      _line('老船长 哈克', '🧭', '真正的船长不是看他能飞多快，而是看他离开安全港之后还能不能继续做判断。'),
      _line('老船长 哈克', '🧭', '三十天别回太阳主星，再做满二十次交易。把自己扔到路上，才知道什么叫本事。'),
    ],
    completeTitle: '你已经像真正的老船长了',
    completeLines: [
      _line('老船长 哈克', '🧭', '三十天不回港还能稳定赚钱，这不是赌性，是成熟。'),
      _line('老船长 哈克', '🧭', '很多人有船，有货，有钱，但没有这种在长航里活下来的气质。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_fed_friendship',
    acceptTitle: '联邦之友考核',
    acceptFooter: '目标：将联邦关系提升至友好或以上',
    acceptLines: [
      _line('联邦外务官 凯拉', '🤝', '联邦愿意把通道和资源交给谁，从来不是看谁话说得好听，而是看谁持续可信。'),
      _line('联邦外务官 凯拉', '🤝', '把关系做进友好区间。等你走到那一步，联邦会主动给你更好的位置。'),
    ],
    completeTitle: '联邦把你写进了可信名单',
    completeLines: [
      _line('联邦外务官 凯拉', '🤝', '关系评级已经进入友好区间，你现在是联邦愿意优先对接的对象。'),
      _line('联邦外务官 凯拉', '🤝', '这份信任不会直接写在利润里，但会写在很多门禁和谈判顺序里。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_syndicate_ally',
    acceptTitle: '暗影网络的盟约',
    acceptFooter: '目标：将辛迪加关系提升至盟友',
    acceptLines: [
      _line('辛迪加执事 维恩', '🗡️', '辛迪加不会随便说“盟友”两个字，这比一纸合同贵得多。'),
      _line('辛迪加执事 维恩', '🗡️', '把关系抬到盟友区间。要做到这一步，你得先让他们相信你值这个价。'),
    ],
    completeTitle: '暗影网络正式向你敞开',
    completeLines: [
      _line('辛迪加执事 维恩', '🗡️', '辛迪加已经把你标记为盟友。很多原本不会流到公开市场的机会，现在会先经过你。'),
      _line('辛迪加执事 维恩', '🗡️', '别浪费这层关系，它能让你比多数人早一步看到真正的筹码。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_tech_ally',
    acceptTitle: '共同体深度合作',
    acceptFooter: '目标：将科技共同体关系提升至盟友',
    acceptLines: [
      _line('共同体代表 阿莎', '🧠', '共同体的盟约只给那些能同时守时、守密、守质量的人。'),
      _line('共同体代表 阿莎', '🧠', '把关系做到盟友。等你达到那一步，最前沿的货和消息才会优先流向你。'),
    ],
    completeTitle: '最前沿的门向你打开了',
    completeLines: [
      _line('共同体代表 阿莎', '🧠', '盟友资格已经生效。共同体现在把你视作可以长期共享窗口的人。'),
      _line('共同体代表 阿莎', '🧠', '你获得的不只是生意，还有最难得的先知权。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_profit_20000',
    acceptTitle: '财富风暴门槛',
    acceptFooter: '目标：累计利润 20,000 积分',
    acceptLines: [
      _line('资金顾问 艾德', '🏦', '两万利润不是好运能解释的数字，那是规模、纪律和耐心一起工作后的结果。'),
      _line('资金顾问 艾德', '🏦', '做到这一步，市场不会再把你当普通船主，而会当成能影响价格的人。'),
    ],
    completeTitle: '你的账本开始具备压迫感',
    completeLines: [
      _line('资金顾问 艾德', '🏦', '两万利润到了。恭喜，你的账本已经很有分量。'),
      _line('资金顾问 艾德', '🏦', '接下来别人研究的不会只是货价，还会研究你的航线和出手时机。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_luxury_circuit',
    acceptTitle: '奢华巡回合同',
    acceptFooter: '目标：在三座商业星球完成奢侈品巡回销售',
    acceptLines: [
      _line('奢华商会总管 伊莎贝尔', '👑', '真正的奢侈品生意，不在于卖得贵，而在于你能让不同港口同时觉得自己被优先对待。'),
      _line('奢华商会总管 伊莎贝尔', '👑', '去三座商业星球各卖出 5 单位奢侈品，把这条巡回线做成你的招牌。'),
    ],
    completeTitle: '你的巡回线成了新风向',
    completeLines: [
      _line('奢华商会总管 伊莎贝尔', '👑', '三地巡回全部成交，奢侈品流向已经因为你的节奏发生偏移。'),
      _line('奢华商会总管 伊莎贝尔', '👑', '做到这一点的人，不再是承运商，而是品类的塑形者。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_arms_race',
    acceptTitle: '战区军备竞赛',
    acceptFooter: '目标：25 天内向战争前线运送武器与矿石',
    acceptLines: [
      _line('战区军需官 维罗', '🪖', '前线要的不只是武器，还要能支撑生产线继续轰鸣的矿石。'),
      _line('战区军需官 维罗', '🪖', '25 天内送到 15 单位武器和 20 单位矿石。这是军备竞赛，不是普通订单。'),
    ],
    completeTitle: '火力表上有了你的名字',
    completeLines: [
      _line('战区军需官 维罗', '🪖', '清单全部核销。前线今天能开出来的火力，至少有一部分是你运来的。'),
      _line('战区军需官 维罗', '🪖', '别急着离港，军需处已经把你的名字列进优先承运名单了。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_medicine_tour',
    acceptTitle: '银河义诊路线',
    acceptFooter: '目标：向三座星球分别交付医药补给',
    acceptLines: [
      _line('医疗联合会 卢安', '💊', '义诊路线最大的难点不是一站，而是你得让三地同时感受到你没有放弃任何一处。'),
      _line('医疗联合会 卢安', '💊', '把 5 单位医药分别送到三个目标星球。别让任何一站觉得自己排在最后。'),
    ],
    completeTitle: '三地诊疗线都被你接了起来',
    completeLines: [
      _line('医疗联合会 卢安', '💊', '三地补给都已签收，义诊线今天终于能按计划开满。'),
      _line('医疗联合会 卢安', '💊', '很多人会做高利润单，能把救命线跑稳的人却不多。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_tech_monopoly',
    acceptTitle: '科技商品低买高卖',
    acceptFooter: '目标：从科研星买入科技商品，在军事星卖出并累计赚取 5,000',
    acceptLines: [
      _line('科技经纪人 维克', '⚙️', '科技货最赚钱的时刻，从来不是买入时，而是军事需求刚刚抬头的那几天。'),
      _line('科技经纪人 维克', '⚙️', '去新北京站低价装货，再把利润做到五千。只会搬货不够，你得会踩窗口。'),
    ],
    completeTitle: '你抓住了最贵的窗口',
    completeLines: [
      _line('科技经纪人 维克', '⚙️', '五千利润已经落袋，说明你不是碰巧买低卖高，而是真的读懂了窗口。'),
      _line('科技经纪人 维克', '⚙️', '市场里最贵的信息从来不写在屏幕上，它写在你刚才的决策里。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_explore_50',
    acceptTitle: '完整航图计划',
    acceptFooter: '目标：造访 50 个不同星球',
    acceptLines: [
      _line('星图档案长 芙蕾', '🪐', '五十个星球之后，地图对你来说不再是导航工具，而是资源分布图。'),
      _line('星图档案长 芙蕾', '🪐', '把整张航图的骨架跑通。未来你会发现，真正的优势是比别人早知道该往哪走。'),
    ],
    completeTitle: '整张航图对你开了光',
    completeLines: [
      _line('星图档案长 芙蕾', '🪐', '五十个星球的访问数据已经归档，你现在看银河，会像看一张可计算的网。'),
      _line('星图档案长 芙蕾', '🪐', '能把这么大的图记进脑子里的人，通常不会再靠别人领路。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'reign_galaxy_jump',
    acceptTitle: '第一次跨星系跃迁',
    acceptFooter: '目标：完成一次跨星系跃迁',
    acceptLines: [
      _line('跃迁管制官 罗恩', '🌀', '很多船长一辈子都在同一张星图里兜圈子，因为跨星系跃迁意味着你要重新理解边界。'),
      _line('跃迁管制官 罗恩', '🌀', '做一次真正的跨星系跃迁。到那一刻，你会知道银河到底有多大，也知道自己能去多远。'),
    ],
    completeTitle: '边界已经对你失效了',
    completeLines: [
      _line('跃迁管制官 罗恩', '🌀', '跃迁记录已确认，从这一刻开始，你不再受困于单一星图的逻辑。'),
      _line('跃迁管制官 罗恩', '🌀', '很多生意的价值，不在货，而在你能把边界当成成本而不是墙。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'legend_profit_50000',
    acceptTitle: '银河榜单线',
    acceptFooter: '目标：累计利润 50,000 积分',
    acceptLines: [
      _line('银河财经主播 艾塔', '📺', '五万积分利润，这已经不是成功商人的门槛，而是银河头部玩家的榜单线。'),
      _line('银河财经主播 艾塔', '📺', '把它做出来，你的名字就不再只出现在任务板，而会出现在市场传闻和年度榜单里。'),
    ],
    completeTitle: '你的名字进了榜单',
    completeLines: [
      _line('银河财经主播 艾塔', '📺', '五万利润达成。财经频道会喜欢这种故事：从一艘旧货船起步，最后把整条航道跑成自己的名字。'),
      _line('银河财经主播 艾塔', '📺', '从现在起，你卖的不只是货，还包括一种别人愿意追随的势头。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'legend_100_trades',
    acceptTitle: '百次交易纪录线',
    acceptFooter: '目标：累计完成 100 次贸易交易',
    acceptLines: [
      _line('商会史官 温斯', '📚', '一百次交易不是里程碑那么简单，它意味着你已经把买卖做成了自己的语言。'),
      _line('商会史官 温斯', '📚', '把次数跑到三位数。等你到线，别人研究的将不再是你能不能赚钱，而是你怎么赚钱。'),
    ],
    completeTitle: '你成了活的交易样本',
    completeLines: [
      _line('商会史官 温斯', '📚', '一百次交易完成，很多后来者会把你的路线和节奏当成学习样本。'),
      _line('商会史官 温斯', '📚', '能把交易做成习惯的人很多，能把习惯做成体系的人不多。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'legend_grand_tour',
    acceptTitle: '银河壮游记录',
    acceptFooter: '目标：访问 30 个星球并完成 50 笔交易',
    acceptLines: [
      _line('游记编修 米娅', '✒️', '壮游从来不是“去过很多地方”这么简单，而是你得在路上持续活着、持续赚钱、持续判断。'),
      _line('游记编修 米娅', '✒️', '跑满 30 个星球，再完成 50 笔交易。做完这件事，你的航线本身就能当故事讲。'),
    ],
    completeTitle: '你的航线已经足够写成传记',
    completeLines: [
      _line('游记编修 米娅', '✒️', '三十星球与五十笔交易的壮游记录已经齐了。很多人梦想远行，你却把远行做成了结果。'),
      _line('游记编修 米娅', '✒️', '这已经不是旅程，而是一份足以写进商会年鉴的履历。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'legend_all_factions',
    acceptTitle: '三方调停者的考验',
    acceptFooter: '目标：同时维持三大派系友好关系',
    acceptLines: [
      _line('调停官 塞文', '⚖️', '赚钱的人很多，能让三大派系同时点头的人极少，因为他们彼此看法从来不一致。'),
      _line('调停官 塞文', '⚖️', '把三方关系都抬进友好区间。做到这一步，你就不再只是商人，而是平衡者。'),
    ],
    completeTitle: '三大派系都愿意跟你谈',
    completeLines: [
      _line('调停官 塞文', '⚖️', '三方关系全部进入友好区间，这意味着你已经拥有最稀缺的一种信用：跨阵营信用。'),
      _line('调停官 塞文', '⚖️', '以后很多原本注定谈不拢的事，会因为你在场而多出一个解法。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'legend_ultimate_delivery',
    acceptTitle: '终极快递调度单',
    acceptFooter: '目标：15 天内完成五站联运',
    acceptLines: [
      _line('银河调度总管 玛洛', '🧭', '五站联运、十五天、每一站都是不同物资。普通承运人看到这张单子只会先算违约金。'),
      _line('银河调度总管 玛洛', '🧭', '如果你敢接，就别按单点利润思考了。把整条航线当成一场精密调度，才有机会做成。'),
    ],
    completeTitle: '这已经能写进培训手册了',
    completeLines: [
      _line('银河调度总管 玛洛', '🧭', '五个站点全部签收，整条调度链一次没断。'),
      _line('银河调度总管 玛洛', '🧭', '这已经不是“准时送达”能概括的水平了，这是能写进商会培训手册的范例。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'legend_galaxy_master',
    acceptTitle: '银河之主终局线',
    acceptFooter: '目标：100 笔交易、100,000 利润、50 星球访问',
    acceptLines: [
      _line('商会总评议长 塔洛斯', '🌠', '银河之主不是头衔，而是一个证明题：你能否在规模、利润和覆盖面上同时站到顶端。'),
      _line('商会总评议长 塔洛斯', '🌠', '做满一百笔交易、十万利润、五十星球。等你把三项同时完成，任何人都很难再否认你的位置。'),
    ],
    completeTitle: '你已经把整张银河跑成了自己的版图',
    completeLines: [
      _line('商会总评议长 塔洛斯', '🌠', '三项条件全部完成。你证明的不是单点能力，而是对整张银河商业网络的掌控力。'),
      _line('商会总评议长 塔洛斯', '🌠', '从这一刻起，“银河之主”不再是夸饰，而是别人不得不接受的事实。'),
    ],
  }),
  _createQuestScenePair({
    questId: 'expand_first_research',
    acceptTitle: '把公司变成学习型组织',
    acceptFooter: '目标：完成第一项科技研究',
    acceptLines: [_line('研究主管 阿莎', '🔬', '跑得更远之前，先让公司学会把经验变成技术。')],
    completeTitle: '第一条科研线已点亮',
    completeLines: [_line('研究主管 阿莎', '🔬', '研究已归档，从现在起，航线和市场之外又多了一条成长线。')],
  }),
  _createQuestScenePair({
    questId: 'expand_first_survey',
    acceptTitle: '完成第一份探索报告',
    acceptFooter: '目标：调查一个探索点',
    acceptLines: [_line('测绘员 芙蕾', '🛰️', '价格只告诉你当下，探索报告能告诉你一个地方以后适合做什么。')],
    completeTitle: '第一份探索报告已完成',
    completeLines: [_line('测绘员 芙蕾', '🛰️', '探索点调查已经归档，这份情报会影响贸易站和远征选择。')],
  }),
  _createQuestScenePair({
    questId: 'rise_crew_roster',
    acceptTitle: '从一艘船到一支队伍',
    acceptFooter: '目标：招募船员并建立两舰编制',
    acceptLines: [_line('舰务官 蕾娜', '🚢', '只有船不算舰队，只有名字也不算团队。把人和船一起组织起来。')],
    completeTitle: '舰队组织已成形',
    completeLines: [_line('舰务官 蕾娜', '🚢', '船员与两舰编制已到位，公司终于有了可以并行工作的骨架。')],
  }),
  _createQuestScenePair({
    questId: 'rise_dispatch_network',
    acceptTitle: '让航线在你离开后继续运转',
    acceptFooter: '目标：建立第一条自动跑商路线',
    acceptLines: [_line('调度员 玛洛', '📡', '真正的规模，是你不在现场时生意仍然能按计划跑下去。')],
    completeTitle: '第一条自动跑商路线已上线',
    completeLines: [_line('调度员 玛洛', '📡', '自动跑商已经开始运转，你现在管理的不再只是当前驾驶舱。')],
  }),
  _createQuestScenePair({
    questId: 'rise_capital_tools',
    acceptTitle: '学会使用贷款和投资',
    acceptFooter: '目标：完成一次贷款或贸易站投资',
    acceptLines: [_line('资金顾问 艾德', '🏦', '贷款能提前扩张，投资能带来长期收入。先做一次小额操作，看看它怎样改变经营节奏。')],
    completeTitle: '贷款与投资已经进入经营循环',
    completeLines: [_line('资金顾问 艾德', '🏦', '第一次操作已记账。接下来要记住，放大收益的工具也会放大判断错误。')],
  }),
  _createQuestScenePair({
    questId: 'reign_first_station',
    acceptTitle: '把航线钉在星图上',
    acceptFooter: '目标：建成第一座贸易站',
    acceptLines: [_line('商网规划师 洛琳', '🏪', '船只会移动，贸易站会留下。选一个你真正了解的地点，建起第一座贸易站。')],
    completeTitle: '贸易网络有了第一个落脚点',
    completeLines: [_line('商网规划师 洛琳', '🏪', '贸易站已投运，从此你的收益不再只来自亲自完成的单子。')],
  }),
  _createQuestScenePair({
    questId: 'legend_integrated_empire',
    acceptTitle: '证明所有系统真的在一起工作',
    acceptFooter: '目标：整合科研、舰队、船员、贸易站与跨银河航图',
    acceptLines: [_line('总评议长 塔洛斯', '🌠', '单个系统做得好只是专长，能让它们同时运转，才是一个星际组织的成熟。')],
    completeTitle: '一个完整的星际体系已经成形',
    completeLines: [_line('总评议长 塔洛斯', '🌠', '科研、舰队、船员、商网和航图都已达标。这不再是一家小公司的数据。')],
  }),
  _createQuestScenePair({
    questId: 'legend_policy_commitment',
    acceptTitle: '为最终路线承担代价',
    acceptFooter: '目标：选择一条不可更改的长期路线',
    acceptLines: [_line('路线顾问 塞文', '📜', '传奇不是把所有优势都拿走，而是明知道代价，仍然选择一条路走到底。')],
    completeTitle: '你的长期路线已经生效',
    completeLines: [_line('路线顾问 塞文', '📜', '选择已写入存档。从现在起，收益和代价都会跟随你的路线。')],
  })
);
