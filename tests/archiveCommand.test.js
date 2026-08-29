import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ARCHIVE_COMMAND,
  createArchiveCommand,
  normalizeArchiveCommand,
} from '../js/core/ArchiveCommand.js';
import { createArchiveActionPorts } from '../js/ui/ArchiveCommandAdapter.js';

describe('ArchiveCommand', function () {
  it('规范化科研与任务标识 command', function () {
    expect(createArchiveCommand(ARCHIVE_COMMAND.START_RESEARCH, {
      techId: ' warp-tech ',
    })).toEqual({
      type: ARCHIVE_COMMAND.START_RESEARCH,
      techId: 'warp-tech',
    });
    expect(createArchiveCommand(ARCHIVE_COMMAND.ACCEPT_QUEST, {
      questId: ' starter_trade ',
    })).toEqual({
      type: ARCHIVE_COMMAND.ACCEPT_QUEST,
      questId: 'starter_trade',
    });
    expect(createArchiveCommand(ARCHIVE_COMMAND.CLEAR_RESEARCH_QUEUE)).toEqual({
      type: ARCHIVE_COMMAND.CLEAR_RESEARCH_QUEUE,
    });
  });

  it('保留推荐与阻塞动作对象并冻结外层 envelope', function () {
    var recommendation = { shipIndex: 2, goodId: 'technology' };
    var action = { actionId: 'market', systemId: 'nova_station' };
    var dispatch = createArchiveCommand(ARCHIVE_COMMAND.APPLY_RESEARCH_DISPATCH, {
      recommendation: recommendation,
    });
    var blocker = createArchiveCommand(ARCHIVE_COMMAND.RESOLVE_QUEST_BLOCKER, {
      action: action,
    });

    expect(dispatch.recommendation).toBe(recommendation);
    expect(blocker.action).toBe(action);
    expect(Object.isFrozen(dispatch)).toBe(true);
    expect(Object.isFrozen(blocker)).toBe(true);
  });

  it('拒绝未知、空标识、数组 action 和缺失推荐', function () {
    expect(normalizeArchiveCommand(null)).toBeNull();
    expect(normalizeArchiveCommand({ type: 'archive.unknown' })).toBeNull();
    expect(normalizeArchiveCommand({ type: ARCHIVE_COMMAND.ABANDON_QUEST, questId: ' ' })).toBeNull();
    expect(normalizeArchiveCommand({ type: ARCHIVE_COMMAND.OPEN_FACTION_MARKET, action: [] })).toBeNull();
    expect(normalizeArchiveCommand({ type: ARCHIVE_COMMAND.APPLY_QUEST_DISPATCH })).toBeNull();
    expect(function () {
      createArchiveCommand(ARCHIVE_COMMAND.START_RESEARCH, {});
    }).toThrow(/Invalid archive command/);
  });

  it('UI action adapter 只向单一端口发布规范 command', function () {
    var onCommand = vi.fn(function (command) { return command.type; });
    var ports = createArchiveActionPorts(onCommand);
    var recommendation = { goodId: 'food' };
    var action = { actionId: 'research' };

    expect(ports.onStartResearch('warp-tech')).toBe(ARCHIVE_COMMAND.START_RESEARCH);
    expect(ports.onApplyQuestDispatch(recommendation)).toBe(ARCHIVE_COMMAND.APPLY_QUEST_DISPATCH);
    expect(ports.onResolveQuestBlocker(action)).toBe(ARCHIVE_COMMAND.RESOLVE_QUEST_BLOCKER);
    expect(onCommand.mock.calls.map(function (call) { return call[0]; })).toEqual([
      { type: ARCHIVE_COMMAND.START_RESEARCH, techId: 'warp-tech' },
      { type: ARCHIVE_COMMAND.APPLY_QUEST_DISPATCH, recommendation: recommendation },
      { type: ARCHIVE_COMMAND.RESOLVE_QUEST_BLOCKER, action: action },
    ]);
    expect(createArchiveActionPorts(null).onAcceptQuest('starter')).toBe(false);
  });

  it('档案 UI 与工作区渲染器只保留请求对象和单一 command 端口', function () {
    var questUi = readFileSync('js/ui/QuestUI.js', 'utf8');
    var researchUi = readFileSync('js/ui/ResearchUI.js', 'utf8');
    var factionUi = readFileSync('js/ui/FactionUI.js', 'utf8');
    var workspaceRenderer = readFileSync('js/ui/GameUiWorkspaceRenderer.js', 'utf8');
    var uiRuntime = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');

    [questUi, researchUi, factionUi].forEach(function (source) {
      expect(source).toContain('export function render(request)');
      expect(source).toContain('createArchiveActionPorts(input.onCommand)');
    });
    expect(workspaceRenderer).toContain("var onCommand = _action(actions, 'archive', 'handleCommand')");
    expect(workspaceRenderer).not.toContain("_action(actions, 'archive', 'onStartResearch')");
    expect(workspaceRenderer).not.toContain("_action(actions, 'archive', 'onAcceptQuest')");
    expect(workspaceRenderer).not.toContain("_action(actions, 'archive', 'onOpenFactionMarket')");
    expect(uiRuntime).toContain('handleCommand: actions.archive && actions.archive.handleCommand');
    expect(uiRuntime).not.toContain('archive: Object.assign');
  });
});
