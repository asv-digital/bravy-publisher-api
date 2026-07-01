/**
 * ContentText → StyledRun[] (RFC §3.1).
 * Headline já vem segmentada (top/em/bottom). Campos com markup inline
 * (<em>, <strong>, .strong, .keyword, <code>, .cmd) passam por um parser
 * tolerante: markup malformado degrada pra texto puro (nunca quebra).
 * Decorações ORTOGONAIS à chave semântica: <u> (sublinhado),
 * <span data-c="#hex"> (cor do texto) e <span data-bg="#hex"> (destaque).
 */
export type StyleKey = 'ink' | 'em' | 'strong' | 'code' | 'keyword';
export interface StyledRun {
    text: string;
    key: StyleKey;
    /** sublinhado (decoração de pintura; não afeta métricas). */
    underline?: boolean;
    /** cor do texto (hex) — sobrepõe o fill resolvido da chave. */
    color?: string;
    /** cor de destaque atrás do texto (hex). */
    bg?: string;
}
/** Parser inline tolerante → runs. */
export declare function parseInline(input: string, base?: StyleKey): StyledRun[];
/** Headline 3-partes → runs (top ink · em accent · bottom ink). */
export declare function headlineRuns(top?: string, em?: string, bottom?: string): StyledRun[];
