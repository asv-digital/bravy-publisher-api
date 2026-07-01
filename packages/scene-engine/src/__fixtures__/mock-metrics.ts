/**
 * MetricsProvider determinístico SEM fontes — para testes de unidade de
 * quebra/posicionamento. Largura proporcional ao nº de chars e ao size;
 * ascent/descent fixos. Não depende de fontkit nem de arquivos.
 */
import type { ResolvedTextStyle } from '../scene.js';
import type { MetricsProvider, RunMetrics } from '../text/metrics.js';

export class MockMetrics implements MetricsProvider {
  constructor(private readonly perChar = 0.55) {}

  measure(text: string, style: ResolvedTextStyle): RunMetrics {
    const chars = Array.from(text);
    const ls = style.letterSpacingEm * style.size;
    const advances: number[] = [];
    let width = 0;
    for (let i = 0; i < chars.length; i++) {
      const base = (chars[i] === ' ' ? 0.4 : this.perChar) * style.size;
      const adv = base + (i < chars.length - 1 ? ls : 0);
      advances.push(adv);
      width += adv;
    }
    return { width, ascent: style.size * 0.8, descent: style.size * 0.2, advances };
  }
}
