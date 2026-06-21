# P0 Stability Issues

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前单机经营版的 P0 稳态建设拆成可直接立项的 issue，优先解决文档口径、存档契约、最小回归集、遗留边角和参数收束。

**Architecture:** 这一轮不新增大玩法，重点是把现有系统之间的边界和回归基线先稳住。Issue 的顺序按依赖关系排列：先统一契约和文档，再补测试，再收遗留和参数层，避免后续 P1 扩展继续放大技术债。

**Tech Stack:** Vanilla JS, ES Modules, Vitest, localStorage save system, Babylon.js 3D map

---

## 建议立项顺序

1. Issue 01 和 Issue 02 先做：先把口径和存档契约稳定下来。
2. Issue 03 到 Issue 05 随后跟进：建立最小回归集。
3. Issue 06 和 Issue 07 最后收口：清理遗留边角并完成参数收束。

---

## Issue 01：统一当前文档口径

### 标题

统一 README / 路线图 / 设计对照表口径，清除过期实现描述

### 背景

当前仓库的实际实现已经明显超过历史 MVP 阶段，但部分文档仍残留旧路径、旧渲染器、旧功能状态描述。继续带着这些过期文档推进，会直接增加沟通成本，也会误导后续 issue 拆分和测试范围判断。

### 目标

- 让对外和对内文档都以当前 `js/` 实现为准
- 清除已经失效的技术路径描述
- 让“已实现 / 部分实现 / 未实现”有统一口径

### 范围

- 更新项目入口、渲染器、存档介质、贸易站 UI 等关键描述
- 明确当前主渲染器、商业终端、存档方案、未实现平台能力
- 给路线图补充与 issue 清单的映射关系

### 涉及文件

- [README.md](README.md)
- [docs/design/MVP路线图.md](docs/design/MVP路线图.md)
- [docs/design/设计实现对照表.md](docs/design/设计实现对照表.md)
- [docs/design/实现方案.md](docs/design/实现方案.md)

### 非目标

- 不在本 issue 中修改运行时代码
- 不在本 issue 中补新玩法

### 验收标准

- 不再出现 `Renderer.js`、`Phaser 3 主渲染`、`TradeStationUI 独立可用`、`IndexedDB 已落地` 之类过期表述
- 文档中对 P0 / P1 / P2 的判断与当前代码一致
- 新人仅阅读文档就能正确理解当前版本边界

### 建议标签

- `documentation`
- `p0`

---

## Issue 02：冻结 GameState 与 SaveEnvelope 契约

### 标题

冻结 GameState / SaveEnvelope 契约并明确 schema 迁移规则

### 背景

当前项目已经有较多系统直接依赖顶层状态结构，存档版本也已经走到 `SAVE_SCHEMA_VERSION = 13`。如果继续在没有明确契约的前提下扩展状态字段，后续 P1 开发很容易破档，测试辅助状态也会越来越失真。

### 目标

- 明确当前持久化状态字段的唯一来源
- 明确运行时字段和入档字段边界
- 明确新增字段、删除字段、迁移旧档的规则

### 范围

- 以 `js/data/constants.js` 为唯一状态契约来源做补充说明
- 补齐 `SaveSystem` 中迁移规则的约定文档
- 对测试辅助状态构造方式做统一说明

### 涉及文件

- [js/data/constants.js](js/data/constants.js)
- [js/systems/save/SaveSystem.js](js/systems/save/SaveSystem.js)
- [tests/helpers.js](tests/helpers.js)
- [docs/design/实现方案.md](docs/design/实现方案.md)

### 非目标

- 不在本 issue 中迁移到 IndexedDB
- 不在本 issue 中重构全部系统状态访问方式

### 验收标准

- 新增状态字段时有清晰操作规范
- 顶层持久化字段、运行时字段、自动派生字段边界明确
- `tests/helpers.js` 生成的状态结构与运行时代码保持一致
- 旧档迁移链路可以被文字说明和测试双重验证

### 建议标签

- `architecture`
- `save-system`
- `p0`

