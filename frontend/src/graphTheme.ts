import type { DocumentLink, DocumentNode, GraphStyles } from './api/client';
export const PALETTE = [
  { name: 'Lavender', color: '#b8a1f2' }, { name: 'Sky', color: '#82b4e8' },
  { name: 'Mint', color: '#76c7b2' }, { name: 'Amber', color: '#e3b979' },
  { name: 'Rose', color: '#df98b5' }, { name: 'Sage', color: '#a5bd7d' },
  { name: 'Sand', color: '#c8a183' }, { name: 'Slate', color: '#98a3c2' },
];
export const edgeLabels = (link: DocumentLink) => link.labels?.length ? link.labels : [link.kind ? 'references' : 'related'];
function categoryColor(category: string) { let hash = 0; for (const c of category) hash = ((hash * 31) + c.charCodeAt(0)) >>> 0; return PALETTE[hash % PALETTE.length].color; }
export const nodeColor = (node: DocumentNode, styles?: GraphStyles) => styles?.node_colors[node.path] || node.tags.map(tag => styles?.tag_colors[tag]).find(Boolean) || categoryColor(node.tags[0] || node.path);
export const edgeColor = (link: DocumentLink, styles?: GraphStyles) => link.color || edgeLabels(link).map(label => styles?.relationship_colors[label]).find(Boolean) || categoryColor(edgeLabels(link)[0]);
