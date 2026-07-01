/**
 * IDs de nó estáveis e semânticos (RFC §2.4). Override só sobrevive a
 * regeneração porque o id ancora no container semântico, não no índice visual.
 */
import type { NodeId } from './scene.js';
export type SlideRole = 'cover' | 'body' | 'cta';
/** prefixo do slide: cover/cta são únicos; body usa índice estável de origem. */
export declare function slidePrefix(role: SlideRole, index: number): string;
export declare function nid(prefix: string, path: string): NodeId;
