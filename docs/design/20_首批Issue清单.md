# 星际贸易商 - 首批 Issue 清单

> 目的：将当前最值得立项的 10 个任务整理成可直接复制到 GitHub 的 Issue 文案。
> 来源：基于 [docs/design/18_实现线路图.md](docs/design/18_实现线路图.md) 与 [docs/design/19_开发任务拆分表.md](docs/design/19_开发任务拆分表.md)。

---

## Issue 01：冻结 GameState 与 SaveEnvelope 契约

### 标题

冻结 GameState 与 SaveEnvelope 契约，明确 schemaVersion 迁移规则

### 背景

当前项目已经进入持续迭代阶段，状态字段分散在多个系统中。如果不尽快冻结 GameState 与 SaveEnvelope 契约，后续新增功能很容易导致旧存档损坏、测试状态构造失真、系统边界继续模糊。

### 目标

- 明确当前核心状态字段清单
- 明确默认值来源
- 明确 SaveEnvelope 固定结构
- 明确 schemaVersion 递增和迁移规则

### 范围

- 梳理运行时核心状态字段
- 梳理存档导出结构
- 补充或统一迁移入口
- 同步测试辅助状态构造

### 涉及文件

- [js/core/GameManager.js](js/core/GameManager.js)
- [js/systems/save/SaveSystem.js](js/systems/save/SaveSystem.js)
- [tests/helpers.js](tests/helpers.js)
- [docs/design/实现方案.md](docs/design/实现方案.md)

### 非目标

- 不在本 issue 中迁移到 IndexedDB
- 不在本 issue 中重构全部系统层 API

### 验收标准

- 新旧存档结构边界清晰
- `schemaVersion` 的变更规则可文档化说明
- `tests/helpers.js` 构造出的状态与运行时结构一致
- 加载旧存档时不会因缺失字段直接崩溃

---

## Issue 02：补齐存档异常处理与迁移测试

### 标题

补齐存档异常处理、导入导出校验与迁移测试

### 背景

当前存档功能可用，但异常场景保护还不够系统，特别是坏档、非法导入、字段缺失和未来迁移风险。

### 目标

- 增强坏档处理能力
- 增强导入数据校验
- 为迁移行为建立测试基线

### 范围

- 空存档与损坏存档兜底
- 导入 JSON 结构校验
- 版本不兼容提示
- 迁移测试补齐

### 涉及文件

- [js/systems/save/SaveSystem.js](js/systems/save/SaveSystem.js)
- [js/ui/SaveUI.js](js/ui/SaveUI.js)
- [tests/save.test.js](tests/save.test.js)
- [tests/integration.test.js](tests/integration.test.js)

### 非目标

- 不在本 issue 中替换存储介质

### 验收标准

- 非法导入数据会被拒绝并给出明确提示
- 损坏存档不会静默失败
- 保存、读取、导入、导出、迁移都有自动化测试覆盖

---

## Issue 03：统一经济参数到 constants

### 标题

统一经济与市场关键参数到 constants，降低平衡调整成本

### 背景

经济系统已具备较高复杂度，但如果关键参数仍分散在实现细节中，后续平衡会越来越难做，也难以快速验证改动效果。

### 目标

- 将关键经济参数集中管理
- 降低数值调优的修改面
- 为平衡调试打基础

### 范围

- 供需恢复速度
- 峰值事件概率
- 市场深度影响
- 价格修正关键系数
- 科技与派系乘区顺序说明

### 涉及文件

- [js/data/constants.js](js/data/constants.js)
- [js/systems/economy/Economy.js](js/systems/economy/Economy.js)
- [js/systems/faction/FactionSystem.js](js/systems/faction/FactionSystem.js)
- [js/systems/research/ResearchSystem.js](js/systems/research/ResearchSystem.js)

### 非目标

- 不在本 issue 中重做经济模型

### 验收标准

- 调整经济节奏时主要修改点集中在配置层
- 价格计算顺序可解释且一致
- 测试能覆盖一部分关键价格计算路径

---

## Issue 04：为事件系统补冷却/分层回归测试

### 标题

为随机事件系统补充冷却、分层与联动回归测试

### 背景

