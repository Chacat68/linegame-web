# 商网站点策略推荐实施计划

> 日期：2026-05-22  
> 目标：让勘探报告影响贸易站经营策略推荐，但不自动替玩家切换策略。  
> 架构：推荐规则放在贸易站系统，商网页只展示结果和执行按钮；规则读取现有勘探情报入口，不新增存档字段。  
> 技术栈：Vanilla JS ES Modules、Vitest、现有 `MarketUI` 商网入口。

---

## 1. 当前基线

- 贸易站已有 `balanced`、`expansion`、`premium` 三种策略。
- `TradeStationSystem` 已输出站点角色、区域协同和候选协同。
- `ExplorationSystem.getSurveyDecisionIntel(state, systemId)` 已能归纳市场、后勤、航线、科研信号。
- `MarketUI.getTradeStationCandidateIntel()` 只负责候选卡提示，不应继续承载业务推荐规则。

## 2. 关键设计

- 新增 `TradeStation.getStrategyRecommendation(state, systemId)`。
- 返回结构：

```js
{
  strategyId: 'expansion',
  strategy: TRADE_STATION_STRATEGIES[1],
  confidence: 'high',
  reason: '勘探报告显示该节点具备补给与走量条件，适合扩张经营。',
  intelSignal: 'logistics',
  shouldSwitch: true
}
```

- 推荐规则：
  - `researchSignal` -> `premium`
  - `logisticsSignal` -> `expansion`
  - `marketSignal` 且系统类型为 `technology`、`medical`、`research` -> `premium`
  - `marketSignal` 且其他可建站类型 -> `expansion`
  - `routeSignal` -> `balanced`
  - 无勘探情报 -> `balanced`，`confidence: 'low'`
- `shouldSwitch` 只比较当前贸易站策略；候选站点默认以 `balanced` 为当前策略比较。

## 3. 实施步骤

1. 在 `js/systems/trade/TradeStationSystem.js` 引入 `ExplorationSystem`，实现纯函数推荐，不修改 state。
2. 在 `getBuildCandidates()` 的候选对象上加入 `strategyRecommendation`。
3. 在 `_getStationMeta()` 的返回对象上加入 `strategyRecommendation`。
4. 在 `js/ui/MarketUI.js` 的本地站点卡、建站候选卡、已建站点卡展示“建议策略”。
5. 当站点已建且 `shouldSwitch=true` 时，复用现有 `market-set-strategy` 按钮动作，按钮文案为“切换为建议策略”。
6. 不新增 actionType，不修改存档结构，不自动切策略。

## 4. 测试计划

- `tests/tradeStation.test.js`
  - 科研勘探报告推荐 `premium`。
  - 后勤勘探报告推荐 `expansion`。
  - 无报告时返回 `balanced` 且 `confidence: 'low'`。
  - 当前站点已经使用推荐策略时 `shouldSwitch=false`。
- `tests/marketUiFocus.test.js`
  - 候选卡展示建议策略原因。
  - 已建站点卡展示建议策略并保留原有策略切换按钮。

## 5. 验收

- 玩家能在建站前知道该节点适合哪种策略。
- 已建站点能看到“为什么建议切策略”。
- 勘探报告影响以文案和推荐呈现，不做不可见收益加成。
- `npm test` 通过。

