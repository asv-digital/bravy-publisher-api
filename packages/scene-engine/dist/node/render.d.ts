import { type PaintOptions } from '../paint.js';
import { type BrandKit } from '../brand-kit.js';
import type { DesignDocument } from '../doc.js';
export interface RenderedSlide {
    index: number;
    png: Buffer;
    nodeCount: number;
    width: number;
    height: number;
}
export interface RenderSceneOptions {
    brandKit?: BrandKit;
    /** fator de escala do PNG (deviceScaleFactor). default 2 → 2160². */
    pixelRatio?: number;
    fontsDir?: string;
    paint?: PaintOptions;
}
/** Resolve o doc e rasteriza cada slide via skia. Determinístico (mesmas fontes). */
export declare function renderScenePng(doc: DesignDocument, opts?: RenderSceneOptions): RenderedSlide[];
