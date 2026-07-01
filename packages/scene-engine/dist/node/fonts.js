/**
 * Loader de fontes Node-only (POC + worker server). Browser não importa isto.
 * Lê os TTFs bundlados e monta o Map p/ FontkitMetrics. Também devolve os
 * caminhos p/ registrar no skia-canvas (FontLibrary.use).
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { FontkitMetrics } from '../text/metrics.js';
import { SEED_FONT_MANIFEST } from '../fonts-manifest.js';
/** Diretório das fontes bundladas no pacote (resolve do src OU do dist). */
export function seedFontsDir() {
    return fileURLToPath(new URL('../../fonts', import.meta.url));
}
export const SEED_FONT_FILES = SEED_FONT_MANIFEST;
export function loadSeedMetrics(fontsDir) {
    const map = new Map();
    for (const f of SEED_FONT_FILES) {
        const font = fontkit.openSync(join(fontsDir, f.file));
        map.set(FontkitMetrics.fontKey(f.family, f.italic), { font, variable: f.variable });
    }
    return new FontkitMetrics(map);
}
/** lista (family, [paths]) p/ skia FontLibrary.use */
export function seedSkiaFonts(fontsDir) {
    const byFamily = new Map();
    for (const f of SEED_FONT_FILES) {
        const arr = byFamily.get(f.family) ?? [];
        arr.push(join(fontsDir, f.file));
        byFamily.set(f.family, arr);
    }
    return [...byFamily.entries()];
}
