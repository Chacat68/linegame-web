# 星际贸易商（Interstellar Trader）

> 一款运行在浏览器中的单机星际贸易经营游戏，当前版本以 Three.js 3D 星图为主视图，并提供 Canvas 2D 降级渲染

---

## 游戏简介

《星际贸易商》设定于银河历 3045 年。玩家扮演一名手持第一艘飞船的新晋贸易商，在广阔的星际网络中穿梭，通过买卖商品积累财富，逐步发展自己的商业帝国。

**目标**：成为银河系最富有的商人——拥有多艘高级飞船、在各大星球建立贸易站，并掌握星球经济与政治走向。

---

## 核心特色

| 特色 | 说明 |
|------|------|
| 自由贸易世界 | 自由选择贸易路线与商品，无固定剧情限制 |
| 动态经济系统 | 市场价格随供需关系实时波动 |
| 多元发展路径 | 和平贸易商、走私者、赏金猎人等多种玩法 |
| 随机事件 | 遭遇海盗、发现稀有资源、触发贸易机会等 |
| 深度管理系统 | 管理飞船、船员、货物与贸易站 |
| 派系与声望 | 与各大势力建立关系，解锁专属待遇 |
| 科技研究 | 解锁飞船升级与高级贸易能力 |
| 成就系统 | 多维度成就追踪，记录每段征途 |

---

## 当前实现状态

> 状态核对日期：2026-08-29。当前游戏版本 `0.6.4`，存档 schema `v17`。

### 当前版本已接入主流程的能力

