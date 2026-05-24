# Action Controller 边界二阶段计划

> 日期：2026-05-22  
> 目标：在 `GuidanceActionController` 之后继续收窄 `GameManager` 的动作分发体积。  
> 架构：只做行为等价搬迁，先提取探索和商业动作控制器，不同时改业务规则。  
> 技术栈：Vanilla JS ES Modules、Vitest。

---

## 1. 当前基线

- `GuidanceActionController` 已处理行动条 actionType 分发。
- `GameManager` 仍承载大量探索、商业、市场、舰队动作细节。
- 后续中期建议会继续增加 actionType，需要先控制边界。

## 2. 提取范围

- `ExplorationActionController`
  - 扫描。
  - 首次着陆。
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

1. 在 `js/core/` 下新增两个 controller 文件。
2. 复制现有 `GuidanceActionController` 的依赖注入风格：controller 不直接 import UI 单例。
3. 从 `GameManager` 移动一组动作到 controller，保持原回调名称和反馈文案不变。
4. 每移动一组动作，跑对应测试。
5. 最后运行完整测试，并确认 `GameManager` 仍是唯一总编排入口。

## 4. 测试计划

- `tests/guidanceActionController.test.js`
  - 保持行动条动作执行回归。
- 新增 `tests/explorationActionController.test.js`
  - 扫描、着陆、POI 动作调用正确依赖。
- 新增 `tests/commerceActionController.test.js`
  - 市场焦点、商网动作、资本入口调用正确依赖。
- `tests/integration.test.js`
  - 主流程不因 controller 搬迁改变状态。

## 5. 验收

- `GameManager` 中 actionType 分发代码明显减少。
- 新 controller 不读 DOM、不直接改 UI，只通过注入回调工作。
- 行为和反馈文案保持兼容。
- `npm test` 通过。

