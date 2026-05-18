# UI Rebuild Execution Plan

> 范围已确认：中度重构。目标是重做信息架构、界面层级和排版系统，优先解决重叠、无效控件、重复信息和响应式失衡，不扩展新玩法、不做全面美术翻新。

**Goal:** 为当前游戏界面建立一套可执行的重构任务单，确保所有主界面在常用视口下无重叠、无无效按钮、信息归属清晰、交互层级稳定。

**Architecture:** 这一轮不推翻现有 Vanilla JS UI 模块，而是在 `index.html + css/* + js/ui/*` 现有结构上收敛 surface 层级、信息归属和布局变量。优先通过小步重构把 Header、Bottom Status、HUD Dock、Overlay Panels、Market Overlay、Modals 之间的关系定清楚，再分区重排。

**Tech Stack:** Vanilla JS, ES Modules, CSS, Vitest, local http.server smoke testing

---

## 当前已确认的问题簇

1. **重叠风险高**
   - `#game-header`、`#status-bar`、左右侧 `side-panel-overlay`、底部 `console-panel`、星图 HUD 小窗和详情卡同时使用 fixed / absolute / z-index 叠层。
   - 高风险文件：`css/layout.css`、`css/map.css`、`css/status.css`、`css/responsive.css`。

2. **信息重复严重**
   - credits、day、location、fuel、cargo、market snapshot、quest summary 在 Header / Bottom / HUD / Hangar / Market / Quest 多处重复展示。
   - 高风险文件：`index.html`、`js/ui/HUD.js`、`js/ui/FleetUI.js`、`js/ui/MarketUI.js`、`js/ui/QuestUI.js`。

3. **存在无实际用途的控件**
   - Header 通知按钮目前没有实际接线。
   - Target Intel 中 `station-action-list` 三个按钮为占位内容，无有效行为。
   - 星图装饰性 telemetry 文案存在信息噪音风险，需要判定保留为纯视觉元素还是删除。

4. **界面状态模型分散**
   - `MapUI` 只对 bottom-nav 与 overlay 做了局部互斥。
   - `HUD.js` 独立管理 dock widget。
   - `EventUI.js`、`Modal.js`、其他弹窗模块各自管理显示状态，没有统一 modal / toast 规则。

---

## 建议立项顺序

1. 先做 Issue 01 和 Issue 02：先把审计基线与 surface 规则定清楚。
2. 再做 Issue 03 到 Issue 06：清理信息归属和主界面排版。
3. 最后做 Issue 07 到 Issue 09：收敛弹窗、响应式和回归体系。

---

## Issue 01：建立界面审计基线

### 标题

建立 UI surface 清单、重叠复现矩阵和无效控件审计表

### 背景

当前已经能从代码上确认多层 overlay 和重复信息问题，但还没有形成一个统一的“界面清单 + 问题矩阵 + 删除候选”基线。没有这一步，后续重构很容易一边改布局、一边重新发现需求，导致范围反复膨胀。

### 目标

- 列出全部主界面、HUD 小窗、overlay、modal、toast 的入口与归属模块。
- 建立常用视口下的重叠复现矩阵。
- 建立所有信息项和按钮的“保留 / 合并 / 删除 / 待验证”列表。

### 范围

- 审计 `index.html` 中所有可见 surface 根节点。
- 审计 `js/ui/*.js` 的入口、显示/隐藏逻辑和事件绑定。
- 审计 `css/*.css` 中与 fixed / absolute / z-index / responsive 相关的规则。
- 对 1440x900、1280x800、1024x768、768x1024、390x844 五组视口做手动烟测记录。

### 涉及文件

- `index.html`
- `css/layout.css`
- `css/map.css`
- `css/header.css`
- `css/status.css`
- `css/panels.css`
- `css/responsive.css`
- `js/ui/MapUI.js`
- `js/ui/HUD.js`
- `js/ui/EventUI.js`
- `js/ui/Modal.js`

### 非目标

- 不在本 issue 中修改生产代码。
- 不在本 issue 中做视觉翻新。

### 验收标准

- 有一份 surface inventory，明确每个界面的入口、DOM 根节点、所属模块、核心信息、核心操作。
- 有一份 overlap matrix，记录每个重叠问题的复现步骤、视口、冲突区域、疑似根因。
- 有一份 action audit，列出无效按钮、弱动作、重复信息和待删除项。

### 建议标签

- `ui`
- `audit`
- `p0`

---

## Issue 02：统一界面层级与互斥规则

### 标题

为主界面、overlay、HUD 和 modal 建立统一 surface state model

### 背景

