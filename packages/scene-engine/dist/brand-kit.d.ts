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
    display: FontRole;
    body: FontRole;
    mono: FontRole;
    accent: FontRole;
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
export declare const SEED_BRAND_KIT: BrandKit;
