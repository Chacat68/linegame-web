# 探索情报跨系统联动收口计划

> 日期：2026-05-22  
> 目标：确认勘探报告已经在市场、科研、派遣、商网四条链路中产生可解释影响。  
> 架构：继续以 `ExplorationSystem.getSurveyDecisionIntel()` 作为唯一情报归纳入口。  
> 技术栈：Vanilla JS ES Modules、Vitest。

---

## 1. 当前基线

- 市场：行动引导可跳转市场情报区。
- 科研：科研型完探可缩短当前研究进度，科研补给路线已读取情报。
- 派遣：自动派遣评分已吸收市场、后勤、航线类勘探信号。
- 商网：候选卡和已建站点会展示勘探信号，策略推荐也会读取本地情报。

2026-05-26 状态：四条链路已经都有可见消费点和回归测试；后续不再把“接入情报”作为待办，改为评估更复杂探索内容是否能继续产生新的经营信号。

## 2. 关键设计

- 不新增第二套情报接口。
- 各系统只读取 `getSurveyDecisionIntel()` 的归纳字段：
  - `marketSignal`
  - `logisticsSignal`
  - `routeSignal`
  - `researchSignal`
- 情报影响必须在 UI 或测试断言中可见。
- 不允许只做隐藏数值加成。

## 3. 实施步骤

1. 已审计 `GuidanceSystem`、`ResearchSystem`、`AutoTradeSystem`、`TradeStationSystem` 对勘探情报的使用。
2. 已为每条链路补一个最小测试：
   - 市场 CTA 或 workspace focus。
   - 科研补给或研究进度。
   - 派遣路线评分。
   - 商网站点推荐或候选说明。
3. 已在 `docs/plans/2026-05-20-next-design-evaluation.md` 更新 P2 状态。
4. 如果后续新增探索报告类型，继续要求 UI 文案或 reason 字段说明影响。
5. 每次扩展后跑 `npm test`，确认没有情报联动回归。

## 4. 测试计划

- `tests/exploration.test.js`
  - `getSurveyDecisionIntel()` 对四类信号输出稳定。
- `tests/research.test.js`
  - 科研报告影响科研补给路线或进度。
- `tests/autoTrade.test.js`
  - 派遣评分因航线 / 后勤 / 市场报告改变。
- `tests/marketUiFocus.test.js`
  - 市场或商网页展示勘探情报原因。

## 5. 验收

- 同一星球有报告和无报告时，至少一个经营入口发生可解释变化。
- 四条链路都有测试覆盖。
- 文档能说明勘探报告不只是奖励文本，而是跨系统资产。
