/**
 * Quebra de linha gulosa + auto-fit (RFC §3.3). PURO: não posiciona em x/y,
 * só decide ONDE as linhas quebram e em QUAL escala o bloco cabe. O
 * posicionamento (baseline/x/align) vive em layout.ts. Determinístico porque
 * mede via MetricsProvider (fontkit), nunca via render.
 */
import type { ResolvedTextStyle } from '../scene.js';
import type { MetricsProvider } from './metrics.js';
import type { StyleKey, StyledRun } from './runs.js';
export interface Piece {
    text: string;
    key: StyleKey;
    style: ResolvedTextStyle;
    width: number;
    isSpace: boolean;
}
/** Uma linha já quebrada — sequência de pieces (pode misturar estilos). */
export type Line = Piece[];
export type StyleResolver = (key: StyleKey) => ResolvedTextStyle;
export declare function scaleStyle(s: ResolvedTextStyle, scale: number): ResolvedTextStyle;
/** runs → parágrafos de pieces (split por '\n' explícito, espaços viram tokens). */
export declare function tokenize(runs: StyledRun[], styleOf: StyleResolver, metrics: MetricsProvider, scale: number): Piece[][];
/** Quebra gulosa de UM parágrafo numa caixa de largura W. Mantém o estilo por piece. */
export declare function breakParagraph(para: Piece[], width: number): Line[];
/** Bloco inteiro (todos os parágrafos) quebrado em linhas, preservando linhas em branco. */
export declare function breakBlock(runs: StyledRun[], styleOf: StyleResolver, metrics: MetricsProvider, width: number, scale?: number): Line[];
/** Altura em px de uma linha (max do lineHeight dos pieces; fallback p/ linha vazia). */
export declare function lineHeightPx(line: Line, fallback: ResolvedTextStyle): number;
/** Altura total do bloco quebrado. */
export declare function blockHeight(lines: Line[], fallback: ResolvedTextStyle): number;
export interface FitResult {
    lines: Line[];
    scale: number;
    truncated: boolean;
}
/**
 * Auto-fit (shrink-to-fit): busca binária em escala [floor,1] até o bloco
 * caber em maxHeight. Se nem no floor couber, trunca linhas excedentes e
 * coloca reticências na última linha visível — GARANTE que não estoura a caixa.
 */
export declare function fitBlockLines(runs: StyledRun[], styleOf: StyleResolver, metrics: MetricsProvider, width: number, maxHeight: number, floor: number, fallbackKey?: StyleKey): FitResult;
