# Action Controller 边界二阶段计划

> 日期：2026-05-22  
> 目标：在 `GuidanceActionController` 之后继续收窄 `GameManager` 的动作分发体积。  
> 架构：只做行为等价搬迁，先提取探索和商业动作控制器，不同时改业务规则。  
> 技术栈：Vanilla JS ES Modules、Vitest。

> 2026-05-26 状态：`ExplorationActionController` 与 `CommerceActionController` 已完成首批提取并接入 `GuidanceActionController`；对应测试已覆盖 POI、市场焦点和商业终端入口。

---

## 1. 当前基线

- `GuidanceActionController` 已处理行动条 actionType 分发。
- 探索动作和商业终端导航已从 `GameManager` 分离到专用 controller。
- `GameManager` 仍是唯一总编排入口，但不再直接承载探索和市场导航的行动条分发细节。
- 后续新增 actionType 应继续先进入 controller，而不是回填到 `GameManager`。

## 2. 提取范围

- `ExplorationActionController`
  - POI 调查。
  - 探索相关反馈和 UI 刷新回调。
- `CommerceActionController`
  - 打开市场 workspace / subworkspace。
  - 商网建站、升级、派经理、切策略。
  - 资本页贷款、股票、期货入口跳转。
- 不提取：
  - 存档。
  - 教程主流程。
  - 随机事件 modal。
  - 底层系统规则。

## 3. 实施步骤

1. 已在 `js/core/` 下新增两个 controller 文件。
2. 已复制现有 `GuidanceActionController` 的依赖注入风格：controller 不直接 import UI 单例。
3. 已从 `GameManager` 移动探索和商业导航动作到 controller，保持原回调名称和反馈文案兼容。
4. 已为移动的动作补对应测试。
5. 完整测试通过后，继续确认 `GameManager` 仍是唯一总编排入口。

## 4. 测试计划

- `tests/guidanceActionController.test.js`
  - 保持行动条动作执行回归。
- 新增 `tests/explorationActionController.test.js`
  - POI 动作调用正确依赖。
- 新增 `tests/commerceActionController.test.js`
  - 市场焦点、商网动作、资本入口调用正确依赖。
- `tests/integration.test.js`
  - 主流程不因 controller 搬迁改变状态。

## 5. 验收

- `GameManager` 中 actionType 分发代码明显减少。
- 新 controller 不读 DOM、不直接改 UI，只通过注入回调工作。
- 行为和反馈文案保持兼容。
- `npm test` 通过。
- 后续动作继续按 controller 边界接入，避免重新扩大 `GameManager`。
