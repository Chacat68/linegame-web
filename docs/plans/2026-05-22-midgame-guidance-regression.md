# 中期行动引导回归计划

> 日期：2026-05-22  
> 目标：验证行动条从新手链扩展到中期链后不会重复、抢占或卡住玩家。  
> 架构：保持 `GuidanceSystem` 为纯规则层，`GuidanceActionController` 只负责执行分发。  
> 技术栈：Vanilla JS、Vitest。

---

## 1. 当前基线

- 行动条已覆盖贸易、探索、科研补给、派遣、商网、金融风险、阻塞解除。
- 已有目标达成过滤，避免“查看行情”类建议在目标 workspace 已打开时反复出现。
- 风险点是建议数量变多后优先级互相抢占。

## 2. 回归矩阵

- 阻塞优先：
  - 待处理事件优先于旅行。
  - 低燃料优先于探索和派遣。
  - 维修压力优先于中期成长。
- 闭环优先：
  - 货舱有货时优先卖出或定位卖货点。
  - 当前任务未推进时优先任务目标。
- 中期成长：
  - 科研补给、普通派遣、商网投入、金融风险按优先级输出。
- 目标达成过滤：
  - 市场、资本、经营、派遣目标已经打开时不重复推荐同一导航动作。

## 3. 实施步骤

1. 在 `tests/guidanceSystem.test.js` 增加矩阵化用例。
2. 在 `tests/guidanceActionController.test.js` 增加执行反馈回归。
3. 在 `tests/marketUiFocus.test.js` 保留市场 workspace 焦点回归。
4. 修正发现的优先级冲突，但不新增新系统。
5. 将关键优先级规则同步到 `docs/plans/2026-05-13-action-guidance-first-30m-design.md`。

## 4. 测试计划

- 直接运行：

```bash
npx vitest run tests/guidanceSystem.test.js tests/guidanceActionController.test.js tests/marketUiFocus.test.js
```

- 完成后运行：

```bash
npm test
```

## 5. 验收

- “查看行情之后没法继续”类循环有明确回归测试。
- 行动条在阻塞态只推荐解除阻塞。
- 金融 / 商网 / 派遣建议不会抢走未完成的基础贸易闭环。

