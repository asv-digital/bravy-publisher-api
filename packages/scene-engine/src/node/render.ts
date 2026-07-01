/**
 * Render Node-only (skia-canvas) — coração do worker server. Node-only porque
 * importa skia + fontkit; o browser usa react-konva/canvas próprio. Mantém o
 * mesmo resolveScene + paintSlide do PoC → paridade com o export client.
 */
import { Canvas, FontLibrary } from 'skia-canvas';
import { resolveScene } from '../resolve.js';
import { paintSlide, type Ctx2D, type PaintOptions } from '../paint.js';
import { SEED_BRAND_KIT, type BrandKit } from '../brand-kit.js';
import type { DesignDocument } from '../doc.js';
import type { FontkitMetrics } from '../text/metrics.js';
import { loadSeedMetrics, seedFontsDir, seedSkiaFonts } from './fonts.js';

const metricsCache = new Map<string, FontkitMetrics>();
const registered = new Set<string>();

function ensureFonts(dir: string): FontkitMetrics {
  if (!registered.has(dir)) {
    for (const [family, paths] of seedSkiaFonts(dir)) FontLibrary.use(family, paths);
    registered.add(dir);
  }
  let m = metricsCache.get(dir);
  if (!m) {
    m = loadSeedMetrics(dir);
    metricsCache.set(dir, m);
  }
  return m;
}

export interface RenderedSlide {
  index: number;
  png: Buffer;
  nodeCount: number;
  width: number;
  height: number;
}

export interface RenderSceneOptions {
  brandKit?: BrandKit;
  /** fator de escala do PNG (deviceScaleFactor). default 2 → 2160². */
  pixelRatio?: number;
  fontsDir?: string;
  paint?: PaintOptions;
}

/** Resolve o doc e rasteriza cada slide via skia. Determinístico (mesmas fontes). */
export function renderScenePng(doc: DesignDocument, opts: RenderSceneOptions = {}): RenderedSlide[] {
  const dir = opts.fontsDir ?? seedFontsDir();
  const metrics = ensureFonts(dir);
  const ratio = opts.pixelRatio ?? 2;
  const scene = resolveScene(doc, metrics, opts.brandKit ?? SEED_BRAND_KIT);

  return scene.slides.map((slide) => {
    const canvas = new Canvas(slide.width * ratio, slide.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    paintSlide(ctx as unknown as Ctx2D, slide, metrics, opts.paint);
    return {
      index: slide.index,
      png: canvas.toBufferSync('png'),
      nodeCount: slide.nodes.length,
      width: slide.width * ratio,
      height: slide.height * ratio,
    };
  });
}
