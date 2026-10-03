import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { currentFiles, walk } from './release-files.mjs';
import { GAME_VERSION, SAVE_SCHEMA_VERSION } from '../js/data/constants.js';

const sha = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile('releases/2.0.0-manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
assert.equal(manifest.version, GAME_VERSION);
assert.equal(pkg.version, GAME_VERSION);
assert.equal(lock.version, GAME_VERSION);
assert.equal(lock.packages[''].version, GAME_VERSION);
assert.equal(manifest.saveSchemaVersion, SAVE_SCHEMA_VERSION);
assert.equal(manifest.status, 'sealed');
for (const [name, expectedPaths] of [['source', await currentFiles()], ['build', (await walk('dist')).sort()]]) {
  const records = manifest[name];
  assert.deepEqual(records.map(record => record.path), expectedPaths, `${name} 文件目录与封版清单不同`);
  for (const record of records) {
    const bytes = await readFile(record.path);
    assert.equal(bytes.length, record.bytes, `${record.path} 大小变化`);
    assert.equal(sha(bytes), record.sha256, `${record.path} 内容变化`);
  }
}
const packageBytes = await readFile(manifest.package.path);
assert.equal(packageBytes.length, manifest.package.bytes);
assert.equal(sha(packageBytes), manifest.package.sha256);
const checksum = (await readFile(manifest.package.path + '.sha256', 'utf8')).trim();
assert.equal(checksum, manifest.package.sha256 + '  ' + manifest.package.path.split('/').at(-1));
console.log(`2.0.0 封版校验通过：${manifest.source.length} 项源文件、${manifest.build.length} 项构建文件与发布包 SHA-256 一致。`);
