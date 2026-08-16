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

> 状态核对日期：2026-08-17。当前游戏版本 `0.6.4`，存档 schema `v17`。

### 当前版本已接入主流程的能力

- ✅ Three.js 3D 星图、跨星系视图与飞船飞行动画；WebGL2 不可用时降级为 Canvas 2D
- ✅ 核心贸易循环（买入 → 航行 → 卖出 → 结算）
- ✅ 探索 MVP：POI 调查、秘密航线解锁
- ✅ 动态经济：供需、价格历史、经济周期、市场深度、峰值事件
- ✅ 黑市与走私：黑市定价、权限判定、走私检查、查获罚款统计
- ✅ 统一商业终端：`MarketUI.js` 编排现货、资金与贸易站工作区；Chart / Spot / Goods / Capital / Operations Presenter 分别拥有各自投影，领域动作统一发布为 typed market command
- ✅ 金融系统：贷款、保险、股票、期货、贸易站投资
- ✅ 贸易站经营：建站、升级、经理、策略、被动收益
- ✅ 舰队与船员：多船、改装、船员招募、派遣航线
- ✅ 派系、科技、任务、成就、胜利条件、教程
- ✅ 本地存档：4 槽位、导入导出、版本迁移、自动存档
- ✅ 中期专题教学：科研经济、自动跑商、贸易站经营、资金管理 4 条可主动启动的专题链，由真实经营结果推进并随存档保存
- ✅ 本地平衡统计导出：指标只随存档留在本设备，不自动上传；导出 JSON 可先审查再自行决定是否分享
- ✅ 基础音效 MVP：UI 点击、交易成交、航行与事件提示音，含开关和音量设置
- ✅ Vitest 测试基线：131 个测试文件、1153 项测试，覆盖经济、贸易、航行、探索、事件与随机事件运行时、统一动作控制器图、成就检查队列、持久化事务、Game Feature Runtime/manifest/registry 生命周期、Game Guidance Runtime 组合边界、Market Chart/Spot/Goods/Capital/Operations 与 Fleet Hangar/Crew/Mod Presenter 图表、typed market/fleet command、资金与贸易站投影、焦点同步、HUD/FleetUI 命令所有权、自动派遣与日结算提交顺序、经营金融、舰队、科研任务档案动作、剧情与胜利运行时、eager UI 壳/设置/首次进入生命周期、教学引导与 onboarding policy、存档、会话生命周期、时钟、命令目的地、行动引导执行适配、市场工作区、增量 UI 失效、日志上下文与 UI 所有权等核心系统

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
│   │   ├── MarketCommand.js # 市场 UI / controller typed command 契约
│   │   ├── FleetCommand.js # 舰队 UI / controller typed command 契约
│   │   ├── MarketWorkspaceController.js # 市场命令与工作区生命周期
│   │   └── GameManager.js  # 主状态机与主循环调度
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
│       ├── HUD.js          # 顶部状态栏
│       ├── MarketUI.js     # 商业终端（现货/资本/经营）
│       ├── MarketChartPresenter.js # 行情快照、K 线与图表交互
│       ├── MarketSpotPresenter.js # 现货、行情与黑市投影
│       ├── MarketGoodsPresenter.js # 商品模型、卡片 HTML 与 command 协议
│       ├── MarketCapitalPresenter.js # 资金结构与经营贷款投影
│       ├── MarketOperationsPresenter.js # 贸易站经营与批量计划投影
│       ├── FleetHangarPresenter.js # 机库主视图模型、HTML 与 UI intent
│       ├── FleetCrewPresenter.js # 船员详情模型、HTML 与 roster intent
│       ├── FleetModPresenter.js # 改装/保养详情模型、HTML 与 UI intent
│       ├── MapUI.js        # 星图交互
│       ├── ShipUI.js       # 飞船与货舱界面
│       ├── Modal.js        # 通用模态框
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
