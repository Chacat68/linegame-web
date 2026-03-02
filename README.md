# 星际贸易商（Interstellar Trader）

> 一款运行在浏览器中的 2D 星际经营类游戏

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

### 已实现（可运行原型）

- ✅ WebGL 星空背景 + Canvas 2D 星图渲染
- ✅ 核心贸易循环（买入 → 航行 → 卖出）
- ✅ 市场价格随机波动与峰值事件
- ✅ 基础商品数据（8 种商品、10 个星系）
- ✅ 飞船升级（货舱 / 燃料 / 引擎，6 个升级节点）
- ✅ 胜利判定（净资产 ≥ 50,000 积分）
- ✅ 游戏日志（最近 10 条消息）
- ✅ 存档系统（多槽位）
- ✅ 随机事件系统
- ✅ 任务与剧情系统
- ✅ 成就系统
- ✅ 派系与声望系统
- ✅ 玩家等级 / 贸易等级
- ✅ 新手引导
- ✅ 科技研究系统
- ✅ 舰队管理系统
- ✅ 胜利条件系统

---

## 快速开始

本项目为纯前端应用，无需任何构建工具，直接用浏览器打开即可。

```bash
# 克隆仓库
git clone https://github.com/Chacat68/linegame-web.git
cd linegame-web

# 用任意本地静态服务器运行（推荐，避免 ES Module 跨域限制）
npx serve .
# 或
python3 -m http.server 8080
```

然后在浏览器中访问 `http://localhost:8080`。

> 也可以直接双击 `index.html` 打开，但 ES Module 在部分浏览器中需要通过 HTTP(S) 协议访问。

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

---

## 项目结构

```
/
├── index.html              # 主入口
├── css/
│   └── style.css           # 全局样式
├── js/
│   ├── main.js             # 应用入口：初始化与模块编排
│   ├── core/
│   │   ├── EventBus.js     # 全局事件总线（pub/sub）
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
│       ├── Renderer.js     # 星图渲染
│       ├── HUD.js          # 顶部状态栏
│       ├── MarketUI.js     # 市场界面
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
- **渲染**：WebGL（星空背景） + Canvas 2D（星图与 UI）
- **语言**：Vanilla JavaScript + ES Modules（无构建工具）
- **存档**：IndexedDB 多槽位本地存储
- **架构模式**：MVC + 事件总线（EventBus）解耦通信

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
- [代码实现方案](docs/design/实现方案.md)

---

## 许可证

本项目仅供个人学习与研究使用。