随机事件已经承担越来越多的节奏调控职责，但事件系统也是回归高发区域。如果不建立基线，后续改动容易破坏冷却、链式触发和新手保护逻辑。

### 目标

- 验证事件冷却机制
- 验证阶段分层逻辑
- 验证事件与任务/状态联动

### 范围

- 同一事件的冷却限制
- early/mid/late 事件分层
- 低燃料/低资金保护阈值
- 事件选择后的状态变化

### 涉及文件

- [js/systems/event/RandomEvent.js](js/systems/event/RandomEvent.js)
- [js/data/events.js](js/data/events.js)
- [tests/randomEvent.test.js](tests/randomEvent.test.js)
- [tests/integration.test.js](tests/integration.test.js)

### 非目标

- 不在本 issue 中扩充事件内容池

### 验收标准

- 关键事件机制有自动化测试覆盖
- 修改事件权重或条件后能快速发现回退

---

## Issue 05：为商品增加合法性与品质字段

### 标题

扩展商品数据结构：增加合法性、品质与保质期字段

### 背景

当前商品系统仍偏基础版，商品差异主要靠价格和产地，尚未进入设计文档中的“高阶贸易决策”层。

### 目标

- 为商品引入更强的差异化属性
- 为黑市、走私、易腐品、高品质商品做准备

### 范围

- 合法性字段
- 品质字段或品质规则
- 保质期字段
- 预留扩展字段，避免后续再次破坏数据结构

### 涉及文件

- [js/data/goods.js](js/data/goods.js)
- [js/systems/economy/Economy.js](js/systems/economy/Economy.js)
- [js/ui/MarketUI.js](js/ui/MarketUI.js)
- [js/ui/ShipUI.js](js/ui/ShipUI.js)

### 非目标

- 不在本 issue 中一次性实现完整品质掉落系统
- 不在本 issue 中完成所有组合效果设计

### 验收标准

- 商品数据结构不再只有基础价格和描述
- UI 能展示核心新属性
- 后续黑市和易腐品玩法可以直接复用这套结构

---

## Issue 06：实现黑市 MVP 与派系解锁联动

### 标题

实现黑市 MVP，并与辛迪加派系友好度解锁联动

### 背景

设计文档和派系文案都已经提到黑市，但当前仓库仍未真正落地。黑市是最适合补上的第一条“高风险高回报”支线。

### 目标

- 把黑市从文案奖励变成真实玩法
- 用最小成本补出一条明显不同的贸易路线

### 范围

- 黑市访问条件
- 黑市价格与公开市场差异
- 黑市专属商品或商品加成
- 黑市 UI 入口

### 涉及文件

- [js/data/factions.js](js/data/factions.js)
- [js/systems/faction/FactionSystem.js](js/systems/faction/FactionSystem.js)
- [js/systems/economy/Economy.js](js/systems/economy/Economy.js)
- [js/ui/MarketUI.js](js/ui/MarketUI.js)
- [index.html](index.html)

### 非目标

- 不在本 issue 中实现拍卖行
- 不在本 issue 中实现期货市场

### 验收标准

- 满足派系条件后可以进入黑市
- 黑市价格与公开市场有明显差异
- 黑市玩法能形成独立利润路径

---

## Issue 07：自动贸易支持价格阈值和最低利润率

### 标题

增强自动贸易：支持价格阈值、最低利润率与基础风险策略

### 背景

当前自动贸易更接近固定路线循环，离“策略化自动经营”还有距离。这个增强能明显提升中期可玩性。

### 目标

- 让自动贸易从固定脚本升级为条件驱动
- 降低自动派遣的低收益和无意义循环

### 范围

- 买入阈值
- 卖出阈值
- 最低利润率
- 简单风险回避逻辑

### 涉及文件

- [js/systems/trade/AutoTradeSystem.js](js/systems/trade/AutoTradeSystem.js)
- [js/systems/fleet/FleetSystem.js](js/systems/fleet/FleetSystem.js)
- [js/ui/FleetUI.js](js/ui/FleetUI.js)

### 非目标

- 不在本 issue 中实现完整 AI 交易代理

### 验收标准

- 玩家可为自动贸易设置条件
- 自动派遣能明显减少低效交易
- UI 能看出当前生效的自动规则

