# 2026-05-24 变更集收口与后续执行顺序

## 目标

当前工作树已经累积了多条设计线和实现线。这个收口文档用于把变更拆成可评审、可提交、可回退的批次，避免后续继续实现时把行为改动、UI 密度调整、架构拆分和文档补充混在一起。

本收口不新增业务行为，只整理现状、风险和推荐顺序。

## 当前状态

- 已跟踪文件改动：30 个。
- 未跟踪文件：13 个。
- 核心改动集中在行动引导、贸易站网络、经营 UI 密度、全局 UI 管理和设计文档。
- 最近已验证基线：`npm test` 全量通过；UI 密度相关目标测试通过。

## 建议拆分批次

### 1. 设计路线与准入标准文档

建议提交主题：`docs: align midgame roadmap and platform entry criteria`

包含范围：

- `docs/design/09_技术架构设计.md`
- `docs/design/MVP路线图.md`
- `docs/design/存档系统设计.md`
- `docs/design/实现方案.md`
- `docs/design/设计实现对照表.md`
- `docs/plans/2026-05-20-next-design-evaluation.md`
- `docs/plans/2026-05-22-platform-capability-entry-criteria.md`
- `docs/plans/2026-04-06-p0-stability-issues.md`

评审重点：

- 是否仍坚持“不提前实现平台型大系统”的边界。
- 音频、i18n、云存档、多人、排行榜是否都保留了可测准入条件。
- 存档版本与架构描述是否和当前代码实际一致。

### 2. 行动引导执行边界

建议提交主题：`refactor: route action guide execution through controller`

包含范围：

- `js/core/GuidanceActionController.js`
- `js/core/GameManager.js`
- `js/ui/ActionGuideUI.js`
- `tests/guidanceActionController.test.js`

评审重点：

- `GameManager` 是否只负责注入依赖和 UI 刷新，不再承载动作分发细节。
- 新控制器是否覆盖旧 switch 分支的行为，包括市场、研究、地图、任务、舰队、维修、贸易站等入口。
- 缺失 handler 时是否安全失败，并给出可读反馈。

### 3. 中期行动引导回归

建议提交主题：`feat: expand midgame guidance suggestions`

包含范围：

- `js/systems/guidance/GuidanceSystem.js`
- `js/core/GameManager.js`
- `js/systems/trade/AutoTradeSystem.js`
- `tests/guidanceSystem.test.js`
- `tests/autoTrade.test.js`
- `tests/mapUiNavigationFocus.test.js`
- `docs/plans/2026-05-22-midgame-guidance-regression.md`

评审重点：

- 行动建议是否能覆盖燃料、维修、研究材料、货运分配、贸易网络、探索情报等中期阻塞。
- `target`、`destination`、`systemId`、`stationId` 等动作上下文是否完整，避免按钮只显示但无法落地。
- 用户当前所在的市场工作区或子工作区是否会影响建议排序，避免重复提示。

### 4. 贸易网络轻物流闭环

建议提交主题：`feat: close trade network light logistics loop`

包含范围：

- `js/data/tradeStations.js`
- `js/systems/trade/TradeStationSystem.js`
- `js/ui/MarketUI.js`
- `tests/tradeStation.test.js`
- `tests/marketUiFocus.test.js`
- `docs/plans/2026-05-22-commerce-next-network-action.md`
- `docs/plans/2026-05-22-trade-network-light-logistics-closeout.md`
- `docs/plans/2026-05-22-trade-station-strategy-recommendation.md`

评审重点：

- 站点角色、区域协同、战略建议、下一网络行动是否都能从同一套状态推导。
- 推荐优先级是否稳定：先处理互补建设和升级，再考虑经理、策略和资金缺口。
- 市场 UI 是否把建议表达为经营信号，而不是重复全局行动条。

### 5. 探索情报跨系统收口

建议提交主题：`feat: surface survey intel across midgame systems`

包含范围：

- `js/core/GameManager.js`
- `js/systems/guidance/GuidanceSystem.js`
- `js/ui/MarketUI.js`
- `tests/guidanceSystem.test.js`
- `tests/marketUiFocus.test.js`
- `docs/plans/2026-05-22-survey-intel-cross-system-closeout.md`

评审重点：

- `ExplorationSystem.getSurveyDecisionIntel()` 产出的信号是否被市场、研究、派遣、贸易网络消费。
- UI 是否能说明“为什么这个星系/站点值得处理”，而不是只显示结果。
- 测试是否覆盖至少一个探索情报影响经营推荐的路径。

### 6. 经营 UI 信息密度

建议提交主题：`ui: reduce operational information density`

包含范围：

- `docs/plans/2026-05-22-operations-ui-density-audit.md`
- `docs/plans/2026-05-22-ui-information-density-matrix.md`
- `index.html`
- `js/ui/HUD.js`
- `js/ui/MapUI.js`
- `js/ui/FleetUI.js`
- `js/ui/MarketUI.js`
- `tests/hudSummary.test.js`
- `tests/marketUiFocus.test.js`
- `css/fleet.css`
- `css/interstellar-trader.css`
- `css/status.css`
- `css/style.css`
- `css/systems.css`

评审重点：

- HUD、市场、地图、舰队是否各自承担局部状态，不再抢全局下一步建议。
- 行动建议是否集中回到行动条。
- 文案是否从“建议/下一步”转为“状态/信号/可升级项/探索状态”。
- 桌面和移动端是否没有因为新增密度压缩造成溢出或遮挡。

### 7. 全局 UI 管理与舰队内联面板

建议提交主题：`feat: introduce global UI manager and fleet overlays`

包含范围：

- `js/ui/UIManager.js`
- `js/ui/FleetUI.js`
- `js/core/GameManager.js`
- `js/core/SettingsManager.js`
- `js/main.js`
- `index.html`
- `css/fleet.css`
- `css/interstellar-trader.css`
- `css/status.css`
- `css/systems.css`

评审重点：

- `UIManager` 初始化顺序是否稳定，尤其是缺少 DOM 节点或系统实例时的降级。
- 舰队详情、任务、状态面板是否不会和市场、行动条、地图入口互相抢焦点。
- CSS 改动较多，建议单独做一次人工视觉走查。

## 风险点

- `GameManager.js` 同时包含行动控制器、行动建议上下文、UI 管理等多条线，提交时建议用 hunk 分批暂存。
- `MarketUI.js` 同时承担贸易网络闭环和 UI 密度文案，评审时要区分经营逻辑与表达层变更。
- `FleetUI.js`、`index.html` 和多份 CSS 改动较大，建议在代码测试之外补一次浏览器视觉检查。
- 未跟踪计划文档数量较多，提交前需要确认是否全部纳入版本管理。

## 推荐后续顺序

1. 先提交或锁定文档批次，明确中期路线和平台能力边界。
2. 再提交行动引导执行边界，降低后续功能接入 `GameManager` 的冲突。
3. 接着提交中期行动引导回归，让全局行动条能稳定解释阻塞和入口。
4. 然后提交贸易网络轻物流闭环与探索情报跨系统收口。
5. 最后提交 UI 密度与全局 UI 管理相关变更，并做人工视觉走查。

## 验收清单

- 全量测试通过。
- 每个批次都能独立说明行为变化或文档变化。
- 没有把“平台能力预留”误提交成实际平台系统。
- UI 中全局下一步只由行动条承担，局部面板只展示状态、信号和局部操作。
- 提交前能用上述批次解释每个修改文件的归属。
