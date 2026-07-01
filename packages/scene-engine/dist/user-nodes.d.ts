/**
 * Materializa elementos adicionados pelo usuário (UserNode) em SceneNodes.
 * Texto passa pelo MESMO layout engine (papel do kit → família com métricas
 * garantidas nos dois runtimes). Ordem no array = ordem de pintura, em duas
 * bandas de z: acima do template (base 1000) ou, com behind=true, atrás de
 * todo o template (base -1000 — acima só do fundo do slide).
 */
import type { UserNode } from './doc.js';
import type { SceneNode } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';
import type { Tokens } from './tokens.js';
export declare function materializeUserNodes(added: UserNode[] | undefined, tokens: Tokens, metrics: MetricsProvider): SceneNode[];
/** Altura real do bloco de texto de um UserTextNode (p/ caixa de seleção). */
export declare function measureUserText(node: Extract<UserNode, {
    kind: 'text';
}>, tokens: Tokens, metrics: MetricsProvider): number;
