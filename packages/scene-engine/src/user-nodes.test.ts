import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveScene } from './resolve.js';
import { SEED_BRAND_KIT } from './brand-kit.js';
import { loadSeedMetrics } from './node/fonts.js';
import { EDITORIAL_DOC } from './__fixtures__/docs.js';
import type { DesignDocument, UserNode } from './doc.js';

const metrics = loadSeedMetrics(fileURLToPath(new URL('../fonts', import.meta.url)));

const ADDED: UserNode[] = [
  { kind: 'rect', id: 'user/r1', frame: { x: 100, y: 700, w: 300, h: 120 }, fill: '#C7634F', radius: 8, opacity: 0.8 },
  { kind: 'ellipse', id: 'user/e1', frame: { x: 500, y: 700, w: 140, h: 140 }, fill: '#1A1815' },
  { kind: 'text', id: 'user/t1', frame: { x: 120, y: 720, w: 260, h: 0 }, text: 'Texto livre do usuário em duas linhas', role: 'display', weight: 700, size: 28, fill: '#FAF6ED' },
  { kind: 'image', id: 'user/i1', frame: { x: 700, y: 650, w: 220, h: 220 }, src: 'https://example.com/x.png', radius: 12 },
  { kind: 'line', id: 'user/l1', x1: 100, y1: 900, x2: 980, y2: 900, stroke: '#C9BFA9', strokeWidth: 2 },
];

function docWith(added: UserNode[]): DesignDocument {
  return { ...EDITORIAL_DOC, added: { 0: added } };
}

test('user nodes materializam na cena, acima do template (z>=1000), na ordem do array', () => {
  const scene = resolveScene(docWith(ADDED), metrics, SEED_BRAND_KIT);
  const cover = scene.slides[0]!;
  const rect = cover.nodes.find((n) => n.id === 'user/r1')!;
  const ellipse = cover.nodes.find((n) => n.id === 'user/e1')!;
  const img = cover.nodes.find((n) => n.id === 'user/i1')!;
  const line = cover.nodes.find((n) => n.id === 'user/l1')!;
  assert.equal(rect.type, 'rect');
  assert.equal(ellipse.type, 'ellipse');
  assert.equal(img.type, 'image');
  assert.equal(line.type, 'line');
  assert.ok(rect.z >= 1000 && ellipse.z > rect.z, 'ordem do array vira z crescente');
  assert.equal(rect.opacity, 0.8);
  // outros slides não ganham nada
  assert.ok(!scene.slides[1]!.nodes.some((n) => n.id.startsWith('user/')));
});

test('behind=true pinta atrás de todo o template (z negativo), mantendo a ordem do array', () => {
  const added: UserNode[] = [
    { kind: 'rect', id: 'user/b1', frame: { x: 0, y: 0, w: 100, h: 100 }, fill: '#C9BFA9', behind: true },
    { kind: 'ellipse', id: 'user/b2', frame: { x: 50, y: 50, w: 80, h: 80 }, fill: '#C7634F', behind: true },
    { kind: 'rect', id: 'user/f1', frame: { x: 200, y: 200, w: 100, h: 100 }, fill: '#1A1815' },
  ];
  const scene = resolveScene(docWith(added), metrics, SEED_BRAND_KIT);
  const cover = scene.slides[0]!;
  const b1 = cover.nodes.find((n) => n.id === 'user/b1')!;
  const b2 = cover.nodes.find((n) => n.id === 'user/b2')!;
  const f1 = cover.nodes.find((n) => n.id === 'user/f1')!;
  const templateZs = cover.nodes.filter((n) => !n.id.startsWith('user/')).map((n) => n.z);
  assert.ok(b1.z < Math.min(...templateZs), 'behind fica sob todo o template');
  assert.ok(b2.z > b1.z, 'ordem do array preservada dentro da banda de trás');
  assert.ok(f1.z > Math.max(...templateZs), 'sem o flag continua acima do template');
});

test('texto livre quebra linha pelo MESMO engine e usa família do papel do kit', () => {
  const scene = resolveScene(docWith(ADDED), metrics, SEED_BRAND_KIT);
  const glyphs = scene.slides[0]!.nodes.filter((n) => n.type === 'glyphrun' && n.container === 'user/t1');
  assert.ok(glyphs.length >= 2, `esperava >=2 linhas, veio ${glyphs.length}`);
  const g = glyphs[0]! as Extract<(typeof glyphs)[number], { type: 'glyphrun' }>;
  assert.equal(g.style.family, SEED_BRAND_KIT.typography.display.family);
  assert.equal(g.style.size, 28);
  assert.equal(g.style.fill, '#FAF6ED');
  // dentro da caixa
  for (const node of glyphs) {
    const gl = node as typeof g;
    assert.ok(gl.x >= 120 - 1, 'x dentro do frame');
  }
});

