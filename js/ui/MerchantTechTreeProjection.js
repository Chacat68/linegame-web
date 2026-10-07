import { MERCHANT_COMPANY_RULES, MERCHANT_TECHS } from '../data/merchant.js';

export const TECH_TREE_LAYOUT = Object.freeze({ nodeHeight: 244, rowHeight: 324, headerHeight: 112, inset: 24, gap: 24 });
const byId = new Map(MERCHANT_TECHS.map(tech => [tech.id, tech]));
const tierOf = tech => Math.ceil(tech.companyLevel / MERCHANT_COMPANY_RULES.levelsPerTier);
const branches = { 航速: 0, 航运科技: 0, 载量: 1, 船队扩容: 1, 收益: 2, 功能: 2 };

export function getTechTreeRelations(id) {
  const tech = byId.get(id);
  if (!tech) return { parents: [], children: [], connected: new Set() };
  const parents = tech.requires.map(required => byId.get(required));
  const children = MERCHANT_TECHS.filter(item => item.requires.includes(id));
  const connected = new Set([id, ...parents.map(item => item.id), ...children.map(item => item.id)]);
  return { parents, children, connected };
}

// Sections progress vertically. Completion never changes a node's size, slot or connection geometry.
export function buildMerchantTechTree(merchant, { category = 'all', selectedId = null, width = 840 } = {}) {
  const columns = width >= 744 ? 3 : width >= 500 ? 2 : 1;
  const nodeWidth = (width - 2 * TECH_TREE_LAYOUT.inset - (columns - 1) * TECH_TREE_LAYOUT.gap) / columns;
  const positions = new Map(), stages = [];
  let top = 0;
  const tierCount = MERCHANT_COMPANY_RULES.maxLevel / MERCHANT_COMPANY_RULES.levelsPerTier;
  for (let tier = 1; tier <= tierCount; tier++) {
    const occupied = new Set();
    let rows = 1;
    const techs = MERCHANT_TECHS.filter(tech => tierOf(tech) === tier).sort((a, b) => a.companyLevel - b.companyLevel);
    for (const tech of techs) {
      const column = branches[tech.category] % columns;
      // Within a stage, dependencies always occupy a lower row than their prerequisite.
      let row = Math.max(0, ...tech.requires.filter(id => positions.get(id)?.tier === tier).map(id => positions.get(id).row + 1));
      while (occupied.has(`${row}:${column}`)) row++;
      occupied.add(`${row}:${column}`); rows = Math.max(rows, row + 1);
      positions.set(tech.id, { tier, row, column, width: nodeWidth,
        x: TECH_TREE_LAYOUT.inset + column * (nodeWidth + TECH_TREE_LAYOUT.gap),
        y: top + TECH_TREE_LAYOUT.headerHeight + row * TECH_TREE_LAYOUT.rowHeight });
    }
    const height = TECH_TREE_LAYOUT.headerHeight + rows * TECH_TREE_LAYOUT.rowHeight;
    stages.push({ tier, y: top, height }); top += height;
  }
  const completed = new Set(merchant.researchedTechIds);
  const visible = MERCHANT_TECHS.filter(tech => category === 'all' || tech.category === category);
  const visibleIds = new Set(visible.map(tech => tech.id));
  const { connected } = getTechTreeRelations(selectedId);
  const nodes = visible.map(tech => ({ tech, ...positions.get(tech.id), selected: tech.id === selectedId,
    completed: completed.has(tech.id), related: connected.has(tech.id), locked: !completed.has(tech.id) && merchant.companyLevel < tech.companyLevel,
    missing: tech.requires.filter(id => !completed.has(id)) }));
  const edges = [], references = [];
  for (const node of nodes) {
    const parents = node.tech.requires;
    // A connection stays local only while the gap contains no intervening card.
    // Distant and filtered sources use one named reference above the target.
    const reference = parents.some(id => !visibleIds.has(id)
      || node.y - positions.get(id).y - TECH_TREE_LAYOUT.nodeHeight >= TECH_TREE_LAYOUT.nodeHeight);
    if (reference) references.push({ to: node.tech.id, x: node.x, y: node.y - 52, width: node.width,
      parents: parents.map(id => ({ tech: byId.get(id), completed: completed.has(id) })),
      completed: parents.every(id => completed.has(id)),
      related: node.tech.id === selectedId || parents.includes(selectedId) });
    for (const id of parents) {
      const origin = positions.get(id);
      const x1 = origin.x + nodeWidth / 2, y1 = origin.y + TECH_TREE_LAYOUT.nodeHeight;
      const x2 = node.x + nodeWidth / 2, y2 = node.y;
      const points = reference ? [[x2, y2 - 8], [x2, y2]] : x1 === x2
        ? [[x1, y1], [x2, y2]] : [[x1, y1], [x1, y2 - 60], [x2, y2 - 60], [x2, y2]];
      edges.push({ from: id, to: node.tech.id, completed: completed.has(id), sourceHidden: !visibleIds.has(id),
        kind: reference ? 'reference' : 'direct', related: id === selectedId || node.tech.id === selectedId,
        points, path: points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ') });
    }
  }
  return { nodes, edges, references, stages, width, height: top, columns };
}
