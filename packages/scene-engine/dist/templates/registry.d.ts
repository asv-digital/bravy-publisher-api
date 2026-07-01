import type { ContentText, TemplateFamily } from '../doc.js';
import type { SceneNode } from '../scene.js';
import type { SlideRole } from '../ids.js';
import type { MetricsProvider } from '../text/metrics.js';
import type { Tokens } from '../tokens.js';
export interface BuildCtx {
    tokens: Tokens;
    metrics: MetricsProvider;
    /** tipografia por container (override do usuário) — aplicada ANTES do layout. */
    typo?: (containerId: string) => {
        family?: string;
        weight?: number;
    } | undefined;
}
export interface RawSlide {
    role: SlideRole;
    /** índice estável de origem (p/ ids/overrides); cover=0 conceitual. */
    sourceIndex: number;
    background: string;
    nodes: SceneNode[];
}
export interface TemplateProgram {
    family: TemplateFamily;
    build(content: ContentText, ctx: BuildCtx): RawSlide[];
}
export declare function registerTemplate(p: TemplateProgram): void;
export declare function getTemplate(family: TemplateFamily): TemplateProgram;
