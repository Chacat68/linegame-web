# 2026-07-07 变更集收口

## 目标

当前工作树累积了 24 个变更文件，涵盖通讯日志系统轻量化、星系视图沉浸增强、交易交互优化和教程文案重写。本收口文档将变更拆为两个可独立提交的批次。

## 当前状态

- 已修改文件：24 个。
- 测试：`npm test` 全量通过，64 文件、689 测试，0 失败。
- 基线分支：`run`。
- 上一收口文档（2026-05-24）的 7 个批次已全部提交完毕，当前变更为收口后新工作。

---

## 建议拆分批次

### 批次 1：日志 badge 模式 + 星系聚焦 + 交易回星图 + UI 精简

建议提交主题：`refactor: streamline communication logs, enhance galaxy immersion and trade UX`

**变更概要：**

- **通讯日志轻量化**：移除底栏广播条（`#mini-console-broadcast`）和全屏日志弹窗（`#logs-modal`），改用底部导航日志按钮上的未读数字角标（`#logs-nav-badge`）。日志入口不再切换视图，只清除角标。
- **星系视图沉浸增强**：星系总览模式下新增悬停聚焦效果（hover 缩放、聚焦光环、脉冲动画）；当前星系有高亮环标识；进入星系视图时 body 加 `starmap-galaxy-mode` 类触发全局视觉增强（画布饱和度提升、遮罩渐变调整）；galaxy-hub 面板获得独立毛玻璃样式。
- **交易后自动返回星图**：交易确认成功后自动关闭市场面板并聚焦星图，替代原来需要手动返回的行为。同时移除引导交易确认中的市场自动打开逻辑（不再抢焦点）。
- **版本号对齐**：Renderer3D、MapUI、GameManager、main.js、CSS 引用统一刷新为 `20260707-galaxymap1`。

**包含文件（17 个）：**

```
index.html
css/style.css
css/status.css
css/interstellar-trader.css
js/main.js
js/core/GameManager.js
js/ui/HUD.js
js/ui/MapUI.js
js/ui/Renderer3DAdvanced.js
js/ui/SurfaceManager.js
js/ui/UIManager.js
tests/actionGuideCss.test.js
tests/eventNotificationLifecycle.test.js
tests/gameManagerActionGuideSmoke.test.js
tests/onboardingSurfaceUi.test.js
tests/uiLifecycle.test.js
tests/uiSurfaceInventory.test.js
```

**评审重点：**

- 日志角标在 `addMessage` 时递增、`logs:badge:clear` 时归零，是否在每次导航切换时正确清除。
- 星系 hover 聚焦不会在无星系场景或低性能模式下崩溃。
- `_returnToStarmapAfterTrade` 是否在所有交易路径（买入/卖出/黑市）中正确触发。
- 移除 `hideBlockingSurface('logs-modal')` 调用后，其他面板切换是否有残留遮挡。
- 阻塞面清单移除 `logs-modal` 后，其余 modal 的焦点管理是否仍然完整。

---

### 批次 2：教程与阻塞提示文案重写

建议提交主题：`docs: rewrite tutorial and blocker action copy for clarity`

**变更概要：**

- **教程系统重写**：三个阶段从「星际初航 / 第一桶金 / 自由探索」改为「起步校准 / 第一轮交易 / 行动接管」。欢迎文案从叙事性开场改为功能性指引（"看清资金与货舱、完成一次买入-航行-卖出、知道后续该看哪里"）。每步文案从教学语气转为干练操作说明。移除 `show_map` 步骤和四个任务相关步骤（`show_quest_board`、`accept_first_quest`、`complete_first_quest`、`quest_tracker`），新增 `fuel_safety` 和 `action_guide_handoff` 步骤。
- **阻塞提示文案统一**：QuestUI 和 ResearchUI 中的市场跳转按钮从「前往市场补给/清货/周转」统一改为「打开市场补燃料/清货/跑单」，并明确标注目标终端（现货区/资本区/经营区），让用户不用猜测点击后跳到哪里。

**包含文件（7 个）：**

```
js/systems/tutorial/TutorialSystem.js
js/ui/TutorialUI.js
js/ui/QuestUI.js
js/ui/ResearchUI.js
tests/tutorial.test.js
tests/quest.test.js
tests/research.test.js
```

**评审重点：**

- 教程步骤从 14 步精简到 10 步，`advanceToStep` 辅助函数是否仍正确覆盖所有手动推进步骤。
- 移除任务相关步骤后，教程完成条件是否仍然可达（`fuel_safety` → `action_guide_handoff` → `tutorial_complete`）。
- 阻塞文案中「打开市场」措辞是否与实际的 `market` action 行为一致（直接进入对应工作区）。

---

## 推荐执行顺序

1. 先提交批次 1（日志 + 星系 + 交易），这是结构性和行为变更。
2. 再提交批次 2（文案），纯内容变更，不影响行为。

## 验收清单

- 全量测试通过（已确认：64 文件、689 测试）。
- 日志角标正确递增/清除，不再有广播条或全屏日志弹窗。
- 星系总览视图有 hover 聚焦效果，当前星系有高亮环。
- 交易确认后自动返回星图。
- 教程从 14 步精简到 10 步，文案与界面实际文案一致。
- 阻塞提示按钮标签反映了真实跳转目标。
