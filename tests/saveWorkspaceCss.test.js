import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STYLE_ENTRY = readFileSync('css/style.css', 'utf8');
const SAVE_OWNER = 'save-workspace.css';
const SAVE_PRIVATE_SELECTOR = /(?:\.save-|#save-list\b|\.settings-save-shell\b|\.(?:load|import|export|del)-btn\b)/;

function getRuntimeStyleFiles() {
  return Array.from(STYLE_ENTRY.matchAll(/@import url\("([^"]+)"\)/g), function (match) {
    return match[1];
  });
}

describe('Save Workspace CSS ownership', function () {
  it('由独立组件样式在现行级联末端接管存档工作区', function () {
    expect(STYLE_ENTRY).toContain('@import url("save-workspace.css")');
    expect(STYLE_ENTRY.indexOf('@import url("save-workspace.css")'))
      .toBeGreaterThan(STYLE_ENTRY.indexOf('@import url("global-shell-v2.css")'));
  });

  it('所有运行时存档私有选择器只存在于唯一 owner', function () {
    var runtimeFiles = getRuntimeStyleFiles();
    expect(runtimeFiles).toContain(SAVE_OWNER);
    runtimeFiles.filter(function (file) { return file !== SAVE_OWNER; }).forEach(function (file) {
      expect(readFileSync('css/' + file, 'utf8'), file).not.toMatch(SAVE_PRIVATE_SELECTOR);
    });
  });

  it('owner 覆盖现行状态、危险动作、迁移与移动触控契约且不复活旧状态类', function () {
    var css = readFileSync('css/' + SAVE_OWNER, 'utf8');
    [
      '.settings-panel-page--data #save-list',
      '.save-safety-panel',
      '.save-slot--ready',
      '.save-slot--empty',
      '.save-slot--corrupted',
      '.save-transfer-control-group',
      '.save-export-slot-select',
      '.del-btn',
      'min-height: var(--ui-control-lg, 44px);',
    ].forEach(function (anchor) {
      expect(css).toContain(anchor);
    });
    expect(css).not.toMatch(/\.save-slot\.(?:has-data|empty-slot)|\.save-slot-name/);
  });
});