- ✅ Three.js 3D 星图、跨星系视图与飞船飞行动画；WebGL2 不可用时降级为 Canvas 2D
- ✅ 核心贸易循环（买入 → 航行 → 卖出 → 结算）
- ✅ 探索 MVP：POI 调查、秘密航线解锁
- ✅ 动态经济：供需、价格历史、经济周期、市场深度、峰值事件
- ✅ 黑市与走私：黑市定价、权限判定、走私检查、查获罚款统计
- ✅ 统一商业终端：`MarketUI.js` 编排现货、资金与贸易站工作区；Chart / Spot / Goods / Capital / Operations / Commodity Detail Presenter 分别拥有各自投影，`MarketExperienceRoute` 独占解锁进度模型，`MarketWorkspaceNavigation` 独占一级/二级菜单、焦点与 ARIA，`MarketChromeController` 独占顶部 Chrome、详情地点/模式与引导焦点，`MarketOverviewPresenter/Controller` 独占各地报价模型、表格 DOM 和买卖价键盘切换，`MarketSelectionController` 统一商品卡/行情榜焦点与 Context；行情链由 `MarketChartPresenter` 纯生成冻结仪表板/K 线 view model，`MarketChartViewAdapter` 独占 DOM 与单根 intent 委托，`MarketChartController` 只解释焦点/统计窗口和局部重绘；`MarketGoodsController` 独占商品列表、快速交易和 typed command 转换，`MarketSpotController` 组合现货外壳、总览、商品、图表、分析和局部重绘，`MarketFinanceController` 独占资金/贸易站容器、typed command、经营排序与 Commerce 快照，`MarketCommodityController` 统一商品 Context/L4 的地点、市场模式、价格和库存解析，外壳 / 交易 / 资金 / 贸易站具备独立 render port 与 dirty region
- ✅ 金融基础：贷款、信用评级与贸易站投资；旧股票、期货和手动保险入口已退役，旧存档首次载入时自动清算或退保
- ✅ 贸易站经营：建站、升级、经理、策略、被动收益
- ✅ 舰队与船员：多船、改装、船员招募、派遣航线；Hangar/Shop 的 Presenter/Controller 分别独占只读投影与选择/DOM/Context/采购 intent，Crew/Mod 的 Presenter/Controller 分别独占纯投影与交互生命周期，Dispatch 由 Presenter / Session / ViewAdapter / Controller 分别独占纯投影、草案诊断、表单 DOM 与领域用例，`FleetSurfaceCoordinator` 独占 inline/blocking Surface、Portal 构造、危险确认与 reset，`FleetInlinePortalController` 独占内联二级界面的 ARIA/inert/滚动/焦点，`FleetShipDetailController` 独占舰船 Context/L4 宿主，`FleetCommandAdapter` 独占 UI action → typed command；`FleetUI` 由 656 行收束为 237 行组合门面
- ✅ 派系、科技、任务、成就、胜利条件、教程；档案五类对象共用 Context → L4 详情、分页清理与焦点返回协议
- ✅ 本地存档：4 槽位、导入导出、版本迁移、自动存档
- ✅ 中期专题教学：科研经济、自动跑商、贸易站经营、资金管理 4 条可主动启动的专题链，由真实经营结果推进并随存档保存
- ✅ 本地平衡统计导出：指标只随存档留在本设备，不自动上传；导出 JSON 可先审查再自行决定是否分享
- ✅ 基础音效 MVP：UI 点击、交易成交、航行与事件提示音，含开关和音量设置
- ✅ 延迟工作区失败恢复：市场、机库、档案与存档加载失败时保留当前工作区和上下文，显示局部错误面并可原位重试
- ✅ 五个同级 L3 工作区：map / trade / fleet / archive / logs 共用 `workspace-surface + is-active + inert/ARIA` 契约；市场已脱离星图 DOM，终端不再依赖 drawer/overlay 可见状态
- ✅ 通讯来源契约：`LogMessage.js` 统一冻结 `text / type / source` envelope，动作、日结、引导、存档、设置、教程、成就与胜利运行时按领域发布来源；日志可按系统、交易、航行、舰队、任务、科研、探索、事件及机会/风险信号筛选，Context/L4 同步呈现来源与分类，不从正文猜测类别
- ✅ UI 刷新所有权：`GameUiCoordinator` 由 680 行降至 377 行，只保留 dirty-region 路由、Feature ensure/reset 与 diagnostics 组合；`GameUiWorkspaceRenderer` 独占 Market/Fleet/Archive/Save 区域请求和 typed command 注入，`GameUiRenderSession` 独占成功渲染计数、刷新事务与失效诊断
- ✅ UI 应用组合所有权：434 行 `GameUiApplicationRuntime` 只保留惰性 controller 图与顶层生命周期；`GameUiNavigationPort` 独占冻结导航协议，36 行 `GameUiApplicationDiagnostics` 纯组合 Coordinator 渲染/会话、Feature recovery、Context Inspector、Event UI、Navigation、Workspace Surface、共享 L4、Blocking/Escape 与子控制器 diagnostics
- ✅ 工作区内部交互 owner：商业入口/浏览位置由 `MarketWorkspaceEntryController + Session` 持有，Archive/Fleet Tab 由 `WorkspaceTabController` 统一键盘、ARIA、深链与释放；Map/Market/Fleet/Archive 的 Context → L4 入口统一使用显式 local-scope `WorkspaceActionSlot`，不会竞争全局 Action Guide
- ✅ 星图 UI 所有权：`MapPanelViewController` 独占星系/星球面板 DOM、ARIA、滚动和几何投影，`MapPanelController` 独占详情根节点解析与委派动作协议，`MapContextController` 独占 Context key、Renderer selection 与 Escape，`MapInteractionController` 独占 Renderer 全局回调、EventBus 和 DOM listener 生命周期，`MapNavigationController` 独占工作区请求、星系/星球切换、旅行分发、引导聚焦与 Renderer 对焦；`MapUI` 由 674 行收束为 331 行无 DOM 组合协调门面
- ✅ Archive 任务所有权：`QuestWorkspaceSession` 独占候选焦点，Available/Active/Locked Presenter 分别生成可接取、进行中和未解锁生命周期投影，208 行 `QuestBoardPresenter` 只组合章节指挥台与分诊；Route/Objective/Detail Presenter 独占路线、目标与 Context/L4，`QuestBoardController` 以单一容器委托接取/放弃/派遣/阻塞恢复并用 generation 丢弃旧确认；`QuestUI` 收束为 98 行兼容门面
- ✅ Archive 科研所有权：`ResearchBoardPresenter`、`ResearchDispatchPresenter` 与 `ResearchDetailPresenter` 纯生成总览/队列/补给/Context/L4，`ResearchBoardController` 独占候选与已完成根节点委托、队列动作和 generation-safe 清空确认；`ResearchUI` 由 716 行收束为 96 行组合门面
- ✅ Archive 派系所有权：`FactionBoardPresenter` 纯生成关系总览、派系卡和市场 CTA，`FactionDetailPresenter` 纯生成 Context/L4，`FactionBoardController` 以单一根委托检查/市场跳转并完整释放；`FactionUI` 由 446 行收束为 65 行组合门面
- ✅ Archive typed command：`ArchiveCommand.js` 统一任务、科研、派系的 12 类动作 envelope，`ArchiveCommandAdapter.js` 是 UI intent 的唯一转换边界；Quest/Research/Faction 门面只接收 `{ state, dispatchContext, onCommand }` 请求对象，工作区渲染器不再分发位置参数或领域回调
- ✅ Archive 成就所有权：`AchievementBoardPresenter` 纯生成总览、分类、奖励池与卡片，`AchievementDetailPresenter` 纯生成 Context/L4，`AchievementBoardController` 以单一根委托卡片检查并完整释放；`AchievementUI` 由 318 行收束为 63 行组合门面
- ✅ Archive 探索所有权：`ArchiveExplorationSession` 独占航点/连续任务焦点，`ArchiveExplorationPresenter` 与 `ArchiveReportDetailPresenter` 纯生成探索总览、报告卡、Context/L4，`ArchiveExplorationController` 独占报告检查、键盘语义和聚焦滚动；`ArchiveExplorationUI` 由 360 行收束为 81 行组合门面
- ✅ 设置终端所有权：`SettingsUiController` 永久独占外部 launcher 与延迟加载，`SettingsViewPresenter` 纯生成控件/摘要模型，`SettingsModalController` 独占弹层分页、控件、危险确认和释放，`SettingsCommandController` 独占 mutation/持久化/Renderer/Audio；`SettingsManager` 由 416 行收束为 36 行组合门面；1,341 行 `settings-workspace.css` 独占 launcher、弹层、分页、控件、延迟状态与响应式级联，五个旧 owner 的 257 个有效私有选择器分支归零；360×640 的设置摘要改为 2×2，内容可视高度增加且保持单一内部滚动、44px 控件、方向键分页和关闭焦点返回
- ✅ 存档终端所有权：`SaveWorkspacePresenter` 纯生成安全状态、槽位和确认描述，357 行 `SaveWorkspaceController` 独占容器事件、确认、导入导出、异步失效与重绘后焦点恢复；保存/读取只经 `SaveCommand + SaveCommandAdapter` 发布到 `GamePersistenceController.handleCommand`，`SaveUI` 由 447 行收束为 18 行请求对象组合门面，并随会话/Feature 释放；763 行 `save-workspace.css` 独占存档私有级联，旧 owner 不再声明 `.save-*`、`#save-list` 或迁移按钮；390×844、360×640 真实浏览器验收覆盖单一内部滚动、零横向溢出、44px 触控目标和同槽位焦点回显，迁移前后桌面/移动几何指标一致
- ✅ 教程覆盖层所有权：`TutorialStepPresenter` 纯生成步骤内容与可访问语义，229 行 `TutorialTooltipLayout` 独占 visual viewport/安全区定位、真实布局尺寸测量和监听，307 行 `TutorialOverlayController` 独占 EventBus、高亮、焦点循环与按钮交互；高亮只为原本 static 的目标补定位，不再破坏 fixed/absolute 几何；`TutorialUI` 由 438 行收束为 25 行组合门面，390×420/390×844 真实浏览器覆盖键盘高度变化、多步骤重排和首尾焦点循环
- ✅ 剧情弹层所有权：`DialogueSession` 独占播放/分支状态，`DialoguePresenter` 纯生成场景/进度/分支语义，356 行 `DialogueModalController` 独占 Surface、DOM、键盘、离屏选项焦点回显和幂等完成提交；`DialogueUI` 由 384 行收束为 29 行组合门面，360×640 与 390×844 真实浏览器验收覆盖长文本、四选项滚动及 Escape 关闭顺序
- ✅ 事件 / 剧情 Flow CSS 单一归属：784 行 `flow-surfaces.css` 独占事件与剧情弹层、摘要、影响/分支卡、选择项、动作区、动效和响应式级联，`modals.css`、`responsive.css`、`interstellar-trader.css` 的 165 个原私有选择器分支归零；1280×720 事件桌面几何保持一致，600px/390×844/360×640 验收确认摘要完整可见、单一内容滚动、零横向溢出、选择态隐藏动作真正消失且剩余按钮达到 44px
- ✅ Blocking Surface Shell CSS 单一归属：237 行 `blocking-surfaces.css` 在全局壳层之后、Feature owner 之前独占 L6 overlay、box、标题、`.stack-modal-scroll`、`.modal-actions`、安全区、焦点环与响应式几何；5 个旧 owner 的 70 个通用选择器分支归零，7 个无 DOM 消费者的旧 Modal 结构类删除。低权重 `:where()` 壳层允许 Settings/Flow/Save 接管内部布局；390×844 与 360×640 验收确认短内容居中、长内容单滚动、派遣动作区常驻、零横向溢出和 44px 触控目标
- ✅ Context Inspector 所有权：`ContextInspectorSession` 独占五工作区不可变 context key、常规/紧凑视口独立开合偏好与 revision，`ContextInspectorPresenter` 纯生成壳层/空态投影，`ContextInspectorViewAdapter` 独占根节点、ARIA、工作区宿主、DOM 事件与焦点恢复，`ContextInspectorController` 只编排 latest-state renderer/action、Session、Escape、响应式开合与无领域对象的冻结 diagnostics；Controller 从 426 行降至 307 行，`ContextInspector` 保持 36 行兼容门面；诊断中的 Context/renderer workspace、计数、开合和 ViewAdapter 生命周期已进入 UI 应用顶层快照；`HudInteractionController` 只监听 `900px` 断点并切换会话模式，运行中缩到窄屏不会继承桌面展开态；窄屏空态收束为紧凑提示条，选中对象后再恢复完整可滚动信息面
- ✅ Header 信息唯一归属：公司身份、信用点、位置、日期和当前舰船资源由 Header 权威展示；机库只保留净资产、等级、容量与经营权限详情
- ✅ Header CSS 单一归属：生产级联中的 `#game-header` / `.hdr-*` 只允许出现在 `surfaces.css` 与 `bridge-responsive.css`；旧主题、旧响应式、Modal 与 Layout 不再覆盖 Header
- ✅ Bottom Nav CSS 单一归属：导航容器、五个目的地、当前项、角标、星系模式与窄屏/阻塞状态统一由 `surfaces.css` 与 `bridge-responsive.css` 管理
- ✅ Command Slot CSS 边界：`surfaces.css` 独占 Action Guide 组件视觉、内部网格、surface 语义色与处理/完成反馈，`bridge-responsive.css` 独占响应式和阻塞避让，`global-shell-v2.css` 只定位 `.floating-command-stack`；legacy 不再声明 Action Guide
- ✅ Context / Detail CSS 模块：Global L2 Context Inspector 与 Global L4 Workspace Detail 已分别进入 `context-inspector.css`、`workspace-detail.css`；`global-shell-v2.css` 从 789 行降至 72 行，只保留 L3 焦点、Inspector → Command Slot 跨层关系与命令槽定位
- ✅ Starmap Controls CSS 单一归属：两个活动星图工具只由 `starmap-controls.css` 声明，窄屏触摸高度统一为 44px；无消费者的旧控制轨、隐藏 3D 按钮、五个 HUD 小窗及舰队延迟样式污染已物理删除
- ✅ 退役 Company Directives UI：运行时入口、Presenter 和 DOM 均已不存在，四个样式层中的 724 行孤儿规则同步删除；`companyDirectiveClaims` 仅作为旧存档兼容字段继续保留
- ✅ Market CSS Feature 归属：商业终端基础规则已从按需加载的 `fleet.css`，以及全局加载的 `panels.css`、`systems.css`、`responsive.css`、`interstellar-trader.css` 迁入 `market-terminal.css`；市场不再依赖“先打开机库”，主包也不再预载 Feature 私有级联；旧 Capital Signal、股票持仓、期货风险和 Finance Contract/History 面板样式已物理删除
- ✅ Vitest 测试基线：235 个测试文件、1588 项测试，覆盖经济、贸易、航行、探索、事件与随机事件运行时、统一动作控制器图、成就检查队列、持久化事务、Game Application shell/Runtime Graph/五个职责节点工厂簇/启动投影/Feature/UI/Guidance/Loop Runtime 组合边界、UI Navigation port/Application diagnostics、manifest/registry 生命周期与延迟工作区错误恢复、Game Shell Projection/Header/Company/Archive Badge Presenter 与信息所有权、Map Galaxy Hub/View State/Survey Detail/Panel Layout/Panel View/Context/Interaction/Navigation Controller、Workspace Surface/Detail 生命周期与 L3/Blocking/Market/Settings/Save/Flow Surface CSS 所有权、Renderer dispose/re-init/开发态 2D 强制降级、Market Chrome/Chart Presenter/View Adapter/Controller/Selection/Spot/Goods/Finance/Commodity/Capital/Operations/Batch Plan/Local Operations/Operations Overview/Trade Station List/Commodity Detail/Experience Route/Overview/Workspace Navigation Controller、Fleet Hangar/Shop/Crew/Mod/Dispatch Presenter/Session/View Adapter/Controller/Surface Coordinator/Inline Portal/Ship Detail/Command Adapter、Quest Available/Active/Locked/Board/Route/Objective/Detail Presenter/Controller/Session、Research Board/Dispatch/Detail Presenter/Controller、Faction Board/Detail Presenter/Controller、Achievement Board/Detail Presenter/Controller、Archive Exploration Session/Board/Report Detail/Controller、Settings View/Modal/Launcher Controller、Save Workspace Presenter/Controller/Command Adapter、Tutorial Step/Tooltip/Overlay、Dialogue Session/Presenter/Modal Controller 与 Workspace Object Detail Presenter、typed market/fleet/archive/save/settings command、资金与贸易站投影、Context 局部 intent、视口模式开合隔离、焦点同步、Shell/HUD/FleetUI 命令所有权、自动派遣与日结算提交顺序、经营金融、舰队、科研任务档案动作、剧情与胜利运行时、eager UI 壳/设置/首次进入/释放生命周期、教学引导与 onboarding policy、存档、会话生命周期、时钟、命令目的地、行动引导执行适配、市场工作区入口、工作区 Tab 与局部操作槽、Market/Fleet/Archive 内部增量失效、typed 日志来源契约、日志 Context/筛选/聚合与 UI 所有权等核心系统

