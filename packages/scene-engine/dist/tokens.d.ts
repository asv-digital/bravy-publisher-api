/**
 * resolveTokens(brandKit) — converte o Brand Kit do tenant numa API estável
 * que os templates consomem por PAPEL e por TOKEN DE COR nomeado (RFC §13.2).
 * Nenhum hex/família literal vive nos templates.
 */
import type { BrandKit, BrandPalette } from './brand-kit.js';
export type ColorToken = keyof BrandPalette;
export type RoleName = 'display' | 'body' | 'mono' | 'accent';
export interface FontSpec {
    family: string;
    weight: number;
    italic: boolean;
}
export interface Tokens {
    color(token: ColorToken): string;
    /** resolve uma família por papel, com peso clampeado aos disponíveis. */
    font(role: RoleName, weight?: number): FontSpec;
    brand: BrandKit['brand'];
    kit: BrandKit;
}
export declare function resolveTokens(kit: BrandKit): Tokens;
