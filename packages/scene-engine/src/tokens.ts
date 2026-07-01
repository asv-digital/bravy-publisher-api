/**
 * resolveTokens(brandKit) — converte o Brand Kit do tenant numa API estável
 * que os templates consomem por PAPEL e por TOKEN DE COR nomeado (RFC §13.2).
 * Nenhum hex/família literal vive nos templates.
 */
import type { BrandKit, BrandPalette, FontRole } from './brand-kit.js';

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

function nearestWeight(role: FontRole, want: number): number {
  if (role.weights.includes(want)) return want;
  return role.weights.reduce((best, w) =>
    Math.abs(w - want) < Math.abs(best - want) ? w : best,
  role.weights[0] ?? 400);
}

export function resolveTokens(kit: BrandKit): Tokens {
  return {
    color: (token) => kit.palette[token],
    font: (role, weight) => {
      const r = kit.typography[role];
      return {
        family: r.family,
        weight: nearestWeight(r, weight ?? r.weights[0] ?? 400),
        italic: r.style === 'italic',
      };
    },
    brand: kit.brand,
    kit,
  };
}