### 当前开发中的能力

- 🔶 探索深化：复杂遗迹链、异常区域和专属事件分支
- 🔶 飞船与剧情深化：高阶船型定位、章节推进与关键事件演出

### 当前尚未实现的远期能力

- ◐ 背景音乐 / 音频资源包 / 动态音乐系统
- ❌ i18n 与多语言切换
- ❌ 云存档 / 账号同步
- ❌ 多人联网 / 排行榜 / 社交系统

> 说明：`docs/design/` 下保留了大量远期设计稿。阅读设计文档时，请优先以 `MVP路线图.md`、`设计实现对照表.md`、`09_技术架构设计.md`、`存档系统设计.md` 和当前代码结构为准，不要把所有设计项都理解为已落地功能。

---

## 快速开始

本项目为纯前端应用，无服务端依赖。推荐使用 Node.js 与 Vite 启动开发环境；也可以使用任意静态服务器直接运行源码。

```bash
# 克隆仓库
git clone https://github.com/Chacat68/linegame-web.git
cd linegame-web
npm ci

# 默认本地启动方式
npm run dev

# 或直接使用 Python 静态服务器
python3 -m http.server 4173 --directory .

# 如果 4173 已被占用，可改用备用端口
npm run dev:alt
```

然后在浏览器中访问 `http://localhost:4173`。

