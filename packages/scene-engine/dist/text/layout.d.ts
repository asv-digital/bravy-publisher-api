/**
 * Posicionamento de texto rico (RFC §3.4): consome as linhas já quebradas por
 * linebreak.ts e resolve baseline compartilhada entre estilos mistos + x/align.
 * Coordenadas relativas à origem do bloco (0,0); o template aplica o offset.
 */
import type { ResolvedTextStyle } from '../scene.js';
import type { MetricsProvider } from './metrics.js';
import type { StyledRun } from './runs.js';
import { type StyleResolver } from './linebreak.js';
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
/** Layout simples (sem auto-fit). */
export declare function layoutBlock(spec: BlockSpec, metrics: MetricsProvider): LaidBlock;
/** Auto-fit (shrink-to-fit + reticências): garante height ≤ maxHeight. */
export declare function fitBlock(spec: BlockSpec, metrics: MetricsProvider, maxHeight: number, floor?: number): LaidBlock;
