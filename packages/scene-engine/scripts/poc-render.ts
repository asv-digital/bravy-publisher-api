/**
 * POC Sprint 1 — resolveScene + paintSlide (skia-canvas) → PNG 1080².
 * Prova: engine determinístico renderiza o design editorial sem Playwright.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Canvas, FontLibrary } from 'skia-canvas';
import { resolveScene } from '../src/resolve.js';
import { paintSlide, type Ctx2D } from '../src/paint.js';
import { SEED_BRAND_KIT } from '../src/brand-kit.js';
import type { DesignDocument } from '../src/doc.js';
import { loadSeedMetrics, seedSkiaFonts } from '../src/node/fonts.js';

const fontsDir = fileURLToPath(new URL('../fonts', import.meta.url));
const outDir = fileURLToPath(new URL('../out', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const [family, paths] of seedSkiaFonts(fontsDir)) FontLibrary.use(family, paths);
const metrics = loadSeedMetrics(fontsDir);

const doc: DesignDocument = {
  schemaVersion: 1,
  content: {
    slug: 'pis-cofins-no-sped',
    template: 'step',
    persona: 'contador',
    labelTopoCapa: 'CLAUDE CODE BR',
    labelCapa: 'O ERRO DE R$ 30 MIL/ANO',
    hookCapa: 'Todo mês some dinheiro no <em>lugar errado</em>',
    slides: [
      {
        tag: 'onde todo mundo escorrega',
        headlineTop: 'O cliente',
        headlineEm: 'erra',
        headlineBottom: 'e ninguém percebe',
        list: [
          'Crédito de <strong>PIS/COFINS</strong> lançado na conta errada do plano.',
          'O <code>SPED</code> aceita — a malha fina cruza seis meses depois, calada.',
          'A autuação chega com <em>75% de multa</em> mais juros Selic acumulados.',
        ],
      },
      {
        tag: 'o tamanho do rombo',
        headlineTop: 'Não é',
        headlineEm: 'centavo',
        headlineBottom: 'é o ano inteiro',
        stats: [
          ['R$ 30 mil', 'recuperados num único cliente médio por ano de revisão.'],
          ['6 meses', 'é o atraso típico entre o erro e a notificação da Receita.'],
          ['75%', 'de multa sobre o débito apurado em autuação de ofício.'],
        ],
      },
      {
        tag: 'como blindar',
        headlineTop: 'Dois',
        headlineEm: 'checks',
        headlineBottom: 'antes de transmitir',
        cards: [
          { label: 'ANTES', icon: '①', title: 'Concilia o crédito', body: 'Cruza o razão com o bloco <em>M</em> do SPED Contribuições.', highlight: false },
          { label: 'DEPOIS', icon: '②', title: 'Valida a apuração', body: 'Confere CST e base antes do <code>fechamento</code>.', highlight: true },
        ],
      },
    ],
    ctaLabelTopo: 'tá na hora',
    ctaLabel: 'leva 2 minutos pra colar',
    ctaText: 'Comenta <span class="keyword">hoje</span> e te mando o <em>checklist</em>',
    ctaSub: 'Sem te cobrar nada.',
    caption: 'Salva esse post pra revisar antes do próximo SPED.',
  },
};

const scene = resolveScene(doc, metrics, SEED_BRAND_KIT);
console.log(`slides: ${scene.slides.length}`);

const names = ['cover', 'body-bullets', 'body-stats', 'body-cards', 'cta'];
for (const slide of scene.slides) {
  const canvas = new Canvas(slide.width, slide.height);
  const ctx = canvas.getContext('2d') as unknown as Ctx2D;
  paintSlide(ctx, slide, metrics);
  const buf = await canvas.toBuffer('png');
  const name = names[slide.index] ?? `slide-${slide.index}`;
  const file = `${outDir}/${String(slide.index).padStart(2, '0')}-${name}.png`;
  writeFileSync(file, buf);
  console.log(`  [${slide.index}] ${name}: ${slide.nodes.length} nós, ${Math.round(buf.length / 1024)}KB`);
}
console.log(`\nPNGs em: ${outDir}`);