如果使用备用端口，则访问 `http://localhost:4174`。

> VS Code 工作区内置的 `Run local web server` 任务也使用 4173 端口，因此 README、任务和命令行入口现在保持一致。

> 也可以直接双击 `index.html` 打开，但 ES Module 在部分浏览器中需要通过 HTTP(S) 协议访问。

提交前的本地验证：

```bash
npm test
npm run build
```

---

## Cloudflare Pages 部署

### 首次部署前准备

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Pages**，创建名为 `linegame-web` 的 Pages 项目。

### 配置 GitHub 仓库 Secrets

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：

| Secret 名称 | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌（需要 Pages 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

### 自动部署

- 推送到 `main` 分支：部署到生产环境
- 提交 Pull Request：部署到预览环境

> 当前 workflow 会先执行 `npm test`，通过后再构建并按凭据是否可用决定是否部署。

---

## 项目结构

```
/
├── index.html              # 主入口
├── css/
│   ├── style.css           # 样式聚合入口
│   └── *.css               # 终端、舰桥、地图、面板与响应式样式模块
├── js/
│   ├── main.js             # 应用入口：初始化与模块编排
│   ├── core/
│   │   ├── EventBus.js     # 全局事件总线（pub/sub）
│   │   ├── LogMessage.js   # 通讯日志 text/type/source envelope 与来源标签契约
│   │   ├── ArchiveCommand.js # 档案任务/科研/派系 typed command 契约
│   │   ├── SaveCommand.js # 存档保存/读取 typed command 契约
│   │   ├── MarketCommand.js # 市场 UI / controller typed command 契约
│   │   ├── FleetCommand.js # 舰队 UI / controller typed command 契约
│   │   ├── SettingsCommandController.js # 设置 mutation、持久化与投影 typed command 边界
│   │   ├── SettingsUiController.js # 设置 launcher、延迟加载与会话失效 owner
│   │   ├── SettingsManager.js # 设置 Presenter/Controller 兼容组合门面
│   │   ├── UsageDataExportEffect.js # 脱敏平衡统计 JSON 下载副作用边界
│   │   ├── MarketWorkspaceController.js # 市场命令与工作区生命周期
│   │   ├── GameFeatureRecoveryDiagnostics.js # 延迟功能加载、恢复与设置状态快照
│   │   ├── GameUiApplicationDiagnostics.js # UI 顶层复合 diagnostics 纯快照
│   │   ├── GameUiNavigationPort.js # 领域/引导共享的冻结 UI 导航端口
│   │   ├── GameUiApplicationRuntime.js # 惰性 UI controller 图与顶层生命周期组合边界
│   │   ├── GameLoopRuntime.js # 实时日、场景帧与命名周期任务组合边界
│   │   ├── GameApplication.js # 正式应用组合根、Runtime Graph 与启动/关闭入口
│   │   ├── GameRuntimeNodeFactories.js # 12 个 runtime 节点的薄注册表与唯一归属校验
│   │   ├── Game*RuntimeFactor*.js # session/feature/action/guidance/UI 五个职责装配簇
│   │   ├── GameStartupProjection.js # Settings/Audio/Renderer 两阶段启动投影
│   │   ├── GameRuntimeGraph.js # runtime 节点惰性构造、循环保护、诊断与清理
│   │   ├── GameApplicationLifecycle.js # 应用级 shutdown 与资源释放顺序
│   │   └── GameManager.js  # 历史公共 API 兼容门面
│   ├── testing/
│   │   ├── GameApplicationTestHarness.js # 真实 Runtime Graph 的应用级测试控制面
│   │   └── GameApplicationTestHarnessRegistry.js # 仅 test mode 注册的 harness 工厂
│   ├── data/               # 静态数据定义
│   │   ├── goods.js        # 商品定义
│   │   ├── systems.js      # 星系定义
│   │   ├── ships.js        # 飞船定义
│   │   ├── upgrades.js     # 升级定义
│   │   ├── quests.js       # 任务定义
│   │   └── ...             # 其他数据文件
│   ├── systems/            # 游戏逻辑系统
│   │   ├── economy/        # 经济与价格计算
│   │   ├── trade/          # 交易逻辑
│   │   ├── event/          # 随机事件
│   │   ├── quest/          # 任务系统
│   │   ├── achievement/    # 成就系统
│   │   ├── faction/        # 派系与声望
│   │   ├── fleet/          # 舰队管理
│   │   ├── research/       # 科技研究
│   │   ├── tutorial/       # 新手引导
│   │   ├── victory/        # 胜利条件
│   │   └── save/           # 存档系统
│   └── ui/                 # 界面组件
│       ├── StarmapRenderer.js    # 星图渲染门面与降级切换
│       ├── RendererThreeStarmap.js # Three.js 3D 星图
│       ├── Renderer2DStarmap.js  # Canvas 2D 降级渲染
│       ├── GameShellProjection.js # Header/公司/Archive/长期路线单一全局投影
│       ├── HUD.js          # Shell 交互生命周期与通讯日志门面
│       ├── HeaderStatusPresenter.js # Header 资源、位置、舰船与 meter 纯投影
│       ├── CompanyOverviewPresenter.js # 公司身份与机库经营概览纯投影
│       ├── ArchiveBadgePresenter.js # 档案分类与主导航待处理角标纯投影
│       ├── HudInteractionController.js # HUD 事件、弹层、日志、星图工具与 Context 断点生命周期
│       ├── VictoryProgressPresenter.js # 长期路线摘要与详情纯 DOM 投影
│       ├── BlockingSurfaceDismissRegistry.js # Blocking dismiss 多 owner 注册与释放
│       ├── SurfaceManager.js # Blocking Surface、焦点陷阱与唯一 Escape dispatcher
│       ├── EventPresenter.js # 随机事件摘要、影响与选择项纯投影
│       ├── EventSurfaceController.js # 事件弹层 DOM、键盘、焦点与释放 owner
│       ├── EventUI.js      # 待处理事件会话兼容门面
│       ├── MarketUI.js     # 商业终端（现货/资本/经营）
│       ├── MarketChartPresenter.js # 行情快照、K 线与图表投影
│       ├── MarketChartViewAdapter.js # 行情 view model、DOM 与单根 intent 委托
│       ├── MarketChartController.js # 仪表板、主 K 线与统计窗口交互
│       ├── MarketSelectionController.js # 商品卡/行情榜共享选择与 Context
│       ├── MarketSpotPresenter.js # 现货、行情与黑市投影
│       ├── MarketSpotController.js # 现货外壳、快照与子控制器组合
│       ├── MarketChromeController.js # 顶部 Chrome、详情模式与引导焦点
│       ├── MarketGoodsPresenter.js # 商品模型、卡片 HTML 与 command 协议
│       ├── MarketGoodsController.js # 商品列表、快速交易、焦点与 diagnostics
│       ├── MarketCapitalPresenter.js # 资金结构与经营贷款投影
│       ├── MarketOperationsPresenter.js # 贸易站经营工作区组合门面
│       ├── MarketBatchPlanPresenter.js # 批量排序、预算覆盖与执行清单投影
│       ├── MarketLocalOperationsPresenter.js # 当前地点经营状态与本地操作投影
│       ├── MarketOperationsOverviewPresenter.js # 商网指挥台与网络概览投影
│       ├── MarketTradeStationListPresenter.js # 建站候选、探索情报与已建站列表
│       ├── MarketOperationsPresentationSupport.js # 商网投影共享安全格式化语义
│       ├── MarketFinanceController.js # 资金/贸易站 DOM、命令、排序与快照
│       ├── MarketCommodityDetailPresenter.js # 商品 Context 与 L4 详情纯投影
│       ├── MarketCommodityController.js # 商品 Context/L4 状态解析、容器与 diagnostics
│       ├── MarketExperienceRoute.js # 商业终端解锁路线与进度纯模型
│       ├── MarketOverviewPresenter.js # 各地报价可见性、价格与表格纯投影
│       ├── MarketOverviewController.js # 价格总览 DOM、口径切换与 diagnostics
│       ├── MarketWorkspaceNavigation.js # 一级/二级菜单、焦点与 ARIA 交互
│       ├── MarketWorkspaceSession.js # 商业工作区选择、图表与排序会话状态
│       ├── MarketWorkspaceEntrySession.js # 商业入口、浏览地点与待聚焦请求会话
│       ├── MarketWorkspaceEntryController.js # 商业入口按钮、星系导航与刷新协调
│       ├── FleetHangarPresenter.js # 机库主视图模型、HTML 与 UI intent
│       ├── FleetHangarController.js # 查看舰会话、DOM、Context、焦点与二级入口
│       ├── FleetShopPresenter.js # 船坞采购模型、HTML 与 UI intent
│       ├── FleetShopController.js # 采购 DOM、购买 intent 与焦点 diagnostics
│       ├── FleetCrewPresenter.js # 船员详情模型、HTML 与 roster intent
│       ├── FleetCrewController.js # 船员 DOM、名单委托、危险确认与安全刷新
│       ├── FleetModPresenter.js # 改装/保养详情模型、HTML 与 UI intent
│       ├── FleetModController.js # 改装 DOM、引导焦点、危险确认与安全刷新
│       ├── FleetDispatchPresenter.js # 自动跑商策略、估算、风险与 CTA 投影
│       ├── FleetDispatchSession.js # 自动跑商草案与生命周期诊断
│       ├── FleetDispatchViewAdapter.js # 自动跑商表单 DOM、投影与处理器
│       ├── FleetDispatchController.js # 自动跑商推荐、估算、Surface 与命令用例
│       ├── FleetShipDetailPresenter.js # 舰船 Context 与 L4 详情纯投影
│       ├── FleetShipDetailController.js # 舰船 Context/L4 模型与宿主投影
│       ├── FleetSurfaceCoordinator.js # Fleet Surface、Portal、危险确认与 reset owner
│       ├── FleetInlinePortalController.js # 机库内联二级界面、滚动与焦点
│       ├── FleetCommandAdapter.js # Fleet UI action → typed command
│       ├── ArchiveCommandAdapter.js # Archive UI action → typed command
│       ├── SaveCommandAdapter.js # Save UI intent → typed command
│       ├── QuestUI.js      # 任务 Session/Presenter/Controller 兼容门面
│       ├── QuestWorkspaceSession.js # 候选任务焦点会话状态
│       ├── QuestPresentationSupport.js # 任务投影共享安全转义
│       ├── QuestAvailablePresenter.js # 可接任务选择、简报与候选列表
│       ├── QuestActivePresenter.js # 进行中任务进度、路线与操作
│       ├── QuestLockedPresenter.js # 未解锁任务与章节完成空态
│       ├── QuestBoardPresenter.js # 章节指挥台、分诊与子投影组合
│       ├── QuestRoutePresenter.js # 路线、派遣与阻塞恢复纯投影
│       ├── QuestObjectivePresenter.js # 目标文案与计量单位纯投影
│       ├── QuestDetailPresenter.js # 任务 Context 与 L4 详情纯投影
│       ├── QuestBoardController.js # 首页 DOM 委托、确认与焦点协调
│       ├── ResearchUI.js # 科研 Presenter/Controller 兼容门面
│       ├── ResearchBoardPresenter.js # 科研总览、候选、队列与完成纯投影
│       ├── ResearchDispatchPresenter.js # 科研补给与阻塞恢复纯投影
│       ├── ResearchDetailPresenter.js # 科技 Context 与 L4 详情纯投影
│       ├── ResearchBoardController.js # 科研 DOM 委托、队列确认与释放
│       ├── FactionUI.js # 派系 Presenter/Controller 兼容门面
│       ├── FactionBoardPresenter.js # 关系总览、派系卡与市场 CTA 纯投影
│       ├── FactionDetailPresenter.js # 派系 Context 与 L4 详情纯投影
│       ├── FactionBoardController.js # 派系检查与市场跳转 DOM 委托
│       ├── AchievementUI.js # 成就 Presenter/Controller 兼容门面
│       ├── AchievementBoardPresenter.js # 成就总览、分类与卡片纯投影
│       ├── AchievementDetailPresenter.js # 成就 Context 与 L4 详情纯投影
│       ├── AchievementBoardController.js # 成就卡片检查 DOM 委托
│       ├── ArchiveExplorationUI.js # 探索档案 Session/Presenter/Controller 兼容门面
│       ├── ArchiveExplorationSession.js # 航点与连续任务焦点会话
│       ├── ArchiveExplorationPresenter.js # 探索总览、报告卡与连续任务纯投影
│       ├── ArchiveReportDetailPresenter.js # 探索报告 Context 与 L4 详情纯投影
│       ├── ArchiveExplorationController.js # 报告检查与聚焦滚动 DOM 委托
│       ├── ArchiveUI.js    # 档案 Feature 组合、会话诊断与释放
│       ├── SettingsViewPresenter.js # 设置控件与摘要纯投影
│       ├── SettingsModalController.js # 设置弹层分页、控件、确认与释放
│       ├── SaveUI.js # 存档 Presenter/Controller 请求对象组合门面
│       ├── SaveWorkspacePresenter.js # 存档状态、槽位与确认描述纯投影
│       ├── SaveWorkspaceController.js # 存档 DOM、确认、迁移与释放
│       ├── TutorialUI.js # 教程 Presenter/Layout/Controller 兼容门面
│       ├── TutorialStepPresenter.js # 教程步骤内容与可访问语义纯投影
│       ├── TutorialTooltipLayout.js # 教程视口定位与监听生命周期
│       ├── TutorialOverlayController.js # 教程 EventBus、高亮、焦点与交互
│       ├── DialogueUI.js # 剧情 Session/Presenter/Controller 兼容门面
│       ├── DialogueSession.js # 剧情播放与分支会话状态
│       ├── DialoguePresenter.js # 剧情场景、进度与分支纯投影
│       ├── DialogueModalController.js # 剧情 Surface、DOM、键盘与焦点
│       ├── WorkspaceObjectDetailPresenter.js # 工作区对象共享 L4 纯投影
│       ├── WorkspaceSurfaceController.js # 五个 L3 工作区可见性、inert 与焦点
│       ├── WorkspaceTabController.js # Archive/Fleet Tab 键盘、ARIA 与深链 owner
│       ├── WorkspaceActionSlot.js # L3/L4 局部操作槽纯 HTML 契约
│       ├── MapGalaxyHubPresenter.js # 星系总览模型、HTML 与跃迁 intent
│       ├── MapViewStateController.js # 星系/星球视图与悬停状态所有权
│       ├── MapWorkspaceSession.js # 星图选择、披露区与局部航线焦点会话
│       ├── MapExplorationPresenter.js # POI 流程模型、HTML 与探索 intent
│       ├── MapPlanetDetailPresenter.js # 星球摘要、航线焦点与 travel intent
│       ├── MapPanelLayout.js # 星图详情面板纯几何布局
│       ├── MapPanelController.js # 星球/星系/POI 委派动作协议
│       ├── MapPanelViewController.js # 星图面板 DOM、ARIA、滚动与几何投影
│       ├── MapContextController.js # 地图 Context、Renderer selection 与 Escape
│       ├── MapInteractionController.js # Renderer/EventBus/DOM listener 生命周期
│       ├── MapNavigationController.js # 地图导航、旅行分发与引导聚焦用例
│       ├── MapSurveyDetailPresenter.js # 探索档案/报告纯 HTML 与 intent
│       ├── MapSurveyDetailController.js # 两层探索详情 renderer 与导航适配
│       ├── MapUI.js        # 星图会话、视图与动作端口组合协调门面
│       ├── LogsWorkspaceSession.js # 通讯历史、筛选、聚合与未读会话状态
│       ├── LogsWorkspaceController.js # 日志列表 DOM、筛选控件、Context 与可释放 listener
│       ├── ShipUI.js       # 飞船与货舱界面
│       ├── Modal.js        # 交易确认弹层与完整 listener/dismiss 生命周期
│       ├── ActionConfirmUI.js # 应用级危险确认与 shutdown 释放
│       ├── OnboardingUI.js # 首次进入/公司命名 Feature 弹层
│       ├── EventPresenter.js # 随机事件摘要、影响与选择项纯投影
│       ├── EventSurfaceController.js # 事件弹层 DOM、键盘、焦点与释放 owner
│       ├── EventUI.js      # 待处理事件 session 兼容门面
│       └── ...             # 其他 UI 模块
└── docs/
    └── design/             # 游戏设计文档
```

