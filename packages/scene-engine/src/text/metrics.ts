/**
 * Métricas determinísticas via fontkit (RFC §3.2).
 * Mede pelo advanceWidth do ARQUIVO de fonte (mesmos bytes nos dois runtimes),
 * NUNCA por ctx.measureText. Garante quebra de linha idêntica client/server.
 * Suporta variable fonts (peso via getVariation) E famílias com arquivos
 * ESTÁTICOS por peso (caso Google Fonts) — escolhe o peso mais próximo.
 */
import type { ResolvedTextStyle } from '../scene.js';

export interface RunMetrics {
  width: number;
  ascent: number;
  descent: number;
  /** advance por caractere (já inclui letterSpacing após cada char, exceto o último). soma = width. */
  advances: number[];
}

export interface MetricsProvider {
  measure(text: string, style: ResolvedTextStyle): RunMetrics;
}

/** Uma fonte fontkit carregada. `variable` → resolve peso via getVariation;
 *  estática → `weight` identifica o arquivo (escolhe-se o mais próximo). */
export interface LoadedFont {
  font: any; // fontkit.Font
  variable: boolean;
  weight?: number;
}

const keyOf = (family: string, italic: boolean) => `${family}__${italic ? 'i' : 'n'}`;

export class FontkitMetrics implements MetricsProvider {
  private readonly fonts = new Map<string, LoadedFont[]>();
  private variationCache = new Map<string, any>();

  constructor(initial?: Map<string, LoadedFont | LoadedFont[]>) {
    if (initial) {
      for (const [k, v] of initial) this.fonts.set(k, Array.isArray(v) ? v : [v]);
    }
  }

  static fontKey = keyOf;

  /** registro incremental (fontes dinâmicas carregadas depois do boot). */
  register(family: string, italic: boolean, entry: LoadedFont): void {
    const k = keyOf(family, italic);
    const list = this.fonts.get(k) ?? [];
    list.push(entry);
    this.fonts.set(k, list);
  }

  has(family: string, italic: boolean): boolean {
    return this.fonts.has(keyOf(family, italic)) || this.fonts.has(keyOf(family, false));
  }

  private instance(style: ResolvedTextStyle): any {
    const list =
      this.fonts.get(keyOf(style.family, style.italic)) ?? this.fonts.get(keyOf(style.family, false));
    if (!list?.length) {
      throw new Error(`Fonte não registrada: ${style.family} (${style.italic ? 'italic' : 'normal'})`);
    }
    // estáticas por peso: escolhe a entrada de peso mais próximo
    let lf = list[0]!;
    if (list.length > 1) {
      lf = list.reduce((best, cur) =>
        Math.abs((cur.weight ?? 400) - style.weight) < Math.abs((best.weight ?? 400) - style.weight) ? cur : best,
      );
    }
    if (!lf.variable || typeof lf.font.getVariation !== 'function') return lf.font;
    const ck = `${keyOf(style.family, style.italic)}@${style.weight}`;
    let inst = this.variationCache.get(ck);
    if (!inst) {
      inst = lf.font.getVariation({ wght: style.weight });
      this.variationCache.set(ck, inst);
    }
    return inst;
  }

  measure(text: string, style: ResolvedTextStyle): RunMetrics {
    const font = this.instance(style);
    const upm: number = font.unitsPerEm || 1000;
    const scale = style.size / upm;
    const ls = style.letterSpacingEm * style.size;
    const chars = Array.from(text);
    const advances: number[] = [];
    let width = 0;
    for (let i = 0; i < chars.length; i++) {
      const cp = chars[i]!.codePointAt(0)!;
      let adv = 0;
      try {
        adv = font.glyphForCodePoint(cp).advanceWidth * scale;
      } catch {
        adv = font.glyphForCodePoint(0x20).advanceWidth * scale;
      }
      const withLs = adv + (i < chars.length - 1 ? ls : 0);
      advances.push(withLs);
      width += withLs;
    }
    return {
      width,
      ascent: (font.ascent / upm) * style.size,
      descent: (Math.abs(font.descent) / upm) * style.size,
      advances,
    };
  }
}
