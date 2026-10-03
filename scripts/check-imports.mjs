import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { init, parse } from 'es-module-lexer';

await init;
const root = resolve('.');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(resolve(directory, entry.name))
    : entry.name.endsWith('.js') ? [resolve(directory, entry.name)] : []))).flat();
}
const modules = await files(resolve('js'));
const graph = new Map();
for (const file of modules) {
  const [imports] = parse(await readFile(file, 'utf8'));
  const dependencies = [];
  for (const entry of imports) {
    if (!entry.n?.startsWith('.')) continue;
    const target = resolve(dirname(file), entry.n.split(/[?#]/)[0]);
    await access(target).catch(() => { throw new Error(`模块不存在：${relative(root, file)} → ${entry.n}`); });
    if (entry.d === -1) dependencies.push(target);
  }
  graph.set(file, dependencies);
}
const visited = new Set();
function visit(file, stack = []) {
  if (stack.includes(file)) throw new Error('静态循环依赖：' + [...stack, file].map(file => relative(root, file)).join(' → '));
  if (visited.has(file)) return;
  for (const dependency of graph.get(file) || []) visit(dependency, [...stack, file]);
  visited.add(file);
}
for (const file of modules) visit(file);
const eager = new Set();
function collect(file) {
  if (eager.has(file)) return;
  eager.add(file);
  for (const dependency of graph.get(file) || []) collect(dependency);
}
collect(resolve('js/main.js'));
if (eager.has(resolve('js/ui/RendererThreeStarmap.js'))) throw new Error('Three.js 渲染器必须延迟加载。');
const forbidden = /\/(idle|fleet|finance|quest|research|tutorial|guidance|victory|progression|economy|exploration|trade|time)\//;
for (const file of modules) if (forbidden.test(relative(root, file))) throw new Error('2.0 中残留已退出玩法模块：' + relative(root, file));
if (modules.includes(resolve('js/ui/Renderer2DStarmap.js'))) throw new Error('星图不应保留已退出的 2D 兼容场景模块。');
if (/id=["']map-3d-canvas["']/.test(await readFile(resolve('index.html'), 'utf8'))) throw new Error('星图不应保留已退出的 2D 兼容画布。');
console.log(`模块检查通过：${modules.length} 个模块，无缺失引用或静态循环，启动/延迟边界有效。`);