---

## 技术架构

- **运行环境**：纯浏览器，无服务端依赖
- **渲染**：Three.js 3D 星图 + Canvas 2D 降级 + DOM/CSS 业务界面
- **语言**：Vanilla JavaScript + ES Modules
- **开发与构建**：Vite；测试使用 Vitest
- **状态管理**：`GameManager.js` 持有单一运行态 `_state`
- **存档**：localStorage 多槽位本地存储（4 槽位，含自动存档）
- **通信方式**：业务系统由 `GameManager` 编排，辅以 `EventBus` 做轻量广播

---

## 设计文档

详细设计文档位于 [docs/design/](docs/design/) 目录，包含：

- [游戏概述](docs/design/01_游戏概述.md)
- [核心循环设计](docs/design/01_核心循环设计.md)
- [贸易系统](docs/design/02_贸易系统.md)
- [飞船系统](docs/design/03_飞船系统.md)
- [经济与市场系统](docs/design/05_经济与市场系统.md)
- [任务与剧情系统](docs/design/06_任务与剧情系统.md)
- [技术架构设计](docs/design/09_技术架构设计.md)
- [MVP 路线图](docs/design/MVP路线图.md)
- [设计实现对照表](docs/design/设计实现对照表.md)
- [存档系统设计](docs/design/存档系统设计.md)
- [代码实现方案](docs/design/实现方案.md)

---

## 许可证

本项目仅供个人学习与研究使用。
