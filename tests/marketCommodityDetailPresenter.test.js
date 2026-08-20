import { describe, expect, it } from 'vitest';
import {
  buildMarketCommodityContextView,
  buildMarketCommodityDetailView,
} from '../js/ui/MarketCommodityDetailPresenter.js';

function createModel(overrides) {
  return Object.assign({
    good: {
      id: 'food',
      name: '食物',
      emoji: '🌾',
      basePrice: 10,
      desc: '维持生命的基本食物',
      legality: 'legal',
      marketAccess: ['open'],
      upstream: [{ goodId: 'water', weight: 0.5 }],
    },
    system: { id: 'sol_prime', name: '太阳主星' },
    marketMode: 'open',
    buyPrice: 12,
    sellPrice: 9,
    supplyDemand: { ratio: 1.25 },
    held: 3,
    credits: 125,
  }, overrides || {});
}

describe('MarketCommodityDetailPresenter', function () {
  it('Context 摘要发布单一局部详情 intent', function () {
    var view = buildMarketCommodityContextView(createModel());

    expect(view.title).toBe('商品检查');
    expect(view.html).toContain('太阳主星 · 公开市场');
    expect(view.html).toContain('<small>货舱</small><strong>3</strong>');
    expect(view.html).toContain('data-context-action="open-detail" data-good-id="food"');
    expect(view.html).toContain('查看完整商品详情');
  });

  it('L4 详情呈现交易判断而不复制买卖确认动作', function () {
    var view = buildMarketCommodityDetailView(createModel());

    expect(view.title).toBe('食物 · 商品详情');
    expect(view.html).toContain('data-market-commodity-detail="food"');
    expect(view.html).toContain('<small>现金承载</small><strong>10 单位</strong>');
    expect(view.html).toContain('受上游商品成本影响');
    expect(view.html).toContain('买卖仍在商业工作区内确认');
    expect(view.html).not.toContain('data-market-command');
  });

  it('所有领域字符串转义且缺少核心对象时拒绝投影', function () {
    var hostile = createModel({
      good: {
        id: 'x" onclick="bad',
        name: '<img src=x>',
        emoji: '<svg>',
        basePrice: 1,
        desc: '<script>bad()</script>',
        legality: 'restricted',
        marketAccess: ['open', 'black'],
        upstream: [],
      },
      system: { id: 's', name: 'A&B' },
    });
    var context = buildMarketCommodityContextView(hostile);
    var detail = buildMarketCommodityDetailView(hostile);

    expect(context.html).not.toContain('<script>');
    expect(context.html).not.toContain('<img');
    expect(context.html).toContain('A&amp;B');
    expect(context.html).toContain('data-good-id="x&quot; onclick=&quot;bad"');
    expect(detail.html).toContain('data-market-commodity-detail="x&quot; onclick=&quot;bad"');
    expect(detail.html).toContain('公开市场 / 黑市');
    expect(buildMarketCommodityContextView({})).toBe(null);
    expect(buildMarketCommodityDetailView({ good: hostile.good })).toBe(null);
  });
});
