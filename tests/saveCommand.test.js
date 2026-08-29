import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SAVE_COMMAND,
  createSaveCommand,
  normalizeSaveCommand,
} from '../js/core/SaveCommand.js';
import { createSaveActionPorts } from '../js/ui/SaveCommandAdapter.js';

describe('SaveCommand', function () {
  it('规范化槽位并冻结 command envelope', function () {
    var save = createSaveCommand(SAVE_COMMAND.SAVE_SLOT, { slotId: '2' });
    var load = createSaveCommand(SAVE_COMMAND.LOAD_SLOT, { slotId: 0 });

    expect(save).toEqual({ type: SAVE_COMMAND.SAVE_SLOT, slotId: 2 });
    expect(load).toEqual({ type: SAVE_COMMAND.LOAD_SLOT, slotId: 0 });
    expect(Object.isFrozen(save)).toBe(true);
    expect(Object.isFrozen(load)).toBe(true);
  });

  it('拒绝未知、空白、负数与非整数槽位', function () {
    expect(normalizeSaveCommand(null)).toBeNull();
    expect(normalizeSaveCommand({ type: 'save.unknown', slotId: 1 })).toBeNull();
    expect(normalizeSaveCommand({ type: SAVE_COMMAND.SAVE_SLOT, slotId: ' ' })).toBeNull();
    expect(normalizeSaveCommand({ type: SAVE_COMMAND.SAVE_SLOT, slotId: null })).toBeNull();
    expect(normalizeSaveCommand({ type: SAVE_COMMAND.SAVE_SLOT, slotId: false })).toBeNull();
    expect(normalizeSaveCommand({ type: SAVE_COMMAND.LOAD_SLOT, slotId: -1 })).toBeNull();
    expect(normalizeSaveCommand({ type: SAVE_COMMAND.LOAD_SLOT, slotId: 1.5 })).toBeNull();
    expect(function () {
      createSaveCommand(SAVE_COMMAND.SAVE_SLOT, {});
    }).toThrow(/Invalid save command/);
  });

  it('UI action adapter 只向单一端口发布规范 command', function () {
    var onCommand = vi.fn(function (command) { return command.type; });
    var ports = createSaveActionPorts(onCommand);

    expect(ports.onSave('3')).toBe(SAVE_COMMAND.SAVE_SLOT);
    expect(ports.onLoad(1)).toBe(SAVE_COMMAND.LOAD_SLOT);
    expect(onCommand.mock.calls.map(function (call) { return call[0]; })).toEqual([
      { type: SAVE_COMMAND.SAVE_SLOT, slotId: 3 },
      { type: SAVE_COMMAND.LOAD_SLOT, slotId: 1 },
    ]);
    expect(createSaveActionPorts(null).onSave(1)).toBe(false);
  });

  it('存档 UI 与工作区渲染器只保留请求对象和单一 command 端口', function () {
    var saveUi = readFileSync('js/ui/SaveUI.js', 'utf8');
    var workspaceController = readFileSync('js/ui/SaveWorkspaceController.js', 'utf8');
    var workspaceRenderer = readFileSync('js/ui/GameUiWorkspaceRenderer.js', 'utf8');
    var uiRuntime = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');

    expect(saveUi).toContain('export function render(request)');
    expect(workspaceController).toContain('createSaveActionPorts(onCommand)');
    expect(workspaceController).not.toContain('input.onSave');
    expect(workspaceController).not.toContain('input.onLoad');
    expect(workspaceRenderer).toContain("onCommand: _action(actions, 'save', 'handleCommand')");
    expect(workspaceRenderer).not.toContain("_action(actions, 'save', 'onSaveGame')");
    expect(workspaceRenderer).not.toContain("_action(actions, 'save', 'onLoadGame')");
    expect(uiRuntime).toContain('handleCommand: persistence.handleCommand');
    expect(uiRuntime).not.toContain('onSaveGame: persistence.saveSlot');
  });
});
