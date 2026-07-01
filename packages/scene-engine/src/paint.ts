/**
 * Painter 2D agnóstico (RFC §4) — desenha um SceneSlide em qualquer
 * CanvasRenderingContext2D (skia-canvas no Node, canvas do browser no export).
 * Texto é desenhado GLIFO-A-GLIFO nas posições do fontkit → paridade total.
 */
import type { GlyphRunNode, SceneNode, SceneSlide } from './scene.js';
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

function fontString(style: GlyphRunNode['style']): string {
  return `${style.italic ? 'italic ' : ''}${style.weight} ${style.size}px "${style.family}"`;
}

function pathRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r?: number): void {
  ctx.beginPath();
  if (r && r > 0) {
    // path manual (arcTo) em vez de ctx.roundRect: o roundRect do skia-canvas
    // ignora o transform corrente (rotação) — primitivos respeitam o CTM.
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo!(x + w, y, x + w, y + h, rr);
    ctx.arcTo!(x + w, y + h, x, y + h, rr);
    ctx.arcTo!(x, y + h, x, y, rr);
    ctx.arcTo!(x, y, x + w, y, rr);
    ctx.closePath?.();
  } else {
    ctx.rect(x, y, w, h);
  }
}

export function paintSlide(
  ctx: Ctx2D,
  slide: SceneSlide,
  metrics: MetricsProvider,
  opts: PaintOptions = {},
): void {
  // fundo
  ctx.fillStyle = slide.background;
  ctx.fillRect(0, 0, slide.width, slide.height);

  const nodes = [...slide.nodes].sort((a, b) => a.z - b.z);
  for (const node of nodes) {
    if (node.opacity === 0) continue;
    const partial = node.opacity != null && node.opacity < 1;
    const rotated = !!node.rotation && typeof ctx.translate === 'function' && typeof ctx.rotate === 'function';
    if (partial || rotated) {
      ctx.save();
      if (partial && 'globalAlpha' in ctx) ctx.globalAlpha = node.opacity!;
      if (rotated) {
        const c = node.rotationCenter ?? centerOf(node);
        ctx.translate!(c.x, c.y);
        ctx.rotate!((node.rotation! * Math.PI) / 180);
        ctx.translate!(-c.x, -c.y);
      }
    }
    paintNode(ctx, node, metrics, opts);
    if (partial || rotated) ctx.restore();
  }
}

function centerOf(node: SceneNode): { x: number; y: number } {
  switch (node.type) {
    case 'line':
      return { x: (node.x1 + node.x2) / 2, y: (node.y1 + node.y2) / 2 };
    case 'glyphrun':
      return { x: node.x, y: node.baselineY };
    default:
      return { x: node.frame.x + node.frame.w / 2, y: node.frame.y + node.frame.h / 2 };
  }
}

function paintNode(ctx: Ctx2D, node: SceneNode, metrics: MetricsProvider, opts: PaintOptions): void {
  switch (node.type) {
    case 'rect': {
      pathRect(ctx, node.frame.x, node.frame.y, node.frame.w, node.frame.h, node.radius);
      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill();
      }
      if (node.stroke && node.strokeWidth) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'ellipse': {
      const { x, y, w, h } = node.frame;
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h); // fallback improvável
      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill();
      }
      if (node.stroke && node.strokeWidth) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(node.x1, node.y1);
      ctx.lineTo(node.x2, node.y2);
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node.strokeWidth;
      ctx.stroke();
      break;
    }
    case 'glyphrun': {
      ctx.font = fontString(node.style);
      ctx.textBaseline = 'alphabetic';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; // posicionamento é nosso
      const m = metrics.measure(node.text, node.style);
      // destaque (cor de fundo) atrás do texto — cobre ascent+descent com folga
      if (node.style.bg) {
        const pad = node.style.size * 0.08;
        ctx.fillStyle = node.style.bg;
        ctx.fillRect(node.x - pad, node.baselineY - m.ascent - pad, m.width + pad * 2, m.ascent + m.descent + pad * 2);
      }
      ctx.fillStyle = node.style.fill;
      const chars = Array.from(node.text);
      let x = node.x;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]!;
        if (ch !== ' ') ctx.fillText(ch, x, node.baselineY);
        x += m.advances[i] ?? 0;
      }
      // sublinhado — espessura/offset proporcionais ao corpo
      if (node.style.underline) {
        const th = Math.max(1.5, node.style.size / 16);
        ctx.fillRect(node.x, node.baselineY + Math.max(2, node.style.size * 0.1), m.width, th);
      }
      break;
    }
    case 'image': {
      const img = opts.resolveImage?.(node.src);
      ctx.save();
      pathRect(ctx, node.frame.x, node.frame.y, node.frame.w, node.frame.h, node.radius);
      ctx.clip();
      if (img) drawCover(ctx, img, node.frame, node.fit, node.focal);
      else {
        ctx.fillStyle = '#ddd6c8';
        ctx.fill();
      }
      ctx.restore();
      break;
    }
  }
}

function drawCover(
  ctx: Ctx2D,
  img: any,
  frame: { x: number; y: number; w: number; h: number },
  fit: 'cover' | 'contain',
  focal?: { x: number; y: number },
): void {
  const iw = img.width ?? frame.w;
  const ih = img.height ?? frame.h;
  const scale = fit === 'cover' ? Math.max(frame.w / iw, frame.h / ih) : Math.min(frame.w / iw, frame.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const fx = focal?.x ?? 0.5;
  const fy = focal?.y ?? 0.5;
  const dx = frame.x + (frame.w - dw) * fx;
  const dy = frame.y + (frame.h - dh) * fy;
  ctx.drawImage(img, dx, dy, dw, dh);
}
