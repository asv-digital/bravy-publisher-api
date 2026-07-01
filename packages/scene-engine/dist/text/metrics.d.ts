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
    font: any;
    variable: boolean;
    weight?: number;
}
export declare class FontkitMetrics implements MetricsProvider {
    private readonly fonts;
    private variationCache;
    constructor(initial?: Map<string, LoadedFont | LoadedFont[]>);
    static fontKey: (family: string, italic: boolean) => string;
    /** registro incremental (fontes dinâmicas carregadas depois do boot). */
    register(family: string, italic: boolean, entry: LoadedFont): void;
    has(family: string, italic: boolean): boolean;
    private instance;
    measure(text: string, style: ResolvedTextStyle): RunMetrics;
}
