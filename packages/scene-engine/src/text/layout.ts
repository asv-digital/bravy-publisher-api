/**
 * Posicionamento de texto rico (RFC §3.4): consome as linhas já quebradas por
 * linebreak.ts e resolve baseline compartilhada entre estilos mistos + x/align.
 * Coordenadas relativas à origem do bloco (0,0); o template aplica o offset.
 */
import type { ResolvedTextStyle } from '../scene.js';
import type { MetricsProvider } from './metrics.js';
import type { StyledRun } from './runs.js';
import { breakBlock, fitBlockLines, scaleStyle, type Line, type StyleResolver } from './linebreak.js';

export interface BlockSpec {
  runs: StyledRun[];
  width: number;
  styleOf: StyleResolver;
  align?: 'left' | 'center' | 'right';
}

export interface PlacedRun {
  text: string;
  style: ResolvedTextStyle;
  x: number;
  baselineY: number;
}

export interface LaidLine {
  runs: PlacedRun[];
  top: number;
  height: number;
  baselineY: number;
  width: number;
}

export interface LaidBlock {
  lines: LaidLine[];
  width: number;
  height: number;
  scale: number;
}

/** Posiciona linhas pré-quebradas: baseline (max ascent) + x por align + merge de runs contíguos. */
function positionLines(lines: Line[], spec: BlockSpec, metrics: MetricsProvider, scale: number): LaidBlock {
  const fallback = scaleStyle(spec.styleOf('ink'), scale);
  const out: LaidLine[] = [];
  let cursorY = 0;
  let maxWidth = 0;

  for (const line of lines) {
    if (line.length === 0) {
      const h = fallback.size * fallback.lineHeight;
      out.push({ runs: [], top: cursorY, height: h, baselineY: cursorY + fallback.size, width: 0 });
      cursorY += h;
      continue;
    }
    const lineW = line.reduce((s, p) => s + p.width, 0);
    const maxAscent = Math.max(...line.map((p) => metrics.measure('Mg', p.style).ascent));
    const lineH = Math.max(...line.map((p) => p.style.size * p.style.lineHeight));
    const baselineY = cursorY + maxAscent;
    const startX = spec.align === 'center' ? (spec.width - lineW) / 2 : spec.align === 'right' ? spec.width - lineW : 0;

    const placed: PlacedRun[] = [];
    let x = startX;
    for (const piece of line) {
      placed.push({ text: piece.text, style: piece.style, x, baselineY });
      x += piece.width;
    }
    // merge runs contíguos de mesmo estilo (mesma referência)
    const merged: PlacedRun[] = [];
    for (const pr of placed) {
      const last = merged[merged.length - 1];
      if (last && last.style === pr.style) last.text += pr.text;
      else merged.push({ ...pr });
    }
    out.push({ runs: merged, top: cursorY, height: lineH, baselineY, width: lineW });
    cursorY += lineH;
    maxWidth = Math.max(maxWidth, lineW);
  }

  return { lines: out, width: maxWidth, height: cursorY, scale };
}

/** Layout simples (sem auto-fit). */
export function layoutBlock(spec: BlockSpec, metrics: MetricsProvider): LaidBlock {
  const lines = breakBlock(spec.runs, spec.styleOf, metrics, spec.width, 1);
  return positionLines(lines, spec, metrics, 1);
}

/** Auto-fit (shrink-to-fit + reticências): garante height ≤ maxHeight. */
export function fitBlock(spec: BlockSpec, metrics: MetricsProvider, maxHeight: number, floor = 0.7): LaidBlock {
  const fit = fitBlockLines(spec.runs, spec.styleOf, metrics, spec.width, maxHeight, floor);
  return positionLines(fit.lines, spec, metrics, fit.scale);
}
