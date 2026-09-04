# 星际贸易商 - 一页优先级路线图

> 更新时间：2026-08-21
> 结论先行：P0 稳态建设已基本完成，中期专题教学链也已闭合启动、真实动作推进与 v17 存档。P1 下一优先级转向探索深化、飞船经营增强和剧情表达。

---

## 1. 当前阶段判断

### 已经具备的主干能力

- 核心贸易闭环：买入 -> 航行 -> 卖出 -> 结算
- 动态经济：供需、价格历史、经济周期、黑市、走私检查
- 中期系统：金融、贸易站经营、舰队、船员、派系、科技、任务、成就、胜利
- 运行框架：3D 星图、商业终端、教程、行动引导、存档、测试基线、基础短音效
- 探索 MVP：POI 调查、隐藏航线、探索档案终端、勘探报告复核
- 行动引导二阶段：已覆盖科研补给派遣、普通商运派遣、待处理事件、低燃料补给、维修/资金不足、商网批量经营、贷款管理和探索情报复核
- 数值平衡：全量经济审计已完成，价格优惠共享递减上限，贸易站回本曲线合理，五条胜利路线量化为具体门槛
- 本地验收指标：首单追踪、10 分钟继续经营率、商品利润占比、长期路线选择、30 天资产快照、完成用时
- 中期专题教学：科研经济、自动跑商、贸易站经营、资金管理 4 条链可主动启动，由真实经营结果推进并持久化
- 测试基线：235 个测试文件、1588 项测试，覆盖经济/贸易、航行、探索、事件与随机事件运行时、统一动作控制器图、成就检查队列、持久化事务、Game Application shell/Runtime Graph/五个职责节点工厂簇/启动投影/Feature/UI/Guidance/Loop Runtime 组合边界、UI Navigation port/Application diagnostics 与 manifest/registry 生命周期、延迟工作区局部失败恢复、Game Shell Projection/Header/Company/Archive Badge Presenter 与信息所有权、Map Galaxy Hub/View State/Survey Detail/Panel Layout/Panel View/Context/Interaction/Navigation Controller、Workspace Surface/Detail 生命周期与 L3/Blocking/Flow CSS 所有权、Renderer dispose/re-init/开发态 2D 强制降级、Market Chrome/Chart Presenter/View Adapter/Controller/Selection/Spot/Goods/Finance/Commodity/Capital/Operations/Batch Plan/Local Operations/Operations Overview/Trade Station List/Commodity Detail/Experience Route/Overview/Workspace Navigation Controller、Fleet Hangar/Shop/Crew/Mod/Dispatch Presenter/Session/View Adapter/Controller/Surface Coordinator/Inline Portal/Ship Detail/Command Adapter、Quest Available/Active/Locked/Board/Route/Objective/Detail Controller/Presenter/Session、Research Board/Dispatch/Detail Controller/Presenter、Faction Board/Detail Controller/Presenter、Achievement Board/Detail Controller/Presenter、Archive Exploration Session/Board/Report Detail/Controller、Settings View/Modal/Launcher Controller、Save Workspace Presenter/Controller/Command Adapter/CSS owner、Tutorial Step/Tooltip/Overlay 与 Dialogue Session/Presenter/Modal Controller、Ship Detail/Workspace Object Detail Presenter、typed market/fleet/archive/save/settings command、Context 局部 intent、常规/紧凑视口开合隔离、档案分页 Context 生命周期、资金与贸易站投影、焦点同步、Shell/HUD/FleetUI 命令所有权、自动派遣与日结算提交顺序/经营金融/舰队/科研任务档案动作/剧情与胜利运行时/eager UI 壳/设置/首次进入与释放生命周期/教学引导与 onboarding policy/存档/命令目的地/行动引导执行适配/市场工作区入口/工作区 Tab/局部操作槽/会话生命周期/时钟/Market、Fleet 与 Archive 内部增量失效/typed 日志来源契约/日志 Context/筛选/聚合/UI 所有权等核心系统
- UI 所有权收敛：商业入口/浏览位置、Archive/Fleet Tab 与 Map/Market/Fleet/Archive Context → L4 局部操作槽已有独立 owner；任务候选焦点、可接取/进行中/未解锁生命周期、章节/分诊、路线/目标/详情投影及 DOM/危险确认已分别进入 Session、八组 Presenter 和 Controller，科研总览/队列/补给/详情与 DOM/清空确认、派系总览/详情与 DOM/市场跳转、成就总览/详情与 DOM/检查也已进入各自 Presenter/Controller；探索航点/连续任务焦点、总览/报告详情与 DOM/聚焦滚动已分别进入 `ArchiveExplorationSession`、两组 Presenter 与 `ArchiveExplorationController`，五个 Archive UI 门面只保留兼容组合；设置 launcher、控件/摘要投影、弹层 DOM/确认和 mutation 已分别进入 `SettingsUiController`、`SettingsViewPresenter`、`SettingsModalController` 与 `SettingsCommandController`；存档安全/槽位/确认描述与 DOM/确认/文件迁移已分别进入 `SaveWorkspacePresenter` 和 `SaveWorkspaceController`；教程步骤内容、视口定位和 EventBus/高亮/焦点生命周期已分别进入 `TutorialStepPresenter`、`TutorialTooltipLayout` 与 `TutorialOverlayController`；剧情播放/分支状态、进度/选项语义与 Surface/DOM/焦点已分别进入 `DialogueSession`、`DialoguePresenter` 与 `DialogueModalController`；星图面板投影、Context/Escape、Renderer/EventBus/DOM listener 生命周期、工作区请求/视图切换/旅行分发/引导聚焦已分别进入 `MapPanelViewController`、`MapContextController`、`MapInteractionController` 与 `MapNavigationController`，`MapUI` 收束为 331 行会话/视图/动作端口组合门面；舰队机库选择/Context 与采购 DOM/焦点已分别进入 `FleetHangarController`、`FleetShopController`，内联 Portal、舰船 Context/L4 宿主与 typed command 适配分别进入 `FleetInlinePortalController`、`FleetShipDetailController` 与 `FleetCommandAdapter`，`FleetSurfaceCoordinator` 统一 Surface/确认/Portal 后，`FleetUI` 收束为 237 行组合门面

