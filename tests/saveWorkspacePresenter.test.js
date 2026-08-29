import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildSaveConfirmation,
  buildSaveWorkspaceView,
} from '../js/ui/SaveWorkspacePresenter.js';

describe('SaveWorkspacePresenter', function () {
  it('把空槽位集合投影为冻结的安全状态与迁移视图', function () {
    var view = buildSaveWorkspaceView({
      slots: [
        { slotId: 0, isEmpty: true, isCorrupted: false },
        { slotId: 1, isEmpty: true, isCorrupted: false },
      ],
    });

    expect(Object.isFrozen(view)).toBe(true);
    expect(view.preferredExportSlotId).toBeNull();
    expect(view.initialTone).toBe('error');
    expect(view.html).toContain('自动备份缺失');
    expect(view.html).toContain('data-save-state="empty"');
    expect(view.html).toContain('disabled aria-disabled="true">导出存档</button>');
  });

  it('选择最近有效槽位并转义损坏存档内容', function () {
    var view = buildSaveWorkspaceView({
      slots: [
        { slotId: 0, isEmpty: true, isCorrupted: false },
        { slotId: 1, isEmpty: false, isCorrupted: false, meta: { timestampMs: 100, credits: 42, day: 2 } },
        { slotId: 2, isEmpty: false, isCorrupted: false, meta: { timestampMs: 200, credits: 84, day: 3 } },
        { slotId: 3, isEmpty: false, isCorrupted: true, errorMessage: '<broken>' },
      ],
    });

    expect(view.preferredExportSlotId).toBe(2);
    expect(view.initialTone).toBe('neutral');
    expect(view.html).toContain('<option value="2" selected>槽位 2</option>');
    expect(view.html).toContain('&lt;broken&gt;');
    expect(view.html).not.toContain('<broken>');
    expect(view.html).toContain('发现异常槽位');
  });

  it('集中生成危险操作确认描述且不持有 DOM 或存档系统', function () {
    var slot = { slotId: 1, isEmpty: false, isCorrupted: true };
    var overwrite = buildSaveConfirmation('save', slot);
    var importView = buildSaveConfirmation('import', slot, 'backup.json');
    var source = readFileSync('js/ui/SaveWorkspacePresenter.js', 'utf8');

    expect(Object.isFrozen(overwrite)).toBe(true);
    expect(Object.isFrozen(overwrite.details)).toBe(true);
    expect(overwrite.title).toBe('覆盖槽位 1？');
    expect(importView.details[1].value).toBe('backup.json');
    expect(source).not.toContain('document.');
    expect(source).not.toContain('SaveSystem');
    expect(source).not.toContain('ActionConfirmUI');
  });
});
