import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function getJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(function (entry) {
    var path = join(directory, entry.name);
    if (entry.isDirectory()) return getJavaScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

describe('internal ES module identity', function () {
  it('内部 import 不使用会制造重复模块实例的版本查询参数', function () {
    var offenders = getJavaScriptFiles('js').filter(function (file) {
      return /(?:from\s*|import\s*\()\s*['"][^'"]+\.js\?v=/.test(readFileSync(file, 'utf8'));
    });

    expect(offenders).toEqual([]);
  });
});