- 存档移动验收已覆盖 390×844 与 360×640：迁移区单列且只由设置主内容区滚动，页面无横向溢出，按钮/下拉达到 44px；删除与成功导入重绘后分别聚焦同槽位的新保存/读取动作，离屏目标使用 nearest 回显。私有级联已统一迁入 `save-workspace.css`，旧 owner 命中归零，1280×720 与 390×844 迁移前后计算样式/几何指标一致。

- 设置私有级联已统一迁入 `settings-workspace.css`，五个旧 owner 的 257 个有效选择器分支归零；桌面数据页迁移前后几何一致。360×640 摘要改为 2×2，释放约 124px 垂直空间，并保持单一内容滚动、零横向溢出、44px 控件、方向键分页和关闭焦点返回。
- 事件/剧情私有级联已统一迁入 784 行 `flow-surfaces.css`，`modals/responsive/interstellar-trader` 的 165 个原分支归零；1280×720 事件桌面几何保持一致，600px/390×844/360×640 验收确认三项摘要、2×2 影响/分支卡、单一滚动和零横向溢出。剧情 choice mode 不再显示伪隐藏 disabled 动作，剩余 Skip 动作全宽且达到 44px。
- L6 公共壳层已统一迁入 237 行 `blocking-surfaces.css`，5 个旧 owner 的 70 个通用分支归零，7 个退役结构类删除；390×844 与 360×640 验收确认短内容居中、长内容单滚动、派遣动作区常驻、Settings 内部单滚动、零横向溢出与 44px 动作。

