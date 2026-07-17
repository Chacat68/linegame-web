# 2026-05-24 变更集收口与后续执行顺序

## 目标

当前工作树已经累积了多条设计线和实现线。这个收口文档用于把变更拆成可评审、可提交、可回退的批次，避免后续继续实现时把行为改动、UI 密度调整、架构拆分和文档补充混在一起。

本收口不新增业务行为，只整理现状、风险和推荐顺序。

## 当前状态

- 已跟踪文件改动：28 个。
- 未跟踪文件：6 个。
- 核心改动集中在行动引导、贸易站网络、经营 UI 密度、全局 UI 管理和设计文档。
- 最近已验证基线：`npm test` 全量通过，54 个文件、596 个测试通过；行动条完成态、派遣弹窗上下文和窄屏 CSS 相关目标测试通过。
- 可执行切片清单见 `docs/plans/2026-05-26-review-slicing-checklist.md`。

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
- 完整音频平台、i18n、云存档、多人、排行榜是否都保留了可测准入条件，且基础短音效 MVP 不再被误判为未开始。
- 存档版本与架构描述是否和当前代码实际一致。

### 2. 行动引导执行边界

建议提交主题：`refactor: route action guide execution through controller`

2026-05-26 状态：行动执行边界已进入二阶段收口。市场导航和星图定位完成态已从 controller 分发到统一 helper，`GameManager` 仍作为依赖注入和状态变更总入口；新增 `GameManager` 级 smoke 覆盖行动条触发派遣草案的真实链路。

包含范围：

- `js/core/ActionGuideCompletion.js`
- `js/core/GuidanceActionController.js`
- `js/core/CommerceActionController.js`
- `js/core/GameManager.js`
- `js/ui/ActionGuideUI.js`
- `tests/actionGuideCompletion.test.js`
- `tests/guidanceActionController.test.js`
- `tests/commerceActionController.test.js`
- `tests/gameManagerActionGuideSmoke.test.js`

评审重点：

- `GameManager` 是否只负责注入依赖和 UI 刷新，不再承载动作分发细节。
- 新控制器是否覆盖旧 switch 分支的行为，包括市场、研究、地图、任务、舰队、维修、贸易站等入口。
- 缺失 handler 时是否安全失败，并给出可读反馈。
- 完成态文案是否继续集中在 `ActionGuideCompletion`，避免后续 actionType 把短反馈散回各控制器。

### 3. 中期行动引导回归

建议提交主题：`feat: expand midgame guidance suggestions`

2026-05-26 状态：推荐改装、派遣草案、完成态和上下文去重已完成。行动条可以推荐可安装组件、跳转机库并高亮目标组件；派遣草案打开后会暴露当前路线上下文，避免重复推荐同一路线；补给、维修、派遣载入、派遣确认、市场导航和星图定位都有短暂完成态。

包含范围：

- `js/systems/guidance/GuidanceSystem.js`
- `js/core/GameManager.js`
- `js/systems/trade/AutoTradeSystem.js`
- `js/systems/fleet/FleetSystem.js`
- `js/ui/FleetUI.js`
- `js/ui/ActionGuideUI.js`
- `tests/guidanceSystem.test.js`
- `tests/autoTrade.test.js`
- `tests/mapUiNavigationFocus.test.js`
- `tests/actionGuideUI.test.js`
- `tests/fleetUiModFocus.test.js`
- `tests/gameManagerActionGuideSmoke.test.js`
- `docs/plans/2026-05-22-midgame-guidance-regression.md`
- `docs/plans/2026-04-17-fleet-operations-2.0-design.md`

评审重点：

- 行动建议是否能覆盖燃料、维修、研究材料、货运分配、贸易网络、探索情报等中期阻塞。
- `target`、`destination`、`systemId`、`stationId` 等动作上下文是否完整，避免按钮只显示但无法落地。
- 用户当前所在的市场工作区或子工作区是否会影响建议排序，避免重复提示。
- 机库改装弹窗和派遣弹窗暴露的上下文是否会在关闭时清理，避免 stale context 压制后续推荐。
- 完成态是否只作为短反馈，不改变建议排序本身。

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

