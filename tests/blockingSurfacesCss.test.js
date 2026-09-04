import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const STYLE_ENTRY = readFileSync('css/style.css', 'utf8');
const BLOCKING_OWNER = 'blocking-surfaces.css';
const FEATURE_SCOPE = /(?:#(?:tutorial-start|settings|trade|event|dialogue|action-confirm|gameover|dispatch|mod|crew|company-rename|victory)-|\.(?:tutorial-start|tut-start|settings|trade-confirm|event|dialogue|action-confirm|gameover|dispatch|mod-modal|crew-modal|company-rename|victory)-)/;
const COMMON_ROOT = /^(?:\.modal(?=$|[.#:\[]|\s|>)|\.modal-box(?=$|[.#:\[]|\s|>)|\.stack-modal-box(?=$|[.#:\[]|\s|>)|\.stack-modal-scroll(?=$|[.#:\[]|\s|>)|\.modal-actions(?=$|[.#:\[]|\s|>))/;
const RETIRED_MODAL_CLASS = /\.(?:modal-header|modal-title|modal-body|modal-close)\b/;

function getRuntimeStyleFiles() {
  return Array.from(STYLE_ENTRY.matchAll(/@import url\("([^"]+)"\)/g), function (match) {
    return match[1];
  });
}

function getCommonBranches(file) {
  var root = postcss.parse(readFileSync('css/' + file, 'utf8'), { from: file });
  var branches = [];
  root.walkRules(function (rule) {
    (rule.selectors || [rule.selector]).forEach(function (selector) {
      var trimmed = selector.trim();
      if (COMMON_ROOT.test(trimmed) && !FEATURE_SCOPE.test(trimmed)) branches.push(trimmed);
    });
  });
  return branches;
}

describe('Blocking Surface Shell CSS ownership', function () {
  it('在全局壳层之后、所有 Feature Surface owner 之前加载', function () {
    var globalShell = STYLE_ENTRY.indexOf('@import url("global-shell-v2.css")');
    var blocking = STYLE_ENTRY.indexOf('@import url("blocking-surfaces.css")');
    var flow = STYLE_ENTRY.indexOf('@import url("flow-surfaces.css")');
    var settings = STYLE_ENTRY.indexOf('@import url("settings-workspace.css")');
    var save = STYLE_ENTRY.indexOf('@import url("save-workspace.css")');

    expect(blocking).toBeGreaterThan(globalShell);
    expect(flow).toBeGreaterThan(blocking);
    expect(settings).toBeGreaterThan(flow);
    expect(save).toBeGreaterThan(settings);
  });

  it('运行时通用壳层选择器只存在于 Blocking Surface owner', function () {
    getRuntimeStyleFiles().forEach(function (file) {
      var branches = getCommonBranches(file);
      if (file === BLOCKING_OWNER) {
        expect(branches.length).toBeGreaterThan(20);
        return;
      }
      expect(branches, file).toEqual([]);
    });
  });

  it('owner 固化显示、单滚动区、固定动作区、安全区和 44px 触控契约', function () {
    var css = readFileSync('css/' + BLOCKING_OWNER, 'utf8');
    [
      '.modal.hidden',
      '.modal:not(.hidden)',
      '.modal > :where(.modal-box)',
      '.modal > :where(.modal-box):focus-visible',
      '.modal > .stack-modal-box',
      '.stack-modal-scroll',
      '.stack-modal-box > .modal-actions',
      'position: sticky;',
      'overflow-y: auto;',
      'align-self: center;',
      'min-height: var(--modal-action-h);',
      '--modal-action-h: var(--ui-control-lg, 44px);',
      'max(8px, var(--ui-safe-bottom))',
    ].forEach(function (anchor) {
      expect(css).toContain(anchor);
    });
  });

  it('运行时样式不再保留无 DOM 消费者的旧 modal 结构类', function () {
    getRuntimeStyleFiles().forEach(function (file) {
      var css = readFileSync('css/' + file, 'utf8');
      expect(css, file).not.toMatch(RETIRED_MODAL_CLASS);
      if (file !== BLOCKING_OWNER) {
        expect(css, file).not.toMatch(/--modal-(?:safe-gap|action-h)\s*:/);
      }
    });
  });
});
