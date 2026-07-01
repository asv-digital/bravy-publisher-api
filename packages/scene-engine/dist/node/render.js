/**
 * Render Node-only (skia-canvas) — coração do worker server. Node-only porque
 * importa skia + fontkit; o browser usa react-konva/canvas próprio. Mantém o
 * mesmo resolveScene + paintSlide do PoC → paridade com o export client.
 */
import { Canvas, FontLibrary } from 'skia-canvas';
import { resolveScene } from '../resolve.js';
import { paintSlide } from '../paint.js';
import { SEED_BRAND_KIT } from '../brand-kit.js';
import { loadSeedMetrics, seedFontsDir, seedSkiaFonts } from './fonts.js';
const metricsCache = new Map();
const registered = new Set();
function ensureFonts(dir) {
    if (!registered.has(dir)) {
        for (const [family, paths] of seedSkiaFonts(dir))
            FontLibrary.use(family, paths);
        registered.add(dir);
    }
    let m = metricsCache.get(dir);
    if (!m) {
        m = loadSeedMetrics(dir);
        metricsCache.set(dir, m);
    }
    return m;
}
/** Resolve o doc e rasteriza cada slide via skia. Determinístico (mesmas fontes). */
export function renderScenePng(doc, opts = {}) {
    const dir = opts.fontsDir ?? seedFontsDir();
    const metrics = ensureFonts(dir);
    const ratio = opts.pixelRatio ?? 2;
    const scene = resolveScene(doc, metrics, opts.brandKit ?? SEED_BRAND_KIT);
    return scene.slides.map((slide) => {
        const canvas = new Canvas(slide.width * ratio, slide.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        paintSlide(ctx, slide, metrics, opts.paint);
        return {
            index: slide.index,
            png: canvas.toBufferSync('png'),
            nodeCount: slide.nodes.length,
            width: slide.width * ratio,
            height: slide.height * ratio,
        };
    });
}
