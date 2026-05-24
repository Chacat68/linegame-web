# 商业终端下一笔商网动作实施计划

> 日期：2026-05-22  
> 目标：在商业终端内给出一条最值得执行的商网动作，帮助玩家把资金投入中期经营。  
> 架构：动作评估放在 `TradeStationSystem`，`MarketUI` 只渲染卡片并复用现有按钮动作。  
> 技术栈：Vanilla JS ES Modules、Vitest、现有商网和行动引导结构。

---

## 1. 当前基线

- 商网页已经有本地经营、网络总览、站点列表。
- 贸易站系统已经能输出候选、已建站点、区域协同、预计收益。
- 行动条已有商网投入建议，但商业终端内部还没有“下一笔最优动作”。

## 2. 关键设计

- 新增 `TradeStation.getNextNetworkAction(state)`，只返回一个动作。
- 返回结构：

```js
{
  id: 'build-network-synergy-nova_station',
  type: 'build',
  priority: 82,
  title: '补齐银河系补给商贸环',
  reason: '在新北京站建站后可触发补给商贸环，区域日收益 +6%。',
  actionLabel: '投资 100,000',
  systemId: 'nova_station',
  payload: { action: 'market-build-station', systemId: 'nova_station' }
}
```

- 动作优先级：
  - 可负担且能触发新区域协同的建站动作。
  - 可负担且 ROI 明显的单站升级。
  - 无管理员且可负担的站点派经理。
  - 勘探策略推荐和当前策略不一致的切换策略。
  - 有候选但资金不足时，返回资金不足动作说明，不生成不可点击按钮。
- 不和底部行动条抢职责：该卡只出现在商业终端经营页，不全局弹出。

## 3. 实施步骤

1. 在 `TradeStationSystem.js` 实现 `getNextNetworkAction(state)`。
2. 复用现有 `getBuildCandidates()`、`getOwnedStations()`，不要重复计算收益规则。
3. 在 `MarketUI` 的“商业网络总览”下方新增“下一笔商网动作”卡片。
4. 卡片按钮使用现有 `data-action`：
   - `market-build-station`
   - `market-upgrade-station`
   - `market-hire-manager`
   - `market-set-strategy`
5. 如果动作不可负担，展示原因和建议资金缺口，不渲染可点击按钮。
6. 不新增存档字段，不自动执行批量动作。

## 4. 测试计划

- `tests/tradeStation.test.js`
  - 有协同候选时优先推荐建站。
  - 无协同候选但可升级时推荐升级。
  - 站点未派经理且预算足够时推荐派经理。
  - 资金不足时返回 disabled reason。
- `tests/marketUiFocus.test.js`
  - 商业终端展示下一笔商网动作标题、原因和按钮 payload。

## 5. 验收

- 玩家打开商网页后能看到一条明确可执行的商网动作。
- 推荐动作可解释，不是单纯按收益数字排序。
- 当前没有可执行动作时显示“暂无需要处理的商网动作”。
- `npm test` 通过。