test('rotation de user node propaga com âncora compartilhada (texto multi-linha gira como bloco)', () => {
  const rotated: UserNode[] = [
    { kind: 'rect', id: 'user/rr', frame: { x: 100, y: 100, w: 200, h: 100 }, fill: '#C7634F', rotation: 30 },
    { kind: 'text', id: 'user/rt', frame: { x: 400, y: 400, w: 220, h: 0 }, text: 'duas linhas de texto rotacionado aqui', size: 30, fill: '#1A1815', rotation: -15 },
  ];
  const scene = resolveScene(docWith(rotated), metrics, SEED_BRAND_KIT);
  const rect = scene.slides[0]!.nodes.find((n) => n.id === 'user/rr')!;
  assert.equal(rect.rotation, 30);
  assert.deepEqual(rect.rotationCenter, { x: 200, y: 150 });
  const glyphs = scene.slides[0]!.nodes.filter((n) => n.type === 'glyphrun' && n.container === 'user/rt');
  assert.ok(glyphs.length >= 2);
  const centers = new Set(glyphs.map((g) => JSON.stringify(g.rotationCenter)));
  assert.equal(centers.size, 1, 'todas as linhas compartilham a MESMA âncora');
  assert.ok(glyphs.every((g) => g.rotation === -15));
});

test('override.rotation rotaciona container do template com âncora na bbox', () => {
  const doc: DesignDocument = { ...EDITORIAL_DOC, overrides: { 0: { 'cover/hook': { rotation: 10 } } } };
  const scene = resolveScene(doc, metrics, SEED_BRAND_KIT);
  const glyphs = scene.slides[0]!.nodes.filter((n) => n.type === 'glyphrun' && n.container === 'cover/hook');
  assert.ok(glyphs.length > 0);
  assert.ok(glyphs.every((g) => g.rotation === 10));
  const centers = new Set(glyphs.map((g) => JSON.stringify(g.rotationCenter)));
  assert.equal(centers.size, 1, 'âncora única pro container inteiro');
});

test('cena com added é determinística', () => {
  const a = JSON.stringify(resolveScene(docWith(ADDED), metrics, SEED_BRAND_KIT));
  const b = JSON.stringify(resolveScene(docWith(ADDED), metrics, SEED_BRAND_KIT));
  assert.equal(a, b);
});

test('family explícita no texto livre ignora o papel do kit', () => {
  const added: UserNode[] = [
    // 'JetBrains Mono' está registrada nas métricas seed → família válida ≠ papel body
    { kind: 'text', id: 'user/ff', frame: { x: 100, y: 100, w: 400, h: 0 }, text: 'fonte custom', family: 'JetBrains Mono', weight: 500, size: 30, fill: '#1A1815' },
  ];
  const scene = resolveScene(docWith(added), metrics, SEED_BRAND_KIT);
  const g = scene.slides[0]!.nodes.find((n) => n.type === 'glyphrun' && n.container === 'user/ff') as Extract<UserNode, never> | any;
  assert.equal(g.style.family, 'JetBrains Mono');
  assert.equal(g.style.weight, 500);
});

test('override.family/weight re-layouta o container do template (reflow real)', () => {
  const base = resolveScene(EDITORIAL_DOC, metrics, SEED_BRAND_KIT);
  const doc: DesignDocument = { ...EDITORIAL_DOC, overrides: { 0: { 'cover/hook': { family: 'JetBrains Mono', weight: 500 } } } };
  const scene = resolveScene(doc, metrics, SEED_BRAND_KIT);
  const glyphs = scene.slides[0]!.nodes.filter((n) => n.type === 'glyphrun' && n.container === 'cover/hook') as any[];
  assert.ok(glyphs.length > 0);
  assert.ok(glyphs.every((g) => g.style.family === 'JetBrains Mono'), 'família trocada');
  // reflow: as posições/larguras mudam vs base (mono é mais largo → outra quebra)
  const baseGlyphs = base.slides[0]!.nodes.filter((n) => n.type === 'glyphrun' && n.container === 'cover/hook') as any[];
  const changed = glyphs.length !== baseGlyphs.length || glyphs.some((g, i) => g.text !== baseGlyphs[i]?.text || g.x !== baseGlyphs[i]?.x);
  assert.ok(changed, 'layout re-derivado com as métricas da nova família');
});
