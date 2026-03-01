// js/data/events.js — 随机事件定义（群星风格：多选项 + 后果）
// 依赖：data/systems.js
// 导出：RANDOM_EVENTS

import { getSystemsByGalaxy } from './systems.js';

/**
 * 事件结构：
 * {
 *   id:          唯一标识
 *   title:       事件标题
 *   description: 事件描述（剧情文本）
 *   icon:        事件图标 emoji
 *   weight:      出现权重（越高越常见）
 *   condition:   (state) => boolean  触发前置条件（可选）
 *   choices:     [ { text, tooltip, effect: (state) => msgs[] } ]
 * }
 *
 * effect 返回 { msgs: [{text, type}], stateChanges: {} }
 */

export const RANDOM_EVENTS = [
  // ===== 贸易类事件 =====
  {
    id: 'merchant_caravan',
    title: '流浪商队',
    description: '一支星际流浪商队出现在附近星域。他们携带着来自银河边缘的珍稀货物，提出与你进行交易。商队领袖看了看你的飞船，露出了神秘的微笑。',
    icon: '🐪',
    weight: 15,
    choices: [
      {
        text: '进行友好贸易',
        tooltip: '花费 200 积分，获得随机高价值商品',
        effect(state) {
          if (state.credits < 200) {
            return { msgs: [{ text: '💰 积分不足，商队摇了摇头离开了。', type: 'error' }] };
          }
          state.credits -= 200;
          const rareCargo = ['technology', 'luxury', 'medicine'];
          const goodId = rareCargo[Math.floor(Math.random() * rareCargo.length)];
          const qty = 3 + Math.floor(Math.random() * 5);
          const actual = Math.min(qty, state.maxCargo - Object.values(state.cargo).reduce((s, q) => s + q, 0));
          if (actual > 0) {
            state.cargo[goodId] = (state.cargo[goodId] || 0) + actual;
          }
          return {
            msgs: [
              { text: '🐪 你与流浪商队达成交易，花费 200 积分，获得 ' + actual + ' 单位珍稀货物！', type: 'sell' },
            ],
          };
        },
      },
      {
        text: '询问银河情报',
        tooltip: '获得一条市场价格信息',
        effect(state) {
          state.reputation = (state.reputation || 0) + 50;
          return {
            msgs: [
              { text: '🗣️ 商队领袖低声告诉你一条重要的贸易路线情报。声望 +50', type: 'info' },
            ],
          };
        },
      },
      {
        text: '无视他们，继续航行',
        tooltip: '安全但没有收益',
        effect() {
          return { msgs: [{ text: '你谨慎地避开了商队，继续航行。', type: 'info' }] };
        },
      },
    ],
  },

  {
    id: 'pirate_ambush',
    title: '海盗伏击',
    description: '警告！前方检测到多个不明飞行物信号！这是一支星际海盗的伏击编队。他们正在锁定你的飞船，通讯频道传来威胁："交出货物，或者我们自己来取！"',
    icon: '☠️',
    weight: 12,
    choices: [
      {
        text: '交出部分货物',
        tooltip: '失去 30% 货物，安全脱身',
        effect(state) {
          const msgs = [];
          let lostAny = false;
          Object.keys(state.cargo).forEach(goodId => {
            const lost = Math.ceil(state.cargo[goodId] * 0.3);
            if (lost > 0) {
              state.cargo[goodId] -= lost;
              if (state.cargo[goodId] <= 0) delete state.cargo[goodId];
              lostAny = true;
            }
          });
          if (lostAny) {
            msgs.push({ text: '☠️ 海盗抢走了你 30% 的货物！但你安全脱身了。', type: 'error' });
          } else {
            msgs.push({ text: '☠️ 海盗搜查了你的空货舱，骂骂咧咧地离开了。', type: 'info' });
          }
          return { msgs };
        },
      },
      {
        text: '支付保护费',
        tooltip: '花费 500 积分，保全所有货物',
        effect(state) {
          const cost = Math.min(500, state.credits);
          state.credits -= cost;
          return {
            msgs: [{ text: '💰 你支付了 ' + cost + ' 积分作为"过路费"，海盗放行了。', type: 'error' }],
          };
        },
      },
      {
        text: '全速逃跑！',
        tooltip: '消耗额外燃料，50% 概率成功逃脱',
        effect(state) {
          const fuelCost = 15;
          state.fuel = Math.max(0, state.fuel - fuelCost);
          if (Math.random() < 0.5) {
            return {
              msgs: [{ text: '🚀 引擎全开！你成功甩掉了海盗！消耗 ' + fuelCost + ' 额外燃料。', type: 'travel' }],
            };
          } else {
            // 失败，失去部分货物
            Object.keys(state.cargo).forEach(goodId => {
              const lost = Math.ceil(state.cargo[goodId] * 0.5);
              state.cargo[goodId] -= lost;
              if (state.cargo[goodId] <= 0) delete state.cargo[goodId];
            });
            state.shipHull = Math.max(0, (state.shipHull || 100) - 20);
            return {
              msgs: [
                { text: '💥 逃跑失败！海盗击中了你的飞船，抢走了 50% 的货物。', type: 'error' },
                { text: '🔧 飞船受损，船体完整度 -20。', type: 'error' },
              ],
            };
          }
        },
      },
    ],
  },

  {
    id: 'distress_signal',
    title: '求救信号',
    description: '你的通讯系统接收到一个微弱的求救信号。信号来自附近一艘失去动力的小型运输船。扫描显示船上有生命体征，但飞船周围的能量场不太稳定。',
    icon: '🆘',
    weight: 10,
    choices: [
      {
        text: '前往救援',
        tooltip: '消耗 10 燃料，可能获得感谢和奖励',
        effect(state) {
          state.fuel = Math.max(0, state.fuel - 10);
          if (Math.random() < 0.7) {
            const reward = 300 + Math.floor(Math.random() * 500);
            state.credits += reward;
            state.reputation = (state.reputation || 0) + 100;
            return {
              msgs: [
                { text: '🆘 你成功救出了遇难船员！他们感激不尽。', type: 'info' },
                { text: '💰 获得 ' + reward + ' 积分奖励。声望 +100', type: 'sell' },
              ],
            };
          } else {
            state.shipHull = Math.max(0, (state.shipHull || 100) - 10);
            return {
              msgs: [
                { text: '⚠️ 救援过程中飞船被不稳定的能量场损伤，但船员获救了。', type: 'error' },
                { text: '🔧 船体完整度 -10。声望 +100', type: 'info' },
              ],
            };
          }
        },
      },
      {
        text: '扫描残骸',
        tooltip: '不救人，但搜刮物资',
        effect(state) {
          const loot = Math.floor(Math.random() * 200) + 50;
          state.credits += loot;
          state.reputation = (state.reputation || 0) - 30;
          return {
            msgs: [
              { text: '🔍 你从残骸中搜刮了 ' + loot + ' 积分的物资。求救信号逐渐消失了……', type: 'sell' },
              { text: '📉 你的声望因无视求救而下降。声望 -30', type: 'error' },
            ],
          };
        },
      },
      {
        text: '记录坐标，继续航行',
        tooltip: '安全但不救助',
        effect() {
          return {
            msgs: [{ text: '📡 你记录了信号坐标并发送给最近的星际巡逻队，然后继续航行。', type: 'info' }],
          };
        },
      },
    ],
  },

  {
    id: 'solar_storm',
    title: '超新星冲击波',
    description: '船载传感器检测到一波强烈的超新星冲击波正在朝你的方向袭来！能量读数不断攀升，你必须在几秒钟内做出决定。',
    icon: '🌟',
    weight: 8,
    choices: [
      {
        text: '启动紧急护盾',
        tooltip: '消耗 20 燃料抵御冲击波',
        effect(state) {
          state.fuel = Math.max(0, state.fuel - 20);
          return {
            msgs: [{ text: '🛡️ 紧急护盾在最后一刻启动！冲击波被偏转，消耗 20 燃料。', type: 'travel' }],
          };
        },
      },
      {
        text: '利用冲击波加速',
        tooltip: '高风险：成功则节省燃料，失败则受损',
        effect(state) {
          if (Math.random() < 0.4) {
            state.fuel = Math.min(state.maxFuel, state.fuel + 30);
            return {
              msgs: [{ text: '🌊 天才驾驶！你利用冲击波为飞船充能，获得 30 额外燃料！', type: 'sell' }],
            };
          } else {
            state.shipHull = Math.max(0, (state.shipHull || 100) - 25);
            const lost = Math.floor(Math.random() * 200) + 100;
            state.credits = Math.max(0, state.credits - lost);
            return {
              msgs: [
                { text: '💥 冲击波撕裂了飞船外壳！船体受损严重。', type: 'error' },
                { text: '🔧 船体完整度 -25，维修费用 ' + lost + ' 积分。', type: 'error' },
              ],
            };
          }
        },
      },
    ],
  },

  {
    id: 'abandoned_station',
    title: '废弃空间站',
    description: '导航系统检测到一座被遗忘的空间站漂浮在星际虚空中。站体外壳上覆盖着厚重的陨石尘埃，但内部似乎仍有微弱能量信号。这是远古星际文明的遗迹，还是近期废弃的前哨站？',
    icon: '🏚️',
    weight: 8,
    choices: [
      {
        text: '深入探索空间站',
        tooltip: '需要 15 燃料，可能发现珍贵物品',
        effect(state) {
          state.fuel = Math.max(0, state.fuel - 15);
          const roll = Math.random();
          if (roll < 0.3) {
            const reward = 800 + Math.floor(Math.random() * 1200);
            state.credits += reward;
            return {
              msgs: [
                { text: '🏚️ 你在空间站深处发现了一个完好的保险库！', type: 'info' },
                { text: '💰 获得 ' + reward + ' 积分的珍贵物资！', type: 'sell' },
              ],
            };
          } else if (roll < 0.6) {
            const goodId = 'technology';
            const qty = 2 + Math.floor(Math.random() * 4);
            const actual = Math.min(qty, state.maxCargo - Object.values(state.cargo).reduce((s, q) => s + q, 0));
            if (actual > 0) state.cargo[goodId] = (state.cargo[goodId] || 0) + actual;
            return {
              msgs: [{ text: '🔬 发现了 ' + actual + ' 单位古代科技零件！', type: 'sell' }],
            };
          } else {
            state.shipHull = Math.max(0, (state.shipHull || 100) - 15);
            return {
              msgs: [
                { text: '⚠️ 空间站内部突然启动了自动防御系统！', type: 'error' },
                { text: '🔧 飞船在撤退时受损。船体完整度 -15', type: 'error' },
              ],
            };
          }
        },
      },
      {
        text: '远距离扫描',
        tooltip: '安全但收益较少',
        effect(state) {
          state.reputation = (state.reputation || 0) + 30;
          return {
            msgs: [
              { text: '📡 扫描数据已记录，这些信息对银河考古学界很有价值。声望 +30', type: 'info' },
            ],
          };
        },
      },
      {
        text: '标记位置后离开',
        tooltip: '安全，无收益',
        effect() {
          return {
            msgs: [{ text: '📍 你在星图上标记了空间站的位置，也许以后会用到。', type: 'info' }],
          };
        },
      },
    ],
  },

  {
    id: 'trade_festival',
    title: '星际贸易节',
    description: '你抵达时恰逢当地星球一年一度的"星际贸易节"！港口装饰一新，各路商人云集。本地政府宣布今日所有贸易税减免 50%，并提供免费补给。',
    icon: '🎉',
    weight: 6,
    choices: [
      {
        text: '参加贸易节庆典',
        tooltip: '获得免费补给和积分奖励',
        effect(state) {
          state.fuel = Math.min(state.maxFuel, state.fuel + 25);
          const bonus = 100 + Math.floor(Math.random() * 200);
          state.credits += bonus;
          state.reputation = (state.reputation || 0) + 50;
          return {
            msgs: [
              { text: '🎉 贸易节气氛热烈！你获得了 25 单位免费燃料和 ' + bonus + ' 积分奖金！', type: 'sell' },
              { text: '🎊 声望 +50。今天是个好日子！', type: 'info' },
            ],
          };
        },
      },
      {
        text: '趁乱大量进货',
        tooltip: '获得额外折扣积分',
        effect(state) {
          const bonus = 300;
          state.credits += bonus;
          return {
            msgs: [
              { text: '📊 你利用贸易节的低价环境精明地调整了库存。获得 ' + bonus + ' 积分的差价收益！', type: 'sell' },
            ],
          };
        },
      },
    ],
  },

  {
    id: 'wormhole_anomaly',
    title: '虫洞异常',
    description: '空间扫描仪发出刺耳的警报——前方出现了一个不稳定的时空裂缝！这个微型虫洞正在缓慢收缩，但它似乎连接着银河系的另一个角落。通过虫洞可能会跳过漫长的航行，但风险未知。',
    icon: '🌀',
    weight: 5,
    choices: [
      {
        text: '穿越虫洞！',
        tooltip: '随机传送到另一个星系，结果不确定',
        effect(state) {
          // 随机传送到一个不同的星系
          const curPlanets = getSystemsByGalaxy(state.currentGalaxy || 'milky_way');
          const others = curPlanets.filter(p => p.id !== state.currentSystem && (state.playerLevel || 1) >= (p.minLevel || 1));
          if (others.length === 0) return { msgs: [{ text: '🌀 虫洞畸变了，你留在了原地。', type: 'travel' }] };
          const dest = others[Math.floor(Math.random() * others.length)];
          state.currentSystem = dest.id;
          state.day += 1;
          return {
            msgs: [
              { text: '🌀 你纵身跃入虫洞！时空扭曲中你失去了方向感……', type: 'travel' },
              { text: '📍 虫洞将你传送到了一个新的星系！', type: 'travel' },
            ],
          };
        },
      },
      {
        text: '采集虫洞能量',
        tooltip: '获得燃料但有损坏风险',
        effect(state) {
          if (Math.random() < 0.6) {
            state.fuel = Math.min(state.maxFuel, state.fuel + 40);
            return {
              msgs: [{ text: '⚡ 你成功从虫洞边缘采集了 40 单位能量！', type: 'sell' }],
            };
          } else {
            state.shipHull = Math.max(0, (state.shipHull || 100) - 15);
            state.fuel = Math.min(state.maxFuel, state.fuel + 15);
            return {
              msgs: [
                { text: '💥 采集过程中虫洞突然脉动，飞船受到冲击！', type: 'error' },
                { text: '⚡ 采集了 15 单位能量，但船体完整度 -15。', type: 'error' },
              ],
            };
          }
        },
      },
      {
        text: '绕道而行',
        tooltip: '安全规避',
        effect(state) {
          state.fuel = Math.max(0, state.fuel - 5);
          return {
            msgs: [{ text: '↩️ 你谨慎地绕开了虫洞，消耗 5 额外燃料。', type: 'info' }],
          };
        },
      },
    ],
  },

  {
    id: 'alien_artifact',
    title: '远古文明遗物',
    description: '飞船的考古扫描仪检测到一个强烈的文明遗迹信号！在漂浮的小行星碎片中，一个散发着蓝色光芒的物体引起了你的注意。这可能是远古第一银河帝国留下的科技结晶。',
    icon: '🏺',
    weight: 4,
    choices: [
      {
        text: '小心取回遗物',
        tooltip: '获得大量积分或科技',
        effect(state) {
          const roll = Math.random();
          if (roll < 0.5) {
            const value = 1000 + Math.floor(Math.random() * 2000);
            state.credits += value;
            return {
              msgs: [
                { text: '🏺 遗物是一件价值连城的远古艺术品！', type: 'info' },
                { text: '💰 你将它出售给了银河考古协会，获得 ' + value + ' 积分！', type: 'sell' },
              ],
            };
          } else {
            // 科技发现 - 增加飞船能力
            state.maxCargo += 5;
            state.maxFuel += 20;
            return {
              msgs: [
                { text: '🏺 遗物中蕴含着远古科技！你的工程师成功解析了部分数据。', type: 'info' },
                { text: '📦 货舱容量 +5，最大燃料 +20！', type: 'upgrade' },
              ],
            };
          }
        },
      },
      {
        text: '上报给银河考古协会',
        tooltip: '大量声望奖励',
        effect(state) {
          state.reputation = (state.reputation || 0) + 200;
          state.credits += 500;
          return {
            msgs: [
              { text: '📜 银河考古协会对你的发现赞叹不已！声望 +200', type: 'info' },
              { text: '💰 作为发现者，你获得了 500 积分的奖金。', type: 'sell' },
            ],
          };
        },
      },
    ],
  },

  {
    id: 'fuel_crisis',
    title: '能源危机',
    description: '前方星域爆发了大规模的能源危机！多个星球的燃料供应链断裂，价格飙升。这对你来说既是危险（燃料难以补充），也是巨大的商业机会。',
    icon: '⚠️',
    weight: 7,
    choices: [
      {
        text: '趁机囤积燃料转卖',
        tooltip: '花费积分，获得大量燃料商品',
        effect(state) {
          const cost = 300;
          if (state.credits < cost) {
            return { msgs: [{ text: '💰 积分不足，无法抓住这个机会。', type: 'error' }] };
          }
          state.credits -= cost;
          const qty = 8;
          const space = state.maxCargo - Object.values(state.cargo).reduce((s, q) => s + q, 0);
          const actual = Math.min(qty, space);
          if (actual > 0) state.cargo['fuel'] = (state.cargo['fuel'] || 0) + actual;
          return {
            msgs: [{ text: '⚡ 你花费 ' + cost + ' 积分在危机价格下囤积了 ' + actual + ' 单位燃料。去高价星球卖掉它们！', type: 'buy' }],
          };
        },
      },
      {
        text: '向受困星球援助',
        tooltip: '失去部分燃料，大幅提升声望',
        effect(state) {
          const gift = Math.min(20, state.fuel);
          state.fuel -= gift;
          state.reputation = (state.reputation || 0) + 150;
          state.credits += 200;
          return {
            msgs: [
              { text: '🤝 你向受困星球捐赠了 ' + gift + ' 单位燃料。人们将铭记你的善举！', type: 'info' },
              { text: '📈 声望 +150，感恩的居民赠予你 200 积分。', type: 'sell' },
            ],
          };
        },
      },
      {
        text: '避开危机区域',
        tooltip: '绕路消耗额外燃料',
        effect(state) {
          state.fuel = Math.max(0, state.fuel - 10);
          return {
            msgs: [{ text: '↩️ 你选择绕开危机星域，额外消耗 10 燃料。', type: 'info' }],
          };
        },
      },
    ],
  },

  {
    id: 'mysterious_signal',
    title: '神秘信号',
    description: '你的长波接收器捕获到了一段加密信号。经过初步解析，这似乎是一条来自银河系外缘的坐标数据。信号格式与已知文明的通讯协议都不匹配。这究竟是谁发出的？',
    icon: '📡',
    weight: 5,
    choices: [
      {
        text: '追踪信号源',
        tooltip: '消耗燃料追踪，可能有重大发现',
        effect(state) {
          state.fuel = Math.max(0, state.fuel - 20);
          if (Math.random() < 0.35) {
            const bigReward = 2000 + Math.floor(Math.random() * 3000);
            state.credits += bigReward;
            state.reputation = (state.reputation || 0) + 100;
            return {
              msgs: [
                { text: '📡 信号引导你找到了一个隐藏的太空宝库！', type: 'info' },
                { text: '💰 你发现了价值 ' + bigReward + ' 积分的远古财宝！声望 +100', type: 'sell' },
              ],
            };
          } else {
            return {
              msgs: [
                { text: '📡 追踪了很久，信号突然消失了。也许只是宇宙噪声……消耗了 20 燃料。', type: 'info' },
              ],
            };
          }
        },
      },
      {
        text: '出售信号数据',
        tooltip: '稳定收益，无风险',
        effect(state) {
          state.credits += 400;
          return {
            msgs: [{ text: '💾 你将加密信号数据出售给了星际情报机构，获得 400 积分。', type: 'sell' }],
          };
        },
      },
      {
        text: '忽略信号',
        tooltip: '什么都不做',
        effect() {
          return { msgs: [{ text: '📡 你关闭了长波接收器，继续原定航线。', type: 'info' }] };
        },
      },
    ],
  },
];