现在 `MapUI`、`HUD`、`EventUI`、`Modal` 各自管理局部显示状态，结果是局部能工作，但整个界面层级没有统一规则，容易出现 overlay 与 modal 叠开、toast 压住主操作、secondary panel 抢占地图空间等问题。

### 目标

- 定义统一的 surface 分层和互斥规则。
- 收拢目前分散的显示/隐藏逻辑。
- 让任何一个界面打开后，其他层级的行为都可预测。

### 范围

- 定义四层模型：`Global Bar`、`Primary Workspace`、`Secondary Overlay`、`Blocking Modal / Toast`。
- 明确互斥规则：
  - `Primary Workspace` 同时只能有一个。
  - `info-panel` / `trade-panel` / `console-panel` 同时只能有一个。
  - `market-overlay` 打开时必须关闭所有 secondary overlays。
  - blocking modal 不允许并存。
  - toast 不得覆盖底部导航和关键 CTA。
- 优先在现有 `MapUI` / `HUD` / `EventUI` 基础上实现，不强制抽成大型新框架。

### 涉及文件

- `js/ui/MapUI.js`
- `js/ui/HUD.js`
- `js/ui/EventUI.js`
- `js/ui/Modal.js`
- `js/ui/DialogueUI.js`
- `js/ui/FleetUI.js`

### 非目标

- 不在本 issue 中重排所有界面内容。
- 不新增状态管理库。

### 验收标准

- 底部导航切换时不会出现 secondary overlay 和 market overlay 并存。
- 所有 modal 都满足单实例显示规则。
- HUD dock 的展开/收起不会破坏主界面焦点。
- 重复初始化后仍保持监听幂等。

### 建议标签

- `ui`
- `architecture`
- `p0`

---

## Issue 03：建立信息归属表并删除重复信息

### 标题

建立 canonical information ownership，清理重复状态展示

### 背景

当前最明显的问题不是“信息少”，而是“同一信息到处都有”。玩家需要的不是更多数字，而是能在正确位置看到唯一可信的那一份信息。否则界面越做越满，冲突越多。

### 目标

- 为每类核心信息指定唯一主归属区域。
- 删除不必要的镜像显示。
- 对确实需要保留摘要镜像的信息，明确它只是摘要，不是完整视图。

### 范围

- 全局信息：credits、location、ship、day、reputation。
- 舰船即时信息：fuel、cargo、shield。
- 市场信息：local market snapshot、price board、trend、market intel。
- 目标信息：current target、planet detail、exploration summary。
- 任务信息：quest tracker summary、full quest list。
- 公司信息：company name、net worth、corp level、fleet summary。

### 推荐归属

- Header：credits、current location、active ship、day。
- Bottom Status：fuel、shield、cargo。
- Market overlay：完整市场数据与操作。
- HUD：只留摘要导航，不再承担完整数据主视图。
- Hangar：公司与舰队经营摘要。
- Info Panel：完整任务 / 科技 / 派系 / 成就内容。

### 涉及文件

- `index.html`
- `js/ui/HUD.js`
- `js/ui/FleetUI.js`
- `js/ui/MarketUI.js`
- `js/ui/QuestUI.js`
- `js/ui/ShipUI.js`

### 非目标

- 不在本 issue 中更改底层玩法数值。

### 验收标准

- 每个核心状态只有一个主展示位置。
- 已删除的重复信息不会留下空白占位。
- UI copy 和 DOM id/class 不再暗示“镜像但不同步”的双重来源。

### 建议标签

- `ui`
- `cleanup`
- `p1`

---

## Issue 04：重构 Header 与 Bottom Status 的职责分离

### 标题

压缩 Header，全局化顶部信息；精简底部状态条，只保留舰船即时资源

### 背景

顶部和底部现在共同承担“展示状态”的职责，但边界不清晰，导致 credits、day、fuel、cargo 等信息交叉重复，同时压缩了地图与 overlay 的垂直空间。

### 目标

- 让 Header 只承载全局身份信息和极少量高优先级状态。
- 让 Bottom Status 成为舰船即时资源区。
- 回收被无效信息占用的垂直空间。

### 范围

- 删除 Header 通知按钮，或在明确落地前彻底移出交互层。
- 重新梳理 day、location、ship、credits、reputation 的顶部排布。
- 从底部状态条移除不属于即时资源的内容。
- 保证 header 高度和 bottom nav / status 的 safe area 可被 CSS 变量统一控制。

### 涉及文件

- `index.html`
- `css/header.css`
- `css/status.css`
- `css/layout.css`
- `js/ui/HUD.js`

### 非目标

- 不在本 issue 中重做品牌视觉。

### 验收标准

- Header 和 Bottom Status 的职责一眼可分。
- 删除 Header 通知按钮后无残留绑定和样式孤儿。
- 星图页在常用视口下获得更多可用垂直空间。