---

## Issue 08：设计并接入船员系统 MVP

### 标题

设计并接入船员系统 MVP，补齐舰队经营层

### 背景

当前舰队系统已经具备多船和改装，但还没有真正的“经营层”。船员系统是从运输工具走向经营模拟的关键一步。

### 目标

- 为每艘船引入基础船员配置
- 用最小版本接入交易、维修、燃料效率等加成

### 范围

- 船员模板
- 基础角色分类
- 招募与分配
- 工资或维护成本
- 船员基础 UI

### 涉及文件

- 新增 [js/data/crew.js](js/data/crew.js)
- 新增 [js/systems/fleet/CrewSystem.js](js/systems/fleet/CrewSystem.js) 或扩展 [js/systems/fleet/FleetSystem.js](js/systems/fleet/FleetSystem.js)
- 新增 [js/ui/CrewUI.js](js/ui/CrewUI.js) 或扩展 [js/ui/FleetUI.js](js/ui/FleetUI.js)
- [tests/fleet.test.js](tests/fleet.test.js)

### 非目标

- 不在本 issue 中做复杂忠诚度事件树
- 不在本 issue 中做完整船员成长线

### 验收标准

- 每艘船可以拥有船员
- 船员能提供至少一种可见经营加成
- 玩家能查看并调整船员配置

---

## Issue 09：设计并接入贸易站系统 MVP

### 标题

设计并接入贸易站系统 MVP，建立中后期长期目标

### 背景

当前项目已经具备赚钱能力，但后期缺少稳定的“长期投入点”。贸易站系统可以承接帝国建设和资金消耗。

### 目标

- 引入贸易站建造与升级
- 为后期玩家提供被动收益与区域经营目标

### 范围

- 贸易站数据结构
- 建造条件
- 升级规则
- 基础收益或区域加成
- 贸易站管理界面

### 涉及文件

- 新增 [js/data/tradeStations.js](js/data/tradeStations.js)
- 新增 [js/systems/trade/TradeStationSystem.js](js/systems/trade/TradeStationSystem.js)
- 新增 [js/ui/TradeStationUI.js](js/ui/TradeStationUI.js)
- [js/systems/progression/ProgressionSystem.js](js/systems/progression/ProgressionSystem.js)
- [js/data/quests.js](js/data/quests.js)

### 非目标

- 不在本 issue 中实现完整产业链投资系统

### 验收标准

- 玩家可在特定星球建造贸易站
- 贸易站能带来收益或长期加成
- 贸易站成为后期主要资金去向之一

---

## Issue 10：新增 AudioManager 和设置项占位

### 标题

新增 AudioManager 基础模块，并在设置中预留音频控制项

### 背景

音频系统当前完全缺失，但它会影响后续大量 UI 和反馈实现。先把音频管理骨架搭起来，能显著降低后续接入成本。

### 目标

- 建立统一音频入口
- 在设置面板中预留音频控制项
- 为后续 UI/交易/事件音效接入做准备

### 范围

- 新增音频管理模块
- 预留音乐/音效开关
- 预留主音量或分组音量配置
- 保证无资源时也能安全降级

### 涉及文件

- 新增 [js/core/AudioManager.js](js/core/AudioManager.js)
- [js/core/SettingsManager.js](js/core/SettingsManager.js)
- [index.html](index.html)
- 视情况调整相关 UI 模块的事件触发点

### 非目标

- 不在本 issue 中制作完整 BGM 和音效资源包

### 验收标准

- 项目中存在统一的音频管理入口
- 设置面板已能容纳音频项
- 后续音效接入不需要再重构设置系统

---

## 建议标签

- `priority:P0`
- `priority:P1`
- `system:save`
- `system:economy`
- `system:event`
- `system:trade`
- `system:fleet`
- `system:ui`
- `system:audio`
- `design-sync`
- `tech-debt`
- `feature`
- `testing`

---

## 建议里程碑归类

### v0.5 稳定版

- Issue 01
- Issue 02
- Issue 03
- Issue 04

### v0.6 贸易深度版

- Issue 05
- Issue 06
- Issue 07

### v0.7 舰队经营版

- Issue 08
- Issue 09
- Issue 10