---

## Issue 03：补齐存档回归集

### 标题

补齐 SaveSystem 的坏档、导入导出和迁移回归测试

### 背景

存档现在已经是核心系统，且带有多版本迁移逻辑。当前功能可用，但异常路径和迁移回归如果没有测试兜底，后面任何状态字段改动都可能影响已有档案。

### 目标

- 为坏档、缺字段、非法导入、旧版本迁移建立稳定回归集
- 把“能存能读”升级为“异常也有明确定义”

### 范围

- 空槽位 / 损坏槽位 / 非法 JSON / 不支持版本的处理
- 导入导出完整性校验
- 迁移过程中的默认值补齐校验

### 涉及文件

- [js/systems/save/SaveSystem.js](js/systems/save/SaveSystem.js)
- [js/ui/SaveUI.js](js/ui/SaveUI.js)
- [tests/save.test.js](tests/save.test.js)
- [tests/integration.test.js](tests/integration.test.js)

### 非目标

- 不更换存储介质
- 不做云存档

### 验收标准

- 存档异常路径有明确、可断言的行为
- 导入非法数据不会破坏已有槽位
- 迁移逻辑出现回退时，测试能够直接报错

### 建议标签

- `test`
- `save-system`
- `p0`

---

## Issue 04：建立经济最小回归集

### 标题

建立经济与交易系统的最小回归集

### 背景

经济系统现在已经叠加了供需、价格历史、经济周期、派系税率、科技修正、黑市价格等多层逻辑。这个系统最容易在“改一个参数，坏一片行为”时悄悄回退。

### 目标

- 固定关键价格计算路径的测试基线
- 固定旅行推进日结后的经济副作用

### 范围

- 买入价 / 卖出价 / 黑市价的关键断言
- 经济周期切换对价格的影响
- 旅行后 `Economy.advanceDay()` 的副作用验证
- 派系税率、科技折扣、舰队加成叠加顺序的关键断言

### 涉及文件

- [js/systems/economy/Economy.js](js/systems/economy/Economy.js)
- [js/systems/trade/TradeSystem.js](js/systems/trade/TradeSystem.js)
- [tests/economy.test.js](tests/economy.test.js)
- [tests/trade.test.js](tests/trade.test.js)

### 非目标

- 不在本 issue 中重写经济模型
- 不做数值平衡结论，只做回归基线

### 验收标准

- 核心价格链路有稳定断言
- 改动经济参数时能快速识别行为变化
- 黑市与公开市场不会被误测混淆

### 建议标签

- `test`
- `economy`
- `p0`

---

## Issue 05：建立派遣 / 商网 / 金融联动回归集

### 标题

建立派遣、贸易站与金融日结联动的最小回归集

### 背景

当前旅行推进已经串起了 `TradeStation.advanceDay()`、`Finance.advanceDay()`、`Futures.advanceDay()`、`Fleet.tickFleetRoutes()` 等多条日结链路。这是典型的高耦合区域，出问题时往往不是单点 bug，而是多系统联动失真。

### 目标

- 固定旅行后的日结行为
- 为派遣、站点收益、贷款扣款、分红、期货结算建立联合测试基线

### 范围

- 贸易站日收益到账
- 贷款自动扣款 / 展期 / 信用评级变化
- 股票分红 / 站点投资分红
- 期货到期结算
- 舰队派遣贸易 tick 结果

### 涉及文件

- [js/systems/trade/TradeStationSystem.js](js/systems/trade/TradeStationSystem.js)
- [js/systems/finance/FinanceSystem.js](js/systems/finance/FinanceSystem.js)
- [js/systems/finance/FuturesSystem.js](js/systems/finance/FuturesSystem.js)
- [js/systems/fleet/FleetSystem.js](js/systems/fleet/FleetSystem.js)
- [tests/finance.test.js](tests/finance.test.js)
- [tests/futures.test.js](tests/futures.test.js)
- [tests/fleet.test.js](tests/fleet.test.js)
- [tests/tradeStation.test.js](tests/tradeStation.test.js)