- Context Inspector 所有权已拆为 `ContextInspectorSession`（不可变 key/工作区开合/revision，并隔离常规/紧凑视口偏好）、`ContextInspectorPresenter`（壳层/空态）、`ContextInspectorViewAdapter`（DOM/ARIA/工作区宿主/事件/焦点）与 `ContextInspectorController`（latest-state renderer/action/Session/Escape/响应式开合/冻结 diagnostics），Controller 从 426 行降至 307 行，原模块保持 36 行兼容门面；Context/renderer workspace、计数、开合与 ViewAdapter 生命周期已进入 UI application 顶层快照
- UI 刷新所有权已拆为 `GameUiCoordinator`（dirty-region/Feature/diagnostics 组合）、`GameUiWorkspaceRenderer`（四 Feature 区域请求/typed command）与 `GameUiRenderSession`（成功计数/刷新事务），协调器由 680 行降至 377 行
- UI 应用组合边界已拆为 434 行 `GameUiApplicationRuntime`、49 行 `GameUiNavigationPort` 与 36 行 `GameUiApplicationDiagnostics`，惰性 controller 图/生命周期、正式导航协议和含 Context Inspector、Event UI、Navigation、Workspace Surface、共享 L4、Blocking/Escape 状态的顶层只读快照分别只有一个 owner
- Blocking dismiss 所有权已拆为 114 行 `BlockingSurfaceDismissRegistry` 与 385 行 `SurfaceManager`：同一弹层只持有一个物理 backdrop listener，多个 controller 通过独立 token 先到先用并可安全释放；Settings 外壳/Feature、HUD 胜利、Dialogue、交易确认、危险确认、公司命名与随机事件全部接入完成/取消/session/Feature/application release，生产代码已删除永久绑定 API，最后 owner 离开后清理注册项与空闲 dispatcher
- 随机事件 UI 已拆为 108 行 `EventPresenter`、312 行 `EventSurfaceController` 与 66 行 `EventUI`：纯视图投影、Blocking DOM/交互/释放和 pending 会话分别只有一个 owner；DOM 未就绪时不会丢事件，旧弹层迟到提交不会误清后来 pending；1440×900、390×844 与 360×640 真实浏览器验收确认短屏使用单一内部滚动且方向键聚焦项保持可见
- 剧情 L6 已由 109 行 `DialogueSession`、81 行 `DialoguePresenter`、356 行 `DialogueModalController` 与 29 行 `DialogueUI` 分担会话、纯投影、Blocking DOM/交互和兼容组合；360×640 与 390×844 真实浏览器验收确认长文本/四选项只使用单一内容滚动，End 聚焦最后选项会回显，Escape 先隐藏并重置再幂等提交完成回调
- 教程 L7 已由 65 行 `TutorialStepPresenter`、229 行 `TutorialTooltipLayout`、307 行 `TutorialOverlayController` 与 25 行 `TutorialUI` 分担纯投影、visual viewport 布局、交互生命周期和兼容组合；390×420/390×844 真实浏览器确认 fixed 高亮目标保持原位、长 Tooltip 使用不受 transform 影响的真实尺寸且不重叠，多步骤重排后焦点回到容器，Shift+Tab/末动作 Tab 在 L7 内循环

### 当前最主要的缺口

- 探索深化不足：POI、隐藏航线闭环已完成，但遗迹链、异常点、隐藏区域、专属事件分支仍未展开
- 飞船高阶玩法不足：没有战斗、乘客、外观、自定义职业化船型路线
- 剧情表达不足：已有轻量对话层，但章节推进和事件演出仍偏轻
- 数据反馈仍是本地流程：验收指标不会自动上传；玩家可导出脱敏 JSON 审查并自行决定是否分享，未来若新增汇总通道需另行设计授权
- 平台能力未做：背景音乐 / 音频资源包 / 动态音乐、i18n、云存档、多人都还在远期

