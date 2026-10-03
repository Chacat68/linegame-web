import { readdir } from 'node:fs/promises';
// 只收录当前产品、验证工具和公开构建配置，不接触环境变量、存档或清理备份。
const roots = ['js', 'css', 'assets', 'docs', 'types', 'tests', 'scripts'];
const config = ['index.html', 'README.md', 'releases/README.md', 'package.json', 'package-lock.json', 'vite.config.mjs', 'vitest.config.mjs', 'eslint.config.mjs', 'tsconfig.json', 'playwright.config.mjs', 'playwright.production.config.mjs', 'wrangler.toml', 'wrangler.jsonc', '.github/workflows/deploy-cloudflare.yml'];
export async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(entry => !entry.name.startsWith('.')).map(entry =>
    entry.isDirectory() ? walk(directory + '/' + entry.name) : [directory + '/' + entry.name]))).flat();
}
export async function currentFiles() { return [...config, ...(await Promise.all(roots.map(walk))).flat()].sort(); }
