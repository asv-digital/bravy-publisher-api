import { FontkitMetrics } from '../text/metrics.js';
import { type SeedFontFile } from '../fonts-manifest.js';
/** Diretório das fontes bundladas no pacote (resolve do src OU do dist). */
export declare function seedFontsDir(): string;
export type SeedFontFiles = SeedFontFile;
export declare const SEED_FONT_FILES: SeedFontFile[];
export declare function loadSeedMetrics(fontsDir: string): FontkitMetrics;
/** lista (family, [paths]) p/ skia FontLibrary.use */
export declare function seedSkiaFonts(fontsDir: string): Array<[string, string[]]>;