### 非目标

- 不在本 issue 中扩展新金融产品
- 不重构派遣 UI

### 验收标准

- 旅行推进后的关键日结副作用都有测试兜底
- 商网、金融、派遣三块不会因为单点改动互相带坏

### 建议标签

- `test`
- `finance`
- `fleet`
- `p0`

---

## Issue 06：收口遗留边角模块

### 标题

收口遗留边角：处理 TradeStationUI 占位和 CommerceFacade 未完成汇总接口

### 背景

当前版本已经把贸易站经营整合进 `MarketUI.js`，但仓库里仍保留 `TradeStationUI.js` 占位文件，同时 `CommerceFacade.getCommerceSnapshot()` 也有未闭合的汇总接口预期。这类边角不会马上炸，但会持续误导后续开发和文档判断。

### 目标

- 明确独立 TradeStationUI 的去留
- 收敛 `CommerceFacade` 的未完成接口
- 降低历史重构残留造成的误解

### 范围

- 删除未使用 import，或把占位模块改成显式兼容层并写清说明
- 决定 `getCommerceSnapshot()` 是补齐还是去除未实现分支
- 清理相关文档与注释口径

### 涉及文件

- [js/ui/TradeStationUI.js](js/ui/TradeStationUI.js)
- [js/core/GameManager.js](js/core/GameManager.js)
- [js/systems/commerce/CommerceFacade.js](js/systems/commerce/CommerceFacade.js)
- [docs/design/设计实现对照表.md](docs/design/设计实现对照表.md)

### 非目标

- 不新做独立贸易站页面
- 不在本 issue 中扩展商网玩法

### 验收标准

- 后续开发者不会再误判 `TradeStationUI.js` 是可用独立模块
- `CommerceFacade` 内不再保留明显未闭合的汇总依赖
- 代码与文档对这两个点的描述一致

### 建议标签

- `refactor`
- `cleanup`
- `p0`

---

## Issue 07：收束关键参数到配置层

### 标题

把经济 / 事件 / 进度关键参数继续收束到配置层

### 背景

当前仓库已经有 `ECONOMY_CONFIG`、`FACTION_CONFIG`、`PROGRESSION_CONFIG` 等集中配置，但仍然存在部分规则散落在系统实现中的情况。P1 开始前，最好先把“会频繁调”的参数收拢，否则后面每轮平衡都会变成代码考古。

### 目标

- 把关键的、会被反复调的参数从逻辑代码里进一步拉回配置层
- 给后续平衡调优建立单一修改面

### 范围

- 经济周期、供需恢复、市场深度影响、事件阈值、引导节奏相关参数盘点
- 把仍散落在系统实现中的硬编码阈值收束到 `constants.js` 或对应配置对象
- 对乘区顺序、阈值意义补简短注释

### 涉及文件

- [js/data/constants.js](js/data/constants.js)
- [js/systems/economy/Economy.js](js/systems/economy/Economy.js)
- [js/systems/event/RandomEvent.js](js/systems/event/RandomEvent.js)
- [js/systems/progression/ProgressionSystem.js](js/systems/progression/ProgressionSystem.js)
- [js/systems/tutorial/TutorialSystem.js](js/systems/tutorial/TutorialSystem.js)

### 非目标

- 不在本 issue 中直接重做平衡数值
- 不在本 issue 中补新玩法参数面板

### 验收标准

- 高频调参点有集中入口
- 关键阈值不再深埋在多个系统函数中
- P1 做探索或飞船增强时，不需要再次大面积翻旧代码找参数

### 建议标签

- `architecture`
- `balance`
- `p0`

---

## 关闭 P0 的判定条件

当以下条件同时满足，可以认为当前 P0 基本完成：

1. 文档、代码、存档契约三者口径一致。
2. 存档、经济、派遣/商网/金融联动都具备最小回归集。
3. 明显的历史遗留占位与未闭合接口已经收口。
4. 后续 P1 开发不再需要一边补功能一边返工基础设施。