2026-05-26 状态：首批文案降级和局部状态归属已完成，HUD、市场、地图和机库保留各自局部信息，全局下一步继续归行动条；行动条自身已补窄屏布局保护，标题和说明限制为两行，560px 以下改为文案 / 按钮两行结构。剩余风险是人工视觉走查。

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
- `tests/actionGuideCss.test.js`
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
- 行动条完成态、processing 态和固定展开态在窄屏下是否不压缩底部导航、不遮挡主 CTA。

### 7. 全局 UI 管理与舰队内联面板

建议提交主题：`feat: introduce global UI manager and fleet overlays`

2026-05-26 状态：`UIManager.js` 已作为全局大面板切换入口接入，负责底栏视图、面板互斥、日志 modal 和星图背景模糊；舰队内联面板仍建议随视觉走查一起确认焦点与遮挡。

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

- `GameManager.js` 仍同时包含行动建议上下文、测试入口和 UI 管理接线，提交时建议用 hunk 分批暂存；探索 / 商业行动分发已转入 controller。
- `MarketUI.js` 同时承担贸易网络闭环和 UI 密度文案，评审时要区分经营逻辑与表达层变更。
- `FleetUI.js` 和多份 CSS 改动较大，仍需在代码测试之外补一次浏览器视觉检查。
- 新增未跟踪文件 6 个，其中测试文件 5 个，提交前需要确认是否全部纳入版本管理。

## 2026-05-26 阶段收口：行动条中期闭环体验

本阶段完成范围：

- 推荐改装：`Fleet.getShipModRecommendation()` 进入行动条，机库卡片、改装弹窗和行动建议共享同一推荐理由。
- 机库聚焦：`fleet.mod.open` 会打开改装弹窗并高亮目标组件；同一组件已打开时，行动条不重复提示。
- 派遣草案：推荐路线可直接带入派遣弹窗，弹窗暴露当前草案上下文；同一路线已打开时不重复推荐。
- 完成态：补给、维修、派遣草案载入、派遣确认、推荐改装安装、市场导航和星图定位都接入短暂完成态。
- 文案收敛：完成态文案集中到 `ActionGuideCompletion`，controller 和 `GameManager` 只负责调用。
- UI 适配：行动条在窄屏下改为两行布局，标题 / 说明最多两行，降低按钮挤压和文字溢出风险。

测试覆盖：

- `tests/guidanceSystem.test.js`：推荐改装、派遣草案去重、改装后建议转向。
- `tests/guidanceActionController.test.js`、`tests/commerceActionController.test.js`：市场 / 星图导航完成态与改装行动分发。
- `tests/fleetUiModFocus.test.js`：改装聚焦、派遣弹窗上下文创建与关闭清理。
- `tests/gameManagerActionGuideSmoke.test.js`：行动条经 `GameManager` 真实回调载入派遣草案、显示完成态并去重。
- `tests/actionGuideCompletion.test.js`：统一完成态文案和上下文转发。
- `tests/actionGuideCss.test.js`：行动条窄屏两行布局、文案行数限制和 CSS 版本入口。
- 最近全量：`npm test` 通过，54 个文件、596 个测试。

剩余风险：

- 当前缺少真实浏览器截图级断言；CSS 已有规则测试，2026-05-28 已补自动化前置检查和人工走查脚本，但仍需要桌面 / 560px 以下 / 移动端的真实浏览器视觉确认。
- `GameManager` 暴露了测试专用入口，范围已控制在 `_setStateForTest` 与 `_handleActionGuideActionForTest`，提交评审时需确认是否接受这种无构建环境下的 smoke 测试策略。
- 完成态目前是短反馈，不是状态机；如果后续增加可取消或可撤销动作，需要重新评估完成态是否需要排队或覆盖策略。

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
- 行动条完成态、弹窗上下文去重和窄屏布局都有对应测试或人工验收记录。
- 提交前能用上述批次解释每个修改文件的归属。