### 当前研发判断

当前项目最接近：

**可玩的单机经营原型，核心循环和中期系统已稳定，正进入"体验打磨 + 数据验证"阶段。**

---

## 2. 优先级排序

## P0：稳态建设 ✅ 基本完成

目标：让当前版本可持续迭代，不再被文档口径、主控膨胀、破档和隐性回归拖慢。

- ✅ 统一文档口径：README、路线图、实现对照表已与 `js/` 结构对齐
- ✅ 冻结 GameState / SaveEnvelope 契约：当前 `SAVE_SCHEMA_VERSION = 17`、`GAME_VERSION = 0.6.4`，已提交状态字段带默认值和逐版本迁移
- ✅ 建立最小回归集：1588 项测试覆盖 Blocking/Flow Surface CSS owner、存档 Workspace Presenter/Controller/Command Adapter、教程 Step Presenter/Tooltip Layout/Overlay Controller、剧情 Session/Presenter/Modal Controller、经济、贸易、航行、探索、事件与随机事件运行时、统一动作控制器图、成就检查队列、持久化事务、Game Application shell/Runtime Graph/五个职责节点工厂簇/启动投影/Feature/UI/Guidance/Loop Runtime 组合边界、UI Navigation port/Application diagnostics 与 manifest/registry 生命周期、延迟工作区局部失败恢复、Game Shell Projection/Header/Company/Archive Badge Presenter 与信息所有权、Map Galaxy Hub/View State/Survey Detail/Panel Layout/Panel View/Context/Interaction/Navigation Controller、Workspace Surface/Detail 生命周期与 L3 CSS 所有权、Renderer dispose/re-init/开发态 2D 强制降级、Market Chrome/Chart Presenter/View Adapter/Controller/Selection/Spot/Goods/Finance/Commodity/Capital/Operations/Batch Plan/Local Operations/Operations Overview/Trade Station List/Commodity Detail/Experience Route/Overview/Workspace Navigation Controller、Fleet Hangar/Shop/Crew/Mod/Dispatch Presenter/Session/View Adapter/Controller/Surface Coordinator/Inline Portal/Ship Detail/Command Adapter、Quest Available/Active/Locked/Board/Route/Objective/Detail Controller/Presenter/Session、Research Board/Dispatch/Detail Controller/Presenter、Faction Board/Detail Controller/Presenter、Achievement Board/Detail Controller/Presenter、Archive Exploration Session/Board/Report Detail/Controller 与 Settings View/Modal/Launcher Controller、Ship Detail/Workspace Object Detail Presenter、typed market/fleet/archive/save/settings command、Context 局部 intent、视口模式开合隔离、档案分页 Context 生命周期、资金与贸易站投影、焦点同步、Shell/HUD/FleetUI 命令所有权、自动派遣与日结算提交顺序、舰队动作、经营金融/商网联动、科研任务档案动作、剧情与胜利运行时、eager UI 壳/设置/首次进入与释放生命周期、教学引导与 onboarding policy、会话生命周期、命令目的地、行动引导执行适配、市场工作区入口、工作区 Tab、局部操作槽、Market/Fleet/Archive 内部增量失效、typed 日志来源契约、日志 Context/筛选/聚合与 UI 壳层契约
- ✅ 更新探索 / 行动引导口径：POI、隐藏航线、行动条已接入主流程
- ✅ 参数化收束：经济、事件、任务节奏关键常量已收束到配置层
- ✅ GameManager 约束：中期动作通过 CommerceActionController / GuidanceActionController 分发

当前 P0 遗留项：

- 局部动作语义仍需继续细化：Context → L4 的查看详情入口已统一进入 `WorkspaceActionSlot`；买卖、改装、任务接取等领域提交仍由各工作区 typed command 端口持有，不得冒充全局 Action Guide

## P1：体验深挖 🔶 部分完成

目标：让玩家在第一笔贸易和初次探索后，能自然进入科研、派遣、商网和公司成长。

