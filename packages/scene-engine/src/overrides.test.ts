import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_BRAND_KIT } from './brand-kit.js';
import type { GlyphRunNode, RectNode } from './scene.js';
import { anchorableIds, applyOverrides, reconcileOverrides, validateOverride } from './overrides.js';

const palette = SEED_BRAND_KIT.palette;

test('validateOverride aceita cor livre (hex), clampa fontScale/opacity e descarta lixo', () => {
  const v = validateOverride({ fill: '#123456', fontScale: 9, rotation: 12, opacity: 2 }, palette);
  assert.equal(v.fill, '#123456', 'cor livre: qualquer hex válido');
  assert.equal(v.fontScale, 4, 'fontScale clampa em 4');
  assert.equal(v.opacity, 1, 'opacity clampa em 1');
  assert.equal(v.rotation, 12);
  const bad = validateOverride({ fill: 'red; background:url(x)' as string, fontScale: 0.01 }, palette);
  assert.equal(bad.fill, undefined, 'não-hex cai fora');
  assert.equal(bad.fontScale, 0.25);
});

test('applyOverrides aplica hidden, fill e translação ancorando no container', () => {
  const rect: RectNode = { type: 'rect', id: 'slide[0]/callout', z: 1, frame: { x: 10, y: 10, w: 100, h: 50 }, fill: palette.cardBg };
  const glyph: GlyphRunNode = {
    type: 'glyphrun', id: 'slide[0]/headline.l0r0', container: 'slide[0]/headline', z: 10,
    x: 96, baselineY: 200, text: 'oi', style: { family: 'F', weight: 800, italic: false, size: 78, fill: palette.ink, letterSpacingEm: 0, lineHeight: 1 },
  };
  const out = applyOverrides([rect, glyph], {
    'slide[0]/callout': { fill: palette.accent, hidden: true },
    'slide[0]/headline': { frame: { x: 12, y: -8 }, fill: palette.accent },
  }, palette);
  const r = out[0] as RectNode;
  const g = out[1] as GlyphRunNode;
  assert.equal(r.fill, palette.accent);
  assert.equal(r.opacity, 0, 'hidden → opacity 0');
  assert.equal(g.x, 96 + 12, 'translação x via container');
  assert.equal(g.baselineY, 200 - 8);
  assert.equal(g.style.fill, palette.accent, 'recolor via container');
});

test('hidden cascateia pra decoração descendente no path (dot, callout.text)', () => {
  const dot: RectNode = { type: 'rect', id: 'slide[0]/body.bullet[0].dot', z: 9, frame: { x: 96, y: 500, w: 11, h: 11 }, fill: palette.accent };
  const otherDot: RectNode = { type: 'rect', id: 'slide[0]/body.bullet[1].dot', z: 9, frame: { x: 96, y: 560, w: 11, h: 11 }, fill: palette.accent };
  const calloutText: GlyphRunNode = {
    type: 'glyphrun', id: 'slide[0]/callout.text.l0r0', container: 'slide[0]/callout.text', z: 10,
    x: 128, baselineY: 900, text: 'oi', style: { family: 'F', weight: 400, italic: false, size: 28, fill: palette.ink, letterSpacingEm: 0, lineHeight: 1 },
  };
  const out = applyOverrides([dot, otherDot, calloutText], {
    'slide[0]/body.bullet[0]': { hidden: true },
    'slide[0]/callout': { hidden: true },
  }, palette);
  assert.equal(out[0]!.opacity, 0, 'dot some junto com o bullet escondido');
  assert.equal(out[1]!.opacity, undefined, 'bullet[1].dot não casa com bullet[1x] — segue visível');
  assert.equal(out[2]!.opacity, 0, 'texto do callout some junto com o callout');
});