### 建议标签

- `ui`
- `layout`
- `p1`

---

## Issue 05：重构星图 HUD、目标卡和详情卡

### 标题

清理 Starmap HUD 信息噪音，统一 target intel / planet detail / exploration card 的关系

### 背景

星图页是当前重叠风险最高的区域。HUD dock、目标卡、planet detail、exploration card、地图图例和装饰性 telemetry 都在同一屏竞争注意力。玩家无法快速判断“哪个是摘要、哪个是完整信息、哪个只是装饰”。

### 目标

- 让星图页的 HUD 只保留导航和摘要。
- 让当前目标信息的展示分层清晰。
- 移除无行为占位按钮和纯噪音文案。

### 范围

- 删除 `station-action-list` 中无接线按钮。
- 重新定义 `target-intel-widget` 的内容边界，只保留当前目标摘要与跳转。
- 重新定义 `planet-detail-panel` 与 `current-system-exploration-card` 的显示优先级和位置关系。
- 评估 `map-hud-nav-data` / `map-hud-sensor-data` 的处理方式：保留为更轻量的装饰层，或删除。
- 图例、dock、小窗、详情卡统一 safe area，避免压住 header / bottom nav。

### 涉及文件

- `index.html`
- `css/map.css`
- `css/responsive.css`
- `js/ui/HUD.js`
- `js/ui/MapUI.js`

### 非目标

- 不重做 3D 地图渲染器。

### 验收标准

- 星图页不再出现“同一目标信息在 3 到 4 个区块同时展开”的现象。
- target intel 中不再存在空操作按钮。
- planet detail 与 exploration card 在移动端和桌面端都不会压住关键 CTA。

### 建议标签

- `ui`
- `starmap`
- `p1`

---

## Issue 06：重构 Market / Hangar / Info 三大工作区的关系

### 标题

明确 market overlay 为唯一完整工作区，压缩 side panel 的摘要信息

### 背景

Market overlay 已经是完整工作区，但 HUD market overview、target intel、hangar summary、quest tracker 仍在抢它的职责。导致玩家经常在摘要区和完整区之间来回跳，却拿不到一致的信息。

### 目标

- 明确 market overlay 是唯一完整市场工作区。
- side panel 只负责二级详情，不再承载与 market overlay 冲突的完整信息。
- 让 quest tracker、hangar summary 成为摘要入口，而不是第二套完整视图。

### 范围

- HUD Market Overview 改为更轻的摘要，保留跳转而不承载完整交易分析。
- Quest Tracker 保留一个摘要卡和“任务页”跳转，完整任务细节只留在 `info-panel`。
- Hangar 面板保留公司与船队经营摘要，不再镜像 Header 和 Bottom Status 已经承担的内容。
- 重新梳理 company dashboard、fleet inline summary、info tabs 的信息密度。

### 涉及文件

- `index.html`
- `js/ui/MarketUI.js`
- `js/ui/FleetUI.js`
- `js/ui/QuestUI.js`
- `js/ui/HUD.js`
- `css/panels.css`
- `css/layout.css`

### 非目标

- 不在本 issue 中改动市场玩法流程。

### 验收标准

- 玩家通过摘要入口跳到完整工作区时，不会看到同一信息的第二套主视图。
- `market-overlay` 与 `info-panel` / `trade-panel` 的职责边界清晰。
- 侧边面板的信息密度下降，但仍保留关键决策数据。

### 建议标签

- `ui`
- `market`
- `hangar`
- `p1`

---

## Issue 07：统一 modal 与 notification 的结构和行为

### 标题

统一 trade / event / dialogue / dispatch / crew / settings / victory 等弹窗的层级、滚动和关闭逻辑

### 背景

当前弹窗能用，但结构和交互约定并不统一。有的靠遮罩点击关闭，有的靠按钮；有的内容滚动，有的整个 modal 滚动；再叠加 event notification 这样的非阻塞层，整体行为不够稳定。

### 目标

- 给所有 modal 统一视觉和交互框架。
- 给 notification 建立固定位置和优先级规则。
- 让 blocking modal / non-blocking toast 的差异清晰可控。

### 范围

- 统一 modal max-width、max-height、内部滚动区域和 actions 区。
- 统一 close button、遮罩关闭、Esc 行为。
- 统一 dispatch / crew / settings 等长内容 modal 的滚动策略。
- 重新放置 `event-notification`，确保不覆盖底部导航和主 CTA。

### 涉及文件

- `index.html`
- `css/modals.css`
- `css/responsive.css`
- `js/ui/Modal.js`
- `js/ui/EventUI.js`
- `js/ui/DialogueUI.js`
- `js/core/SettingsManager.js`

### 非目标

