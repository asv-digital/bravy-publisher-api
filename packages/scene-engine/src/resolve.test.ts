import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveScene } from './resolve.js';
import { SEED_BRAND_KIT } from './brand-kit.js';
import { loadSeedMetrics } from './node/fonts.js';
import { EDITORIAL_DOC } from './__fixtures__/docs.js';
import type { DesignDocument } from './doc.js';

const fontsDir = fileURLToPath(new URL('../fonts', import.meta.url));
const metrics = loadSeedMetrics(fontsDir);

test('resolveScene gera cover + N body + cta', () => {
  const scene = resolveScene(EDITORIAL_DOC, metrics, SEED_BRAND_KIT);
  assert.equal(scene.slides.length, EDITORIAL_DOC.content.slides.length + 2);
  assert.ok(scene.slides.every((s) => s.width === 1080 && s.height === 1080));
  assert.ok(scene.slides[0]!.nodes.length > 0);
});

test('resolveScene é determinístico (mesmo input → mesma cena byte-a-byte)', () => {
  const a = JSON.stringify(resolveScene(EDITORIAL_DOC, metrics, SEED_BRAND_KIT));
  const b = JSON.stringify(resolveScene(EDITORIAL_DOC, metrics, SEED_BRAND_KIT));
  assert.equal(a, b);
});

test('override hidden zera a opacidade do nó ancorado', () => {
  const doc: DesignDocument = { ...EDITORIAL_DOC, overrides: { 0: { 'cover/underline': { hidden: true } } } };
  const scene = resolveScene(doc, metrics, SEED_BRAND_KIT);
  const underline = scene.slides[0]!.nodes.find((n) => n.id === 'cover/underline');
  assert.ok(underline, 'nó cover/underline deveria existir');
  assert.equal(underline!.opacity, 0);
});
