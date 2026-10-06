import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
// Transpile the pure layout module so these tests also run on Node versions
// without native TypeScript stripping.
const source = fs.readFileSync(new URL('../src/graphLayout.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { createLayout, stepLayout, fitLayout, neighborhood } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('a dense connected graph settles with finite coordinates and readable node separation', () => {
  const nodes = Array.from({ length: 24 }, (_, i) => ({ path: `cluster-${i % 4}/note-${i}.tex` }));
  const links = nodes.flatMap((node, i) => [1, 4, 7].map(offset => ({ source: node.path, target: nodes[(i + offset) % nodes.length].path })));
  const points = createLayout(nodes);
  for (let tick = 0; tick < 600; tick++) stepLayout(points, links, .8, 1);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const minimum = Math.min(...points.flatMap((point, i) => points.slice(i + 1).map(other => Math.hypot(point.x - other.x, point.y - other.y))));
  assert.ok(minimum > 90, `Nodes collided: ${minimum}`);
  const camera = fitLayout(points, 1000, 600);
  for (const point of points) { assert.ok(point.x * camera.scale + camera.x > 0 && point.x * camera.scale + camera.x < 1000); assert.ok(point.y * camera.scale + camera.y > 0 && point.y * camera.scale + camera.y < 600); }
});

test('dragged pins remain fixed while the surrounding graph relaxes', () => {
  const points = createLayout([{ path: 'a' }, { path: 'b' }, { path: 'c' }]);
  points[0].fx = 350; points[0].fy = -200;
  for (let i = 0; i < 100; i++) stepLayout(points, [{ source: 'a', target: 'b' }]);
  assert.equal(points[0].x, 350); assert.equal(points[0].y, -200);
});

test('neighbor focus respects hop distance in both directions and excludes disconnected documents', () => {
  const edges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'b' }, { source: 'c', target: 'd' }, { source: 'x', target: 'y' }];
  assert.deepEqual([...neighborhood('a', edges, 1)].sort(), ['a', 'b']);
  assert.deepEqual([...neighborhood('a', edges, 2)].sort(), ['a', 'b', 'c']);
});

test('coincident nodes separate instead of producing NaN coordinates', () => {
  const points = createLayout([{ path: 'a' }, { path: 'b' }]); points.forEach(point => { point.x = 0; point.y = 0; });
  for (let i = 0; i < 80; i++) stepLayout(points, []);
  assert.ok(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) > 100);
  assert.deepEqual(fitLayout([], 1000, 600), { x: 500, y: 300, scale: 1 });
});
