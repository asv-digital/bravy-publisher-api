/**
 * Overrides (RFC §2.5–§2.7): aplica deltas esparsos do usuário sobre os nós
 * default do template e reconcilia o OverrideMap após regeneração.
 * Tudo validado: fill ∈ paleta, fontScale ∈ [0.5,2], frame clampeado ao slide.
 */
import type { NodeOverride, OverrideMap } from './doc.js';
import type { BrandPalette } from './brand-kit.js';
import type { SceneNode } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';
/** Sanitiza um override contra limites. Campos inválidos são descartados. */
export declare function validateOverride(ov: NodeOverride, _palette: BrandPalette): NodeOverride;
/**
 * Aplica os overrides do slide sobre os nós. Override ancora no container
 * semântico (RFC §2.4): glyphruns herdam via `node.container`.
 * Suporta: fill, hidden, translação (frame.x/y), fontScale em texto (escala
 * uniforme sobre a origem, §5.1) e rotation (âncora = centro da bbox do bloco).
 */
export declare function applyOverrides(nodes: SceneNode[], ov: OverrideMap | undefined, palette: BrandPalette, metrics?: MetricsProvider): SceneNode[];
export interface ReconcileResult {
    kept: OverrideMap;
    dropped: string[];
}
/**
 * Reconciliação pós-regeneração (RFC §2.7): mantém overrides cujo container
 * ainda existe na cena nova; descarta (e loga) os de containers que sumiram.
 */
export declare function reconcileOverrides(prev: OverrideMap | undefined, currentIds: Iterable<string>): ReconcileResult;
/** Conjunto de ids ancoráveis (containers + nós sem container) de uma lista de nós. */
export declare function anchorableIds(nodes: SceneNode[]): Set<string>;
