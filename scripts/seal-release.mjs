import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { currentFiles, walk } from './release-files.mjs';
import { GAME_VERSION, SAVE_SCHEMA_VERSION } from '../js/data/constants.js';

// 先执行完整验证，再封存本地静态包；不提交 Git，也不部署。
for (const script of ['check', 'test', 'check:scene-assets', 'build']) execFileSync('npm', ['run', script], { stdio: 'inherit' });
await mkdir('releases', { recursive: true });
const archive = `releases/blue-meridian-${GAME_VERSION}.zip`;
// 构建物放在 game/，文档放在 docs/；不包含机器环境、浏览器数据或历史备份。
execFileSync('python3', ['-c', `
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile('${archive}', 'w', ZIP_DEFLATED, compresslevel=9) as package:
    for directory, target in [('dist', 'game'), ('docs', 'docs')]:
        for path in sorted(Path(directory).rglob('*')):
            if path.is_file() and not any(part.startswith('.') for part in path.parts):
                package.write(path, str(Path(target) / path.relative_to(directory)))
    package.write('releases/README.md', 'README.md')
`], { stdio: 'inherit' });
async function record(path) {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const packageRecord = await record(archive);
const manifest = {version: GAME_VERSION, saveSchemaVersion: SAVE_SCHEMA_VERSION, status: 'sealed', sealedAt: new Date().toISOString(),
  source: await Promise.all((await currentFiles()).map(record)),
  build: await Promise.all((await walk('dist')).sort().map(record)), package: packageRecord};
await writeFile(`releases/${GAME_VERSION}-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(archive + '.sha256', packageRecord.sha256 + '  ' + archive.split('/').at(-1) + '\n');
execFileSync('npm', ['run', 'check:release'], { stdio: 'inherit' });
