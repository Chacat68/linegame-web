# UI Audit Baseline

> 该文档是 UI 重构执行计划的 Phase 0 基线，先把当前界面 surface、已确认问题和首轮删除项固定下来，再继续做排版和层级重构。

## 审计范围

- 本地页面：`http://127.0.0.1:4174/`
- 代码入口：`index.html`、`css/layout.css`、`css/map.css`、`css/status.css`、`css/responsive.css`、`js/ui/MapUI.js`、`js/ui/HUD.js`
- 本轮基线以桌面烟测和代码审计为主，后续继续补多视口截图与交互矩阵。

## Surface Inventory

| 层级 | Surface | 入口 | 主模块 | 当前职责 | 已确认问题 |
| --- | --- | --- | --- | --- | --- |
| Global Bar | Header | 页面常驻 | `js/ui/HUD.js` | credits、location、ship、day、胜利进度、设置 | 保留了无行为的通知按钮；与机库摘要有状态重复 |
| Global Bar | Bottom Status + Bottom Nav | 页面常驻 | `js/ui/MapUI.js` | fuel、shield、cargo、主界面切换 | 与 Header / Hangar 存在即时资源重复 |
| Primary Workspace | Star Map | 默认主界面 | `js/ui/MapUI.js` | 星图视图、目标预览、探索入口 | HUD telemetry 噪音偏高，详情卡层级竞争明显 |
| Primary Workspace | Market Overlay | 底部导航 `市场` | `js/ui/MapUI.js` + `js/ui/MarketUI.js` | 唯一完整市场工作区 | 职责清晰，但与 HUD 市场摘要仍有重复 |
| Secondary Overlay | Info Panel | 底部导航 `任务` | `js/ui/MapUI.js` + `js/ui/QuestUI.js` 等 | 完整任务 / 科技 / 派系 / 成就内容 | 与 HUD 任务摘要存在信息重叠 |
| Secondary Overlay | Trade Panel | 底部导航 `机库` | `js/ui/MapUI.js` + `js/ui/FleetUI.js` | 公司与舰队管理 | 重复展示 credits、day、公司摘要 |
| Secondary Overlay | Console Panel | 底部导航 `控制台` | `js/ui/MapUI.js` + `js/ui/HUD.js` | 日志与系统消息 | 压缩主地图垂直空间 |
| HUD Dock | Galactic Map / Market Overview / Target Intel / Network Status / Quest Tracker | 左上 rail | `js/ui/HUD.js` | 摘要导航和快捷信息 | Target Intel 曾混入无效操作按钮；HUD 摘要与完整工作区边界仍需继续压缩 |
| Blocking Modal | Trade / Event / Dialogue / Dispatch / Crew / Settings / Victory | 运行时动作 | 各 UI 模块 | 一次性决策和阻塞交互 | 还未统一成单一 modal 规则 |
| Non-blocking Surface | Event Notification | 事件触发 | `js/ui/EventUI.js` | 非阻塞通知 | 后续需纳入统一 toast 层级 |

## 桌面烟测结论

### 1. 主工作区入口可用，但职责冲突仍明显

- `市场` 打开后，主工作区切到 `market-overlay`，说明它已经具备唯一完整市场工作区的基础形态。
- `机库` 和 `任务` 会以侧边 overlay 打开，`控制台` 以底部 overlay 打开，说明 secondary overlay 基本成型。
- 当前更大的问题不是入口失效，而是信息重复和摘要层过厚。

### 2. 已确认的重复信息簇

- Header 与机库同时展示 credits / day / 公司摘要。
- Header 与底部状态条同时展示舰船即时状态的一部分。
- HUD Quest Tracker 与 Info Panel 同时承担任务摘要。
- HUD Market Overview 与 Market Overlay 同时承担市场视图。
- 目标信息在 Header / Target Intel / Planet Detail / Exploration Card 之间仍有多处镜像。

### 3. 已确认的无效或弱交互

- Header 通知按钮：可见，但没有运行时接线。
- Target Intel 中 `station-action-list` 三个按钮：可见，但没有运行时接线。
- 星图 telemetry 文案：仅承担装饰作用，会与 HUD dock 和目标卡争夺注意力。

### 4. 当前互斥逻辑的实际状态

- `MapUI` 已能让底部导航在 `市场 / 机库 / 任务 / 控制台 / 星图` 之间切换。
- `市场` 与 `info-panel / trade-panel / console-panel` 已存在互斥关闭逻辑。
- `HUD dock` 由 `HUD.js` 单独管理展开 / 收起，不与底部导航共享状态。
- 阻塞弹窗之间仍缺少统一的 stack 规则，这一项留给后续 batch。

## Action Audit

| 控件 / 信息 | 当前状态 | 依据 | 本轮处理 |
| --- | --- | --- | --- |
| Header 通知按钮 | 无效 | 仅在 `index.html` 和样式中出现，无 JS 引用 | 删除 |
| Target Intel `停靠 / 进入 / 查看` | 无效 | 仅在 `index.html` 和样式中出现，无 JS 引用 | 删除 |
| 星图 telemetry 文案 | 纯装饰 | 仅在 `index.html` 与样式中出现，无 JS 引用 | 删除 |
| Quest Tracker HUD | 有效但应降级为摘要 | 有 `HUD.js` 更新与跳转行为 | 保留，后续继续压缩内容 |
| Market Overview HUD | 有效但应降级为摘要 | 已由 `HUD.js` / `MarketUI.js` 更新 | 保留，后续继续压缩内容 |

## 首轮信息归属结论

- Header：保留全局身份信息和少量高优先级状态。
- Bottom Status：保留 fuel / shield / cargo 即时资源。
- Market Overlay：保留完整市场数据和操作。
- HUD Dock：只承担摘要、跳转和轻量态势信息。
- Info Panel：保留完整任务 / 科技 / 派系 / 成就内容。
- Trade Panel：保留公司与舰队经营摘要，不再重复承担全局信息主展示。

## 本轮已落地的清理项

- 删除 Header 通知按钮。
- 删除 Target Intel 中无接线的 `station-action-list`。
- 删除星图 telemetry 文案 DOM。

## 后续直接执行项

1. 把 Header / Bottom Status 的职责彻底分离，开始清掉机库中的重复全局状态。
2. 继续压缩 Target Intel、Planet Detail 和 Exploration Card 的信息边界。
3. 给 `MapUI` / `HUD` / modal 层补互斥与生命周期测试。
