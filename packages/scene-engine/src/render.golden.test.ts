/**
 * Gate de regressão visual (RFC §4.5 / Sprint 1). Renderiza as fixtures via
 * skia (mesmo painter do worker server) e compara pixel-a-pixel com os goldens
 * curados em __goldens__/. Quebra de golden exige re-aprovação explícita
 * (pnpm test:update-goldens). Também trava o auto-fit: nenhum texto pode ser
 * pintado fora da moldura 1080² (RFC §3.3 — "não estoura a caixa").
 *
 * Nota: o golden aqui é engine→engine (determinismo + anti-regressão). A
 * paridade contra o template Playwright ATUAL é o shadow-compare do backend.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Canvas, FontLibrary } from 'skia-canvas';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { resolveScene } from './resolve.js';
import { paintSlide, type Ctx2D } from './paint.js';
import { SEED_BRAND_KIT } from './brand-kit.js';
import { loadSeedMetrics, seedSkiaFonts } from './node/fonts.js';
import { FIXTURES } from './__fixtures__/docs.js';

const fontsDir = fileURLToPath(new URL('../fonts', import.meta.url));
const goldenDir = fileURLToPath(new URL('../__goldens__', import.meta.url));
mkdirSync(goldenDir, { recursive: true });

for (const [family, paths] of seedSkiaFonts(fontsDir)) FontLibrary.use(family, paths);
const metrics = loadSeedMetrics(fontsDir);
const UPDATE = process.env.UPDATE_GOLDENS === '1';
const W = 1080;
const H = 1080;
const MAX_DIFF_RATIO = 0.01; // < 1%

function renderPng(doc: (typeof FIXTURES)[number]['doc'], slideIndex: number): Buffer {
  const scene = resolveScene(doc, metrics, SEED_BRAND_KIT);
  const slide = scene.slides[slideIndex]!;
  const canvas = new Canvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as Ctx2D;
  paintSlide(ctx, slide, metrics);
  return canvas.toBufferSync('png');
}

for (const fx of FIXTURES) {
  for (const idx of fx.goldenSlides) {
    test(`golden: ${fx.name}[${idx}] casa com a referência (<${MAX_DIFF_RATIO * 100}%)`, () => {
      const png = renderPng(fx.doc, idx);
      const file = `${goldenDir}/${fx.name}-${String(idx).padStart(2, '0')}.png`;
      if (UPDATE || !existsSync(file)) {
        writeFileSync(file, png);
        if (!UPDATE) console.log(`  ⚠ golden criado (revisar e versionar): ${file}`);
        return; // primeira geração: nada a comparar
      }
      const actual = PNG.sync.read(png);
      const golden = PNG.sync.read(readFileSync(file));
      assert.equal(actual.width, golden.width);
      assert.equal(actual.height, golden.height);
      const diff = new PNG({ width: W, height: H });
      const n = pixelmatch(actual.data, golden.data, diff.data, W, H, { threshold: 0.1 });
      const ratio = n / (W * H);
      if (ratio >= MAX_DIFF_RATIO) {
        writeFileSync(`${goldenDir}/${fx.name}-${String(idx).padStart(2, '0')}.diff.png`, PNG.sync.write(diff));
      }
      assert.ok(ratio < MAX_DIFF_RATIO, `diff ${(ratio * 100).toFixed(2)}% acima do limite`);
    });
  }
}

test('auto-fit: nenhum texto é pintado fora da moldura 1080² (fixture stress)', () => {
  const stress = FIXTURES.find((f) => f.name === 'stress')!;
  const scene = resolveScene(stress.doc, metrics, SEED_BRAND_KIT);
  for (const slide of scene.slides) {
    for (const n of slide.nodes) {
      if (n.type !== 'glyphrun') continue;
      const m = metrics.measure(n.text, n.style);
      const top = n.baselineY - m.ascent;
      const bottom = n.baselineY + m.descent;
      assert.ok(top >= -2, `texto acima do topo em ${slide.index}: ${n.id} (${top.toFixed(1)})`);
      assert.ok(bottom <= H + 2, `texto abaixo da base em ${slide.index}: ${n.id} (${bottom.toFixed(1)})`);
    }
  }
});