test('translação cascateia pra decoração descendente (dot segue o bullet, texto segue o callout)', () => {
  const dot: RectNode = { type: 'rect', id: 'slide[1]/body.bullet[0].dot', z: 9, frame: { x: 96, y: 500, w: 11, h: 11 }, fill: palette.accent };
  const bulletText: GlyphRunNode = {
    type: 'glyphrun', id: 'slide[1]/body.bullet[0].l0r0', container: 'slide[1]/body.bullet[0]', z: 10,
    x: 138, baselineY: 520, text: 'oi', style: { family: 'F', weight: 400, italic: false, size: 34, fill: palette.ink, letterSpacingEm: 0, lineHeight: 1 },
  };
  const callout: RectNode = { type: 'rect', id: 'slide[1]/callout', z: 4, frame: { x: 96, y: 800, w: 600, h: 120 }, fill: palette.cardBg };
  const calloutText: GlyphRunNode = {
    type: 'glyphrun', id: 'slide[1]/callout.text.l0r0', container: 'slide[1]/callout.text', z: 10,
    x: 128, baselineY: 860, text: 'oi', style: { family: 'F', weight: 400, italic: false, size: 28, fill: palette.ink, letterSpacingEm: 0, lineHeight: 1 },
  };
  const out = applyOverrides([dot, bulletText, callout, calloutText], {
    'slide[1]/body.bullet[0]': { frame: { x: -17, y: 196 } }, // container de texto: DELTA
    'slide[1]/callout': { frame: { x: 120, y: 760, w: 600, h: 120 } }, // rect: ABSOLUTO
  }, palette);
  const d = out[0] as RectNode;
  const t = out[1] as GlyphRunNode;
  const c = out[2] as RectNode;
  const ct = out[3] as GlyphRunNode;
  assert.equal(d.frame.x, 96 - 17, 'dot acompanha o delta x do bullet');
  assert.equal(d.frame.y, 500 + 196, 'dot acompanha o delta y do bullet');
  assert.equal(t.x, 138 - 17, 'texto translada uma vez só (sem dupla aplicação)');
  assert.equal(t.baselineY, 520 + 196);
  assert.equal(c.frame.x, 120, 'callout vai pro frame absoluto');
  assert.equal(ct.x, 128 + (120 - 96), 'texto do callout segue o delta do rect');
  assert.equal(ct.baselineY, 860 + (760 - 800));
});

test('fontScale escala size e posição do bloco sobre a origem do container', () => {
  const style = { family: 'F', weight: 800, italic: false, size: 40, fill: palette.ink, letterSpacingEm: 0, lineHeight: 1 }
  const g0: GlyphRunNode = { type: 'glyphrun', id: 'slide[0]/headline.l0r0', container: 'slide[0]/headline', z: 10, x: 100, baselineY: 200, text: 'a', style }
  const g1: GlyphRunNode = { type: 'glyphrun', id: 'slide[0]/headline.l1r0', container: 'slide[0]/headline', z: 10, x: 100, baselineY: 260, text: 'b', style }
  const [o0, o1] = applyOverrides([g0, g1], { 'slide[0]/headline': { fontScale: 2 } }, palette) as GlyphRunNode[]
  // origem = (minX=100, minB=200). g0 fica na origem; g1 dobra a distância vertical.
  assert.equal(o0!.style.size, 80)
  assert.equal(o0!.baselineY, 200)
  assert.equal(o1!.baselineY, 200 + (260 - 200) * 2)
  assert.equal(o1!.x, 100)
})

test('reconcileOverrides mantém containers presentes e descarta os ausentes', () => {
  const prev = { 'slide[0]/headline': { fill: palette.accent }, 'slide[0]/card[3]': { hidden: true } };
  const { kept, dropped } = reconcileOverrides(prev, ['slide[0]/headline', 'slide[0]/card[0]']);
  assert.deepEqual(Object.keys(kept), ['slide[0]/headline']);
  assert.deepEqual(dropped, ['slide[0]/card[3]']);
});

test('anchorableIds coleta containers e nós sem container', () => {
  const ids = anchorableIds([
    { type: 'rect', id: 'slide[0]/underline', z: 1, frame: { x: 0, y: 0, w: 1, h: 1 } },
    { type: 'glyphrun', id: 'slide[0]/headline.l0r0', container: 'slide[0]/headline', z: 1, x: 0, baselineY: 0, text: 'a', style: { family: 'F', weight: 400, italic: false, size: 10, fill: '#000', letterSpacingEm: 0, lineHeight: 1 } },
  ]);
  assert.ok(ids.has('slide[0]/underline'));
  assert.ok(ids.has('slide[0]/headline'));
});
