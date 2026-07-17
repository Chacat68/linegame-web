# 2026-05-26 评审与提交切片清单

## 目标

把当前工作树拆成可以逐批评审、逐批提交、必要时逐批回退的切片。本文只描述执行顺序和验收方式，不新增业务需求。

## 当前变更面

- 已跟踪改动：28 个文件。
- 未跟踪新增：6 个文件。
- 主线变更：行动条中期闭环、行动完成态 helper、推荐改装 / 派遣草案上下文、窄屏行动条 CSS、阶段性设计文档收口。
- 最新验证口径：目标测试通过 8 个文件、65 个测试；全量 `npm test` 通过 54 个文件、596 个测试；本地预览 `http://127.0.0.1:4174/index.html` 返回 200。

## 切片 1：文档路线与收口说明

建议主题：`docs: close midgame roadmap and review plan`

包含文件：

- `docs/design/09_技术架构设计.md`
- `docs/design/10_音效与音乐设计.md`
- `docs/design/MVP路线图.md`
- `docs/design/设计实现对照表.md`
- `docs/plans/2026-04-17-fleet-operations-2.0-design.md`
- `docs/plans/2026-05-20-next-design-evaluation.md`
- `docs/plans/2026-05-22-action-controller-boundary-phase-2.md`
- `docs/plans/2026-05-22-operations-ui-density-audit.md`
- `docs/plans/2026-05-22-platform-capability-entry-criteria.md`
- `docs/plans/2026-05-22-survey-intel-cross-system-closeout.md`
- `docs/plans/2026-05-22-trade-network-light-logistics-closeout.md`
- `docs/plans/2026-05-22-ui-information-density-matrix.md`
- `docs/plans/2026-05-24-change-set-closeout.md`
- `docs/plans/2026-05-26-review-slicing-checklist.md`

验收点：

- 文档没有把平台预留误写成已实现能力。
- 中期闭环状态和测试基线与实际代码一致。
- 后续顺序可以解释每个当前改动文件的归属。

## 切片 2：行动完成态与执行边界

建议主题：`refactor: centralize action guide completion feedback`

包含文件：

- `js/core/ActionGuideCompletion.js`
- `js/core/CommerceActionController.js`
- `js/core/GuidanceActionController.js`
- `js/core/GameManager.js`
- `js/main.js`
- `js/ui/ActionGuideUI.js`
- `tests/actionGuideCompletion.test.js`
- `tests/actionGuideUI.test.js`
- `tests/commerceActionController.test.js`
- `tests/guidanceActionController.test.js`
- `tests/gameManagerActionGuideSmoke.test.js`

验收点：

- 完成态文案集中在 `ActionGuideCompletion`，控制器只调用 helper。
- `GameManager` 只保留依赖注入、状态同步和测试入口，不再扩散动作分发细节。
- 行动条真实回调能打开派遣草案、显示完成态，并对同一路线去重。

建议验证：

```bash
npx vitest run tests/actionGuideCompletion.test.js tests/actionGuideUI.test.js tests/commerceActionController.test.js tests/guidanceActionController.test.js tests/gameManagerActionGuideSmoke.test.js
```

## 切片 3：中期行动建议与舰队上下文

建议主题：`feat: guide fleet mods and dispatch drafts`

包含文件：

- `js/systems/fleet/FleetSystem.js`
- `js/systems/guidance/GuidanceSystem.js`
- `js/ui/FleetUI.js`
- `css/fleet.css`
- `tests/fleetUiModFocus.test.js`
- `tests/guidanceSystem.test.js`
- `tests/gameManagerActionGuideSmoke.test.js`

验收点：

- 推荐改装可以从行动条进入机库改装弹窗，并聚焦目标组件。
- 已打开相同组件时不会重复推荐；安装后会转向下一艘船或下一类建议。
- 派遣弹窗打开后暴露当前草案上下文，关闭时清理上下文，避免 stale state。

建议验证：

```bash
npx vitest run tests/guidanceSystem.test.js tests/fleetUiModFocus.test.js tests/gameManagerActionGuideSmoke.test.js
```

## 切片 4：行动条窄屏适配

建议主题：`ui: stabilize action guide narrow layout`

包含文件：

- `css/interstellar-trader.css`
- `css/style.css`
- `tests/actionGuideCss.test.js`

验收点：

- 行动条标题和说明最多两行。
- 560px 以下行动条切到两行结构，按钮不挤压主文案。
- CSS 入口版本号能稳定命中新规则。

建议验证：

```bash
npx vitest run tests/actionGuideCss.test.js tests/actionGuideUI.test.js
```

## 最终验收顺序

1. 先跑切片 2、3、4 的目标测试，确认行为和 CSS 断言仍稳定。
2. 再跑全量 `npm test`，把测试数量和失败输出记录到收口文档。
3. 如果本地服务还在，访问 `http://127.0.0.1:4174/index.html` 确认页面能加载。
4. 人工浏览器走查桌面、560px 以下和移动宽度，重点看行动条、机库弹窗和派遣弹窗。
5. 评审时按上述切片分批暂存，避免把文档、控制器、舰队行为和 CSS 布局混成一个不可回退提交。

## 剩余人工确认

- 是否接受 `GameManager` 暴露 `_setStateForTest` 和 `_handleActionGuideActionForTest` 作为无构建环境下的 smoke 测试入口。
- 是否把视觉走查结果补入 `2026-05-24-change-set-closeout.md` 后再提交。
- 是否需要把 UIManager / 贸易网络 / 探索情报相关历史改动继续拆成后续独立清单。

## 2026-05-28 视觉验收状态

本轮已完成的自动化前置检查：

- 本地页面入口可访问：`http://127.0.0.1:4174/index.html` 返回 200。
- DOM 入口存在：`index.html` 包含 `#action-guide`、`#bottom-nav`、`#dispatch-modal`、`#mod-modal`。
- CSS 断言存在：`tests/actionGuideCss.test.js` 覆盖标题 / 说明两行限制、560px 以下两行 grid、CSS 入口版本。
- 行为断言存在：`tests/fleetUiModFocus.test.js` 覆盖推荐改装聚焦、滚动、高亮类名、派遣草案上下文和关闭清理。

未完成项：

- 真实截图级视觉走查仍未完成。本轮环境没有暴露 Browser 插件工具，Computer Use 未取得 Chrome 窗口句柄，Chrome headless 截图未获授权。

人工走查脚本：

1. 桌面宽度 1280px：打开本地页面，确认行动条悬浮在底栏上方，不遮挡底栏图标、星图主操作和 HUD。
2. 窄屏宽度 560px：确认行动条切成“文案 / 按钮”两行，标题和说明不超过两行，主按钮不挤压文案。
3. 移动宽度 390px：确认底栏和固定展开的行动条都保留安全间距，不贴边、不溢出。
4. 从行动条触发推荐改装：确认机库打开后目标组件有明显高亮，弹窗主体可滚动到目标，不遮挡关闭按钮。
5. 从行动条触发派遣草案：确认买入星系、卖出星系、货物预填正确，估算区可读，关闭后再次刷新不会被旧上下文压制。
