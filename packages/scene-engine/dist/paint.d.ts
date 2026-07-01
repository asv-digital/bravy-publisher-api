/**
 * Painter 2D agnóstico (RFC §4) — desenha um SceneSlide em qualquer
 * CanvasRenderingContext2D (skia-canvas no Node, canvas do browser no export).
 * Texto é desenhado GLIFO-A-GLIFO nas posições do fontkit → paridade total.
 */
import type { SceneSlide } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';
export interface Ctx2D {
    save(): void;
    restore(): void;
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    font: string;
    textBaseline: string;
    letterSpacing?: string;
    globalAlpha?: number;
    translate?(x: number, y: number): void;
    rotate?(rad: number): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arcTo?(x1: number, y1: number, x2: number, y2: number, r: number): void;
    closePath?(): void;
    ellipse?(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
    stroke(): void;
    fill(): void;
    fillText(t: string, x: number, y: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect?(x: number, y: number, w: number, h: number, r: number | number[]): void;
    clip(): void;
    drawImage(img: unknown, dx: number, dy: number, dw: number, dh: number): void;
    drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}
export interface PaintOptions {
    /** resolve um src de imagem (url/path) num objeto desenhável (Image/Bitmap). */
    resolveImage?: (src: string) => unknown | undefined;
}
export declare function paintSlide(ctx: Ctx2D, slide: SceneSlide, metrics: MetricsProvider, opts?: PaintOptions): void;