- ✅ 行动引导二阶段：已接入科研补给派遣、普通商运派遣、待处理事件、低燃料补给、维修/资金不足、商网批量经营、资本侧贷款入口
- ✅ 探索档案终端：档案中心新增探索标签与报告复核流程
- ✅ 探索情报联动：勘探报告可影响市场情报区、科研补给路线、派遣评分和商网站点策略
- ✅ 中期专题教学链：4 条链已完成主动启动入口、建议提权、真实业务事件推进、单链并发约束、派遣循环基线与 v17 持久化
- 🔜 探索系统深化：遗迹链、异常点、隐藏区域、专属事件分支
- 🔜 飞船经营增强：功能型改装、专长化船型定位
- 🔜 剧情表达升级：关键章节、探索报告和派系事件接入对话层

完成标志：

- 玩家除了跑商外，开始有"探索 -> 情报 -> 经营决策"的中期目标
- 不同飞船与船员组合出现更明确分工
- 章节推进有更强的叙事感和反馈感
- 中期专题链让玩家从"跟指引做事"升级到"理解为什么这么做"

## P2：中后期经营目标（随后，3-6 周）

目标：解决"系统很多，但后期目标不够强"的问题。

- 商网二阶段：轻物流首批已闭合站点分工、区域收益、勘探策略推荐和下一笔商网动作；后续只在玩家确实需要时再评估仓储、订单簿和更完整网络编排
- 公司成长二阶段：公司等级不只显示数值，要绑定权限、上限和特权
- 任务链扩展：派系线、商网线、探索线形成中长期路线差异
- 胜利条件再平衡：贸易、科技、外交、探索几条路径耗时更接近（已完成量化和软上限，待遥测验证）

完成标志：

- 中后期财富有稳定去处
- 玩家能形成自己的发展流派
- "商业帝国"从数值概念变成实际玩法目标

## P3：平台能力（后置）

目标：在核心单机体验稳定后，再投入高成本基础设施。

- 背景音乐 / 音频资源包 / 动态音乐系统
- i18n / 文本外置 / 语言切换
- 云存档或更大容量存储
- 数据驱动工具链与内容编辑能力
- 可选的数据汇总 / 上报通道（本地指标和脱敏导出已存在；未来若实现上传必须另行加入明确授权）

完成标志：

- 游戏沉浸感和可扩展性显著上升
- 内容新增成本下降

## P4：网络化与社交化（远期）

目标：只有在单机版本稳住后，才考虑服务化和联网。

- 排行榜
- 异步社交或交易
- 多人同步框架
- 公会/聊天/共享市场

完成标志：

- 联网能力不会反过来拖垮单机主线开发

---

## 3. 明确不该现在做的事

- 不优先做多人：投入大、依赖多、对当前主线价值最低
- 不优先做完整 i18n：当前文本还在快速变化，先稳定内容结构
- 不优先做完整音频系统：应该放在主循环和中期体验补齐之后
- 不优先做大规模新系统堆叠：先把已有系统之间的接线、节奏和回归做扎实

---

## 4. 建议执行顺序

1. ~~先完成 P0：文档、契约、回归、遗留收口~~ ✅
2. ~~闭合中期专题教学链：启动入口 → 真实动作事件 → 存档契约 → 集成测试~~ ✅
3. 🔜 补齐 P1 遗留：探索深化 → 飞船增强 → 剧情升级
4. 然后做 P2：公司/商网/任务线的中后期目标体系
5. 最后视资源推进 P3/P4：完整音频平台、i18n、云存档、多人

---

## 5. 一句话路线判断

这款游戏接下来最值钱的路线，不是"再补一个大系统"，而是：

**让玩家从"跟着指引做单笔交易"成长到"理解科研、派遣、建站之间的因果关系"，再用真实玩家数据验证设计假设，最后补齐音频、国际化和联网。**
