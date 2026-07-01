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

export const SEED_FONT_MANIFEST: SeedFontFile[] = [
  { family: 'Plus Jakarta Sans', italic: false, file: 'PlusJakartaSans.ttf', variable: true },
  { family: 'JetBrains Mono', italic: false, file: 'JetBrainsMono.ttf', variable: true },
  { family: 'DM Serif Display', italic: false, file: 'DMSerifDisplay-Regular.ttf', variable: false },
  { family: 'DM Serif Display', italic: true, file: 'DMSerifDisplay-Italic.ttf', variable: false },
];