- 不在本 issue 中新增弹窗系统动画库。

### 验收标准

- 任意时刻只有一个 blocking modal 可见。
- 所有 modal 都符合一致的关闭与滚动规则。
- toast 在桌面与移动端都不会遮挡关键导航。

### 建议标签

- `ui`
- `modal`
- `p1`

---

## Issue 08：收敛响应式布局与 z-index 体系

### 标题

统一 layout variables、safe areas 和 responsive breakpoints，消除绝对定位补丁堆积

### 背景

现在响应式适配主要依赖大量 breakpoint 下的局部补丁，能“救火”，但很难维护。随着界面继续演进，`top`、`bottom`、`width: calc(...)`、`max-height: calc(...)` 这类规则会不断相互打架。

### 目标

- 建立统一的布局变量和 z-index 约定。
- 把关键 surface 的 safe area 固定下来。
- 减少 breakpoint 下的补丁式覆盖。

### 范围

- 抽出 header height、status height、bottom nav height、overlay top/bottom inset、dock inset、modal layer、toast layer 等变量。
- 统一 `layout.css` / `map.css` / `responsive.css` 的 spacing 口径。
- 清理明显重复、冲突或互相覆盖的响应式规则。

### 涉及文件

- `css/layout.css`
- `css/map.css`
- `css/header.css`
- `css/status.css`
- `css/panels.css`
- `css/responsive.css`

### 非目标

- 不追求完全重写所有 CSS。

### 验收标准

- 常见视口下不再依赖临时 magic number 才能避免重叠。
- 新增或移动一个 surface 时，可以通过布局变量推导其 safe area，而不是再叠一层补丁。
- z-index 口径可读、可维护。

### 建议标签

- `ui`
- `css`
- `responsive`
- `p1`

---

## Issue 09：补齐 UI 回归测试与手动烟测清单

### 标题

为 surface 互斥、无效控件删除和响应式行为建立最小 UI 回归集

### 背景

目前已有 `tests/uiLifecycle.test.js` 验证监听不重复，但还没有覆盖 UI 重构后最重要的行为：surface 互斥、HUD 恢复、modal 单实例、无效控件移除、导航跳转关系是否正确。

### 目标

- 为重构后的关键交互补回最小测试基线。
- 建立一份手动 smoke checklist，覆盖所有主界面和视口。

### 范围

- 扩展 `tests/uiLifecycle.test.js`。
- 视需要新增 `tests/hudWidget.test.js`、`tests/factionUI.test.js`、`tests/marketFocus.test.js` 的相关断言。
- 固定以下行为：
  - bottom-nav 互斥
  - market-overlay 与 side-panels 互斥
  - HUD dock 收起后可恢复上一次 active panel
  - modal 单实例显示
  - 已删除无效按钮不再暴露为可交互元素
- 补一份手动 smoke checklist，覆盖所有主界面和五组视口。

### 涉及文件

- `tests/uiLifecycle.test.js`
- `tests/hudWidget.test.js`
- `tests/marketFocus.test.js`
- `tests/factionUI.test.js`
- `docs/plans/2026-05-05-ui-rebuild-execution-plan.md`

### 非目标

- 不在本 issue 中引入完整截图测试框架。

### 验收标准

- UI 互斥与生命周期有稳定自动化断言。
- 手动 smoke checklist 可被复用为回归手册。
- 重构后的删除项、跳转项和层级规则都有最小验证闭环。

### 建议标签

- `ui`
- `test`
- `p0`

---

## 推荐执行节奏

### Phase A：先定规则

- Issue 01：完成审计基线。
- Issue 02：完成 surface state model。

### Phase B：再做主界面重排

- Issue 03：清理信息归属。
- Issue 04：重构 Header / Bottom Status。
- Issue 05：重构星图 HUD 与目标区。
- Issue 06：重构 Market / Hangar / Info 的职责边界。

### Phase C：最后收响应式与验证

- Issue 07：统一 modal / notification。
- Issue 08：收敛响应式和 z-index。
- Issue 09：补测试和 smoke checklist。

---

## Definition Of Done

满足以下条件，才算本轮 UI 重构完成：

1. 所有主界面在桌面和移动常用视口下无明显重叠、裁切和点击遮挡。
2. Header、Bottom Status、HUD、Overlay、Market、Modal 的职责边界清晰。
3. 已识别的无效按钮和占位交互被删除或降级为纯展示元素。
4. 同一核心信息不再有多处“看起来同级”的重复展示。
5. `MapUI`、`HUD`、`EventUI`、`Modal` 的关键互斥行为有自动化测试兜底。
6. 入口 query string 版本链按既有约定更新，避免浏览器缓存混用旧布局和新逻辑。
