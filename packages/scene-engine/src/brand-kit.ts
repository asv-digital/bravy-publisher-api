/**
 * Brand Kit — style guide POR TENANT (RFC §13).
 * Os tokens NÃO são hardcoded no engine: vêm daqui. O kit editorial JP.ASV
 * é apenas o SEED default (extraído de backend/render/template-engine.css.ts).
 */

export type FontSource = 'bundled' | 'google' | 'upload';

export interface FontRole {
  family: string;
  weights: number[];
  style: 'normal' | 'italic';
  source: FontSource;
}

export interface BrandTypography {
  display: FontRole; // headline / títulos grandes
  body: FontRole; // corpo, bullets, parágrafos
  mono: FontRole; // labels, topbar, footer
  accent: FontRole; // ênfase (serif itálico)
}

/** Tokens de cor nomeados — semânticos, não literais. */
export interface BrandPalette {
  bg: string;
  bg2: string;
  bgRose: string;
  cardBg: string;
  ink: string;
  inkSoft: string;
  muted: string;
  accent: string;
  accentSoft: string;
  line: string;
  // superfície "terminal" (família compendium)
  termBg: string;
  termText: string;
  termMuted: string;
  termStrong: string;
  termPill: string;
  termPillBorder: string;
}

export interface BrandStrings {
  handle: string;
  breadcrumb: string;
  ctaKeyword: string;
  logoGlyph: string;
  /**
   * Foto de perfil exibida no avatar (template "tweet"). Quando ausente, o card
   * cai no placeholder circular com o logoGlyph. Populada dinamicamente a partir
   * do canal social conectado (não é um campo editável da aba Marca).
   */
  avatarUrl?: string;
}

export interface BrandKit {
  id: string;
  tenantId: string;
  version: number;
  typography: BrandTypography;
  palette: BrandPalette;
  brand: BrandStrings;
}

/** SEED — kit editorial JP.ASV / Claude Code BR. Default p/ novos tenants. */
export const SEED_BRAND_KIT: BrandKit = {
  id: 'seed-editorial',
  tenantId: 'seed',
  version: 1,
  typography: {
    display: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800], style: 'normal', source: 'bundled' },
    body: { family: 'Plus Jakarta Sans', weights: [400, 500, 700], style: 'normal', source: 'bundled' },
    mono: { family: 'JetBrains Mono', weights: [400, 500, 600], style: 'normal', source: 'bundled' },
    accent: { family: 'DM Serif Display', weights: [400], style: 'italic', source: 'bundled' },
  },
  palette: {
    bg: '#F2EBE0',
    bg2: '#E8E0D2',
    bgRose: '#EBDAC8',
    cardBg: '#FAF6ED',
    ink: '#1A1815',
    inkSoft: '#3A3530',
    muted: '#8A8275',
    accent: '#C7634F',
    accentSoft: '#D9785F',
    line: '#C9BFA9',
    termBg: '#1F1D1A',
    termText: '#E5DFD0',
    termMuted: '#9C9586',
    termStrong: '#FFFFFF',
    termPill: '#2D2A26',
    termPillBorder: '#3A3631',
  },
  brand: {
    handle: '@JP.ASV',
    breadcrumb: 'CLAUDE CODE BR',
    ctaKeyword: 'hoje',
    logoGlyph: '✻',
  },
};
