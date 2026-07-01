/**
 * Manifesto das fontes do seed — DADO PURO, sem deps de Node/DOM, importável
 * dos dois runtimes. O loader Node (node/fonts.ts) e o loader browser
 * (frontend) consomem a mesma lista → mesmos bytes → métricas idênticas (§3.2).
 */
export interface SeedFontFile {
    family: string;
    italic: boolean;
    file: string;
    variable: boolean;
}
export declare const SEED_FONT_MANIFEST: SeedFontFile[];
