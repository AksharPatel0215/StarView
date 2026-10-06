// A cooled spring layout with repulsion, label clearance, and folder grouping.
// Layout positions stay in memory; document and relationship metadata stay on disk.
export type Point = { id: string; group: string; x: number; y: number; vx: number; vy: number; fx?: number; fy?: number };
export type Spring = { source: string; target: string };
function hash(value: string) { let result = 2166136261; for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619); return result >>> 0; }
export function createLayout(nodes: { path: string }[], previous: Point[] = []): Point[] {
  const old = new Map(previous.map(node => [node.id, node]));
  const groups = [...new Set(nodes.map(node => node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''))].sort();
  return nodes.map(node => {
    const existing = old.get(node.path); if (existing) return { ...existing };
    const group = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
    const angle = hash(node.path) / 4294967296 * Math.PI * 2;
    const groupAngle = groups.indexOf(group) / Math.max(1, groups.length) * Math.PI * 2;
    const radius = 60 + (hash(node.path + 'radius') % 210);
    return { id: node.path, group, x: Math.cos(groupAngle) * 220 + Math.cos(angle) * radius, y: Math.sin(groupAngle) * 220 + Math.sin(angle) * radius, vx: 0, vy: 0 };
  });
}
export function stepLayout(nodes: Point[], links: Spring[], heat = 1, spacing = 1): number {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const degree = new Map<string, number>();
  for (const edge of links) { degree.set(edge.source, (degree.get(edge.source) || 0) + 1); degree.set(edge.target, (degree.get(edge.target) || 0) + 1); }
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) < .01) { dx = .3 + i * .01; dy = .2 + j * .01; }
      const distance = Math.max(1, Math.hypot(dx, dy));
      const minimum = 145 * spacing;
      // Charge prevents dense bundles; collision gives room to node captions.
      const force = Math.min(9, 1200 * spacing * spacing / (distance * distance) + Math.max(0, minimum - distance) * .055) * heat;
      const x = dx / distance * force, y = dy / distance * force;
      a.vx -= x; a.vy -= y; b.vx += x; b.vy += y;
    }
  }
  // Treat reciprocal links as a single spring so backlinks do not over-tighten clusters.
  const seen = new Set<string>();
  for (const edge of links) {
    const key = [edge.source, edge.target].sort().join('\0'); if (seen.has(key) || edge.source === edge.target) continue; seen.add(key);
    const a = byId.get(edge.source), b = byId.get(edge.target); if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
    const desired = (a.group === b.group ? 165 : 240) * spacing;
    const force = (distance - desired) * .018 * heat / Math.sqrt(Math.max(degree.get(a.id) || 1, degree.get(b.id) || 1));
    const x = dx / distance * force, y = dy / distance * force;
    a.vx += x; a.vy += y; b.vx -= x; b.vy -= y;
  }
  const groups = new Map<string, { x: number; y: number; count: number }>();
  for (const node of nodes) { const center = groups.get(node.group) || { x: 0, y: 0, count: 0 }; center.x += node.x; center.y += node.y; center.count++; groups.set(node.group, center); }
  let energy = 0;
  for (const node of nodes) {
    const group = groups.get(node.group)!;
    node.vx += ((group.x / group.count - node.x) * .004 - node.x * .0008) * heat;
    node.vy += ((group.y / group.count - node.y) * .004 - node.y * .0008) * heat;
    node.vx = Math.max(-15, Math.min(15, node.vx * .76)); node.vy = Math.max(-15, Math.min(15, node.vy * .76));
    if (node.fx !== undefined && node.fy !== undefined) { node.x = node.fx; node.y = node.fy; node.vx = 0; node.vy = 0; }
    else { node.x += node.vx; node.y += node.vy; }
    energy += Math.abs(node.vx) + Math.abs(node.vy);
  }
  return energy;
}
export function fitLayout(nodes: Point[], width: number, height: number) {
  if (!nodes.length) return { x: width / 2, y: height / 2, scale: 1 };
  const minX = Math.min(...nodes.map(node => node.x)) - 90, maxX = Math.max(...nodes.map(node => node.x)) + 90;
  const minY = Math.min(...nodes.map(node => node.y)) - 55, maxY = Math.max(...nodes.map(node => node.y)) + 65;
  const scale = Math.max(.08, Math.min(1.6, (width - 36) / (maxX - minX), (height - 36) / (maxY - minY)));
  return { x: width / 2 - (minX + maxX) / 2 * scale, y: height / 2 - (minY + maxY) / 2 * scale, scale };
}
export function neighborhood(center: string, links: Spring[], depth: number): Set<string> {
  const paths = new Set([center]); let frontier = new Set([center]);
  for (let hop = 0; hop < depth; hop++) {
    const next = new Set<string>();
    for (const edge of links) { if (frontier.has(edge.source)) next.add(edge.target); if (frontier.has(edge.target)) next.add(edge.source); }
    frontier = new Set([...next].filter(path => !paths.has(path))); for (const path of frontier) paths.add(path);
  }
  return paths;
}
