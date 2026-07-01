/**
 * Design Document — fonte de verdade PERSISTIDA (RFC §2).
 * = ContentText (texto, regenerável) + TemplateRef + OverrideMap (deltas) +
 *   ponteiros de Brand Kit. resolveScene() o transforma em SceneGraph.
 */
import type { NodeId, Rect } from './scene.js';
import type { RoleName } from './tokens.js';
export type TemplateFamily = 'step' | 'compendium' | 'tweet' | 'custom';
export type SlotType = 'headline' | 'subtitle' | 'body' | 'bullets' | 'image' | 'cta' | 'label';
export interface LayoutSlot {
    id: string;
    type: SlotType;
    /** caixa do slot em design px (dentro do canvas width×height). */
    frame: import('./scene.js').Rect;
    align?: 'left' | 'center' | 'right';
    /** papel tipográfico do Brand Kit (default decidido pelo tipo). */
    role?: 'display' | 'body' | 'mono' | 'accent';
    /** tamanho base da fonte em px (auto-fit dentro do frame). */
    size?: number;
}
export interface LayoutSpec {
    /** post único (1 slide) ou molde aplicado a cada slide do carrossel. */
    kind: 'post' | 'carousel';
    width: number;
    height: number;
    /** token de cor de fundo do canvas. */
    background: import('./tokens.js').ColorToken;
    slots: LayoutSlot[];
}
export interface SlideImage {
    enabled: boolean;
    role: 'figure' | 'background';
    prompt: string;
    model: 'nano-banana' | 'gpt-5.5-image';
    seed?: number;
    focal?: {
        x: number;
        y: number;
    };
    treatment?: 'duotone' | 'grain' | 'none';
    status: 'idle' | 'queued' | 'generating' | 'ready' | 'failed';
    assetUrl?: string;
    assetKey?: string;
    width?: number;
    height?: number;
    lastError?: string;
}
export interface CardText {
    label?: string;
    icon?: string;
    title?: string;
    body?: string;
    highlight?: boolean;
}
export interface SlideText {
    labelTopo?: string;
    tag?: string;
    headlineTop?: string;
    headlineEm?: string;
    headlineBottom?: string;
    paragraphs?: string[];
    list?: string[];
    stats?: Array<[string, string]>;
    cards?: CardText[];
    callout?: string;
    image?: SlideImage;
}
export interface ContentText {
    slug: string;
    template: TemplateFamily;
    persona?: string;
    labelTopoCapa?: string;
    labelCapa?: string;
    hookCapa: string;
    slides: SlideText[];
    ctaLabelTopo?: string;
    ctaLabel?: string;
    ctaText?: string;
    ctaSub?: string;
    caption?: string;
}
export interface NodeOverride {
    frame?: Partial<Rect>;
    rotation?: number;
    fill?: string;
    fontScale?: number;
    hidden?: boolean;
    /** opacidade do bloco (0.05–1). */
    opacity?: number;
    /** tipografia do container (re-layout no template — reflow real). */
    family?: string;
    weight?: number;
}
export type OverrideMap = Record<NodeId, NodeOverride>;
export interface UserTextNode {
    kind: 'text';
    id: string;
    frame: Rect;
    /** aceita markup inline (parseInline): <em>/<strong>/<u>/<span data-c|data-bg>. */
    text: string;
    /** papel tipográfico do Brand Kit → família com métricas garantidas. */
    role?: 'display' | 'body' | 'mono' | 'accent';
    /** família explícita (ex.: Google Fonts) — quando presente, ignora o papel.
     *  Precisa estar registrada nas métricas; quem resolve faz fallback se não. */
    family?: string;
    weight?: number;
    italic?: boolean;
    size: number;
    fill: string;
    align?: 'left' | 'center' | 'right';
    lineHeight?: number;
    opacity?: number;
    rotation?: number;
    behind?: boolean;
}
export interface UserShapeNode {
    kind: 'rect' | 'ellipse';
    id: string;
    frame: Rect;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    radius?: number;
    opacity?: number;
    rotation?: number;
    behind?: boolean;
}
export interface UserLineNode {
    kind: 'line';
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke: string;
    strokeWidth: number;
    opacity?: number;
    behind?: boolean;
}
export interface UserImageNode {
    kind: 'image';
    id: string;
    frame: Rect;
    src: string;
    fit?: 'cover' | 'contain';
    radius?: number;
    opacity?: number;
    rotation?: number;
    behind?: boolean;
}
export type UserNode = UserTextNode | UserShapeNode | UserLineNode | UserImageNode;
export interface TypographyOverride {
    display?: {
        family: string;
        weights: number[];
        style: 'normal' | 'italic';
    };
    body?: {
        family: string;
        weights: number[];
        style: 'normal' | 'italic';
    };
}
export interface DesignDocument {
    schemaVersion: number;
    content: ContentText;
    /** overrides esparsos por índice de slide → por nodeId. */
    overrides?: Record<number, OverrideMap>;
    /** elementos adicionados pelo usuário, por índice de slide (ordem = z). */
    added?: Record<number, UserNode[]>;
    brandKitId?: string;
    brandKitVersion?: number;
    typographyOverride?: Partial<Record<RoleName, TypographyOverride['display']>>;
    /** layout do template custom (quando content.template === 'custom'). */
    layout?: LayoutSpec;
}
export declare const CURRENT_SCHEMA_VERSION = 1;
