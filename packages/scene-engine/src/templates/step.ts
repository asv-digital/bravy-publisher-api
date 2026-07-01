/**
 * Template "step" — port 1:1 de backend/render/template-engine.ts (+ CSS).
 * Emite SceneNode[] em fluxo vertical no design space 1080². Cover / body / CTA.
 */
import type { ContentText, SlideText } from '../doc.js';
import { nid, slidePrefix } from '../ids.js';
import type { GlyphRunNode, RectNode, ResolvedTextStyle, SceneNode } from '../scene.js';
import { headlineRuns, parseInline, type StyleKey, type StyledRun } from '../text/runs.js';
import { fitBlock, layoutBlock, type BlockSpec, type LaidBlock } from '../text/layout.js';
import type { Tokens, RoleName, ColorToken } from '../tokens.js';
import type { BuildCtx, RawSlide, TemplateProgram } from './registry.js';

const W = 1080;
const H = 1080;
const PADX = 96;
const PADY = 88;
const CX = PADX;
const CW = W - 2 * PADX; // 888

interface StyleOpts {
  ls?: number;
  lh?: number;
  italic?: boolean;
}

function st(tokens: Tokens, role: RoleName, weight: number, size: number, fill: ColorToken, o: StyleOpts = {}): ResolvedTextStyle {
  const f = tokens.font(role, weight);
  return {
    family: f.family,
    weight: f.weight,
    italic: o.italic ?? f.italic,
    size,
    fill: tokens.color(fill),
    letterSpacingEm: o.ls ?? 0,
    lineHeight: o.lh ?? 1.2,
  };
}

let Z = 0;
const nextZ = () => ++Z;

function pushBlock(nodes: SceneNode[], prefix: string, path: string, block: LaidBlock, x: number, y: number, z: number): number {
  let li = 0;
  for (const line of block.lines) {
    let ri = 0;
    for (const r of line.runs) {
      const node: GlyphRunNode = {
        type: 'glyphrun',
        id: nid(prefix, `${path}.l${li}r${ri}`),
        container: nid(prefix, path),
        z,
        x: x + r.x,
        baselineY: y + r.baselineY,
        text: r.text,
        style: r.style,
      };
      nodes.push(node);
      ri++;
    }
    li++;
  }
  return block.height;
}

function rect(id: string, x: number, y: number, w: number, h: number, fill: string, opts: Partial<RectNode> = {}): RectNode {
  return { type: 'rect', id, z: opts.z ?? 1, frame: { x, y, w, h }, fill, ...opts };
}

/** colchetes nos 4 cantos. */
function corners(nodes: SceneNode[], prefix: string, color: string): void {
  const inset = 32;
  const len = 36;
  const th = 1.5;
  const z = 1;
  const set = [
    [inset, inset, 1, 1],
    [W - inset - len, inset, -1, 1],
    [inset, H - inset - len, 1, -1],
    [W - inset - len, H - inset - len, -1, -1],
  ] as const;
  let i = 0;
  for (const [bx, by, , vy] of set) {
    nodes.push(rect(nid(prefix, `corner${i}.h`), bx, vy > 0 ? by : by + len - th, len, th, color, { z }));
    nodes.push(rect(nid(prefix, `corner${i}.v`), bx, by, th, len, color, { z }));
    i++;
  }
}

function topbar(nodes: SceneNode[], ctx: BuildCtx, prefix: string, stepLabel: string, pageNo: string, color: ColorToken, accentColor: ColorToken): void {
  const { tokens, metrics } = ctx;
  const baseY = PADY + 20;
  const labelStyle = st(tokens, 'display', 600, 18, accentColor, { ls: 0.16 });
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'topbar.step'), z: 10, x: CX, baselineY: baseY, text: stepLabel.toUpperCase(), style: labelStyle });
  const pageStyle = st(tokens, 'mono', 600, 16, color, { ls: 0.06 });
  const pw = metrics.measure(pageNo, pageStyle).width;
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'topbar.page'), z: 10, x: W - PADX - pw, baselineY: baseY, text: pageNo, style: pageStyle });
}

function footer(nodes: SceneNode[], ctx: BuildCtx, prefix: string, handleRight: string, lineColor: ColorToken, textColor: ColorToken, handleColor: ColorToken): void {
  const { tokens, metrics } = ctx;
  const lineY = H - PADY - 52;
  nodes.push(rect(nid(prefix, 'footer.line'), CX, lineY, CW, 1, tokens.color(lineColor), { z: 5 }));
  const baseY = H - PADY - 14;
  const left = st(tokens, 'mono', 500, 15, textColor, { ls: 0.12 });
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'footer.brand'), z: 10, x: CX, baselineY: baseY, text: `${tokens.brand.handle} · ${tokens.brand.breadcrumb}`, style: left });
  const right = st(tokens, 'mono', 600, 15, handleColor, { ls: 0.12 });
  const rw = metrics.measure(handleRight, right).width;
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'footer.handle'), z: 10, x: W - PADX - rw, baselineY: baseY, text: handleRight, style: right });
}

function bgNum(nodes: SceneNode[], ctx: BuildCtx, prefix: string, page: number): void {
  const { tokens, metrics } = ctx;
  const style = st(tokens, 'accent', 400, 280, 'accent', { italic: true, lh: 0.85 });
  const txt = String(page).padStart(2, '0');
  const m = metrics.measure(txt, style);
  nodes.push({
    type: 'glyphrun',
    id: nid(prefix, 'decoration.bgnum'),
    z: 0,
    opacity: 0.1,
    x: W - 104 - m.width,
    baselineY: 96 + m.ascent,
    text: txt,
    style,
  });
}

// ---- style resolvers por contexto ----
function headlineStyleOf(tokens: Tokens, size: number, inkTok: ColorToken): (k: StyleKey) => ResolvedTextStyle {
  return (k) => {
    switch (k) {
      case 'em': return st(tokens, 'accent', 400, size * 0.96, 'accent', { ls: -0.02, lh: 1.04, italic: true });
      case 'code': return st(tokens, 'mono', 500, size * 0.9, 'accent', { lh: 1.04 });
      case 'keyword': return st(tokens, 'mono', 500, size * 0.78, 'accent', { lh: 1.04 });
      default: return st(tokens, 'display', 800, size, inkTok, { ls: -0.025, lh: 1.04 });
    }
  };
}
function bodyStyleOf(tokens: Tokens, size = 34): (k: StyleKey) => ResolvedTextStyle {
  return (k) => {
    switch (k) {
      case 'strong': return st(tokens, 'body', 700, size, 'ink', { ls: -0.005, lh: 1.32 });
      case 'em': return st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: 1.32 });
      case 'code': return st(tokens, 'mono', 500, size * 0.94, 'accent', { lh: 1.32 });
      case 'keyword': return st(tokens, 'mono', 500, size * 0.94, 'accent', { lh: 1.32 });
      default: return st(tokens, 'body', 400, size, 'inkSoft', { ls: -0.005, lh: 1.32 });
    }
  };
}

function spec(runs: StyledRun[], width: number, styleOf: (k: StyleKey) => ResolvedTextStyle, align?: BlockSpec['align']): BlockSpec {
  return { runs, width, styleOf, align };
}

/** aplica o override de tipografia do container ANTES do layout (reflow real). */
function typed(ctx: BuildCtx, containerId: string, styleOf: (k: StyleKey) => ResolvedTextStyle): (k: StyleKey) => ResolvedTextStyle {
  const t = ctx.typo?.(containerId);
  if (!t) return styleOf;
  return (k) => {
    const s = styleOf(k);
    return { ...s, family: t.family ?? s.family, weight: t.weight ?? s.weight, italic: t.family ? false : s.italic };
  };
}

// ---------------- BODY ----------------
function buildBody(slide: SlideText, sourceIndex: number, page: number, totalPages: number, ctx: BuildCtx): RawSlide {
  const { tokens, metrics } = ctx;
  const prefix = slidePrefix('body', sourceIndex);
  const nodes: SceneNode[] = [];
  corners(nodes, prefix, tokens.color('ink'));
  bgNum(nodes, ctx, prefix, page);
  const stepNum = String(page - 1).padStart(2, '0');
  topbar(nodes, ctx, prefix, `STEP ${stepNum}`, `${String(page).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, 'ink', 'accent');

  let cursor = PADY + 22 + 48;

  if (slide.tag) {
    const kicker = st(tokens, 'display', 600, 18, 'accent', { ls: 0.16 });
    const b = layoutBlock(spec([{ text: slide.tag.toUpperCase(), key: 'ink' }], CW, () => kicker), metrics);
    cursor += pushBlock(nodes, prefix, 'kicker', b, CX, cursor, 10);
    cursor += 24;
  }

  // headline
  const hlRuns = headlineRuns(slide.headlineTop, slide.headlineEm, slide.headlineBottom);
  if (hlRuns.some((r) => r.text.trim())) {
    const hb = fitBlock(spec(hlRuns, CW, typed(ctx, nid(prefix, 'headline'), headlineStyleOf(tokens, 78, 'ink'))), metrics, 360, 0.72);
    cursor += pushBlock(nodes, prefix, 'headline', hb, CX, cursor, 10);
    cursor += 36;
    nodes.push(rect(nid(prefix, 'underline'), CX, cursor, 96, 4, tokens.color('accent'), { z: 5, radius: 2 }));
    cursor += 4 + 36;
  }

  // body variant
  if (slide.list || slide.paragraphs) {
    const items = slide.list ?? slide.paragraphs ?? [];
    const styleOf = bodyStyleOf(tokens, 34);
    for (let i = 0; i < items.length; i++) {
      const runs = parseInline(items[i]!);
      const b = layoutBlock(spec(runs, CW - 42, typed(ctx, nid(prefix, `body.bullet[${i}]`), styleOf)), metrics);
      const dotY = cursor + (b.lines[0]?.baselineY ?? 24) - 17;
      nodes.push(rect(nid(prefix, `body.bullet[${i}].dot`), CX, dotY, 11, 11, tokens.color('accent'), { z: 9, radius: 6 }));
      cursor += pushBlock(nodes, prefix, `body.bullet[${i}]`, b, CX + 42, cursor, 10);
      cursor += 24;
    }
  } else if (slide.stats) {
    for (let i = 0; i < slide.stats.length; i++) {
      const [num, txt] = slide.stats[i]!;
      const numStyle = st(tokens, 'accent', 400, 58, 'accent', { italic: true, lh: 1.05, ls: -0.02 });
      const nb = layoutBlock(spec([{ text: num, key: 'ink' }], 380, () => numStyle), metrics);
      pushBlock(nodes, prefix, `stat[${i}].num`, nb, CX, cursor, 10);
      const tb = layoutBlock(spec(parseInline(txt), CW - 380 - 32, typed(ctx, nid(prefix, `stat[${i}].text`), bodyStyleOf(tokens, 30))), metrics);
      const h = Math.max(pushBlock(nodes, prefix, `stat[${i}].text`, tb, CX + 380 + 32, cursor + 8, 10), nb.height);
      cursor += h + 22;
      nodes.push(rect(nid(prefix, `stat[${i}].line`), CX, cursor, CW, 1, tokens.color('line'), { z: 5 }));
      cursor += 20;
    }
  } else if (slide.cards) {
    const gap = 24;
    const cardW = (CW - gap) / 2;
    let rowY = cursor;
    for (let i = 0; i < slide.cards.length; i++) {
      const c = slide.cards[i]!;
      const col = i % 2;
      const cx = CX + col * (cardW + gap);
      if (col === 0 && i > 0) rowY += 220 + gap;
      const cardY = rowY;
      const cardH = 220;
      nodes.push(rect(nid(prefix, `card[${i}]`), cx, cardY, cardW, cardH, tokens.color(c.highlight ? 'bgRose' : 'cardBg'), { z: 4, radius: 10, stroke: tokens.color(c.highlight ? 'accent' : 'line'), strokeWidth: 1 }));
      let cy = cardY + 32;
      if (c.label) {
        const ls = st(tokens, 'mono', 500, 16, c.highlight ? 'accent' : 'muted', { ls: 0.16 });
        const lb = layoutBlock(spec([{ text: c.label.toUpperCase(), key: 'ink' }], cardW - 56, () => ls), metrics);
        cy += pushBlock(nodes, prefix, `card[${i}].label`, lb, cx + 28, cy, 10) + 14;
      }
      if (c.title) {
        const tb = layoutBlock(spec([{ text: `${c.icon ? c.icon + ' ' : ''}${c.title}`, key: 'ink' }], cardW - 56, typed(ctx, nid(prefix, `card[${i}].title`), () => st(tokens, 'display', 800, 38, 'ink', { ls: -0.02, lh: 1.05 }))), metrics);
        cy += pushBlock(nodes, prefix, `card[${i}].title`, tb, cx + 28, cy, 10) + 14;
      }
      if (c.body) {
        const bb = layoutBlock(spec(parseInline(c.body), cardW - 56, typed(ctx, nid(prefix, `card[${i}].body`), bodyStyleOf(tokens, 22))), metrics);
        pushBlock(nodes, prefix, `card[${i}].body`, bb, cx + 28, cy, 10);
      }
    }
    cursor = rowY + 220 + gap;
  }

  if (slide.callout) {
    const h = 120;
    const cy = H - PADY - 52 - 28 - h;
    nodes.push(rect(nid(prefix, 'callout'), CX, cy, CW, h, tokens.color('bgRose'), { z: 4, radius: 10 }));
    const cb = layoutBlock(spec(parseInline(slide.callout), CW - 64, typed(ctx, nid(prefix, 'callout.text'), bodyStyleOf(tokens, 28))), metrics);
    pushBlock(nodes, prefix, 'callout.text', cb, CX + 32, cy + 28, 10);
  }

  footer(nodes, ctx, prefix, 'ARRASTA →', 'line', 'muted', 'ink');
  return { role: 'body', sourceIndex, background: tokens.color('bg'), nodes };
}

// ---------------- COVER ----------------
function buildCover(content: ContentText, totalPages: number, ctx: BuildCtx): RawSlide {
  const { tokens, metrics } = ctx;
  const prefix = slidePrefix('cover', 0);
  const nodes: SceneNode[] = [];
  corners(nodes, prefix, tokens.color('ink'));
  topbar(nodes, ctx, prefix, content.labelTopoCapa || tokens.brand.breadcrumb, `01 / ${String(totalPages).padStart(2, '0')}`, 'ink', 'accent');

  let cursor = PADY + 22 + 56;
  if (content.labelCapa) {
    const ls = st(tokens, 'display', 600, 20, 'accent', { ls: 0.18 });
    const b = layoutBlock(spec([{ text: content.labelCapa.toUpperCase(), key: 'ink' }], CW, () => ls), metrics);
    cursor += pushBlock(nodes, prefix, 'label', b, CX, cursor, 10) + 32;
  }
  // asterisco
  const ast = st(tokens, 'accent', 400, 96, 'accent', { lh: 1 });
  const ab = layoutBlock(spec([{ text: tokens.brand.logoGlyph, key: 'ink' }], CW, () => ast), metrics);
  cursor += pushBlock(nodes, prefix, 'asterisk', ab, CX, cursor, 10) + 24;

  const hlRuns = parseInline(content.hookCapa);
  const hb = fitBlock(spec(hlRuns, CW, typed(ctx, nid(prefix, 'hook'), headlineStyleOf(tokens, 78, 'ink'))), metrics, 460, 0.7);
  cursor += pushBlock(nodes, prefix, 'hook', hb, CX, cursor, 10) + 36;
  nodes.push(rect(nid(prefix, 'underline'), CX, cursor, 96, 4, tokens.color('accent'), { z: 5, radius: 2 }));

  // footer-tags (acima do footer)
  const tags = st(tokens, 'display', 600, 18, 'accent', { ls: 0.16 });
  const tb = layoutBlock(spec([{ text: '5 PASSOS · TÉCNICO · SEM CÓDIGO', key: 'ink' }], CW, () => tags), metrics);
  pushBlock(nodes, prefix, 'footertags', tb, CX, H - PADY - 52 - 40, 10);

  footer(nodes, ctx, prefix, 'ARRASTA →', 'line', 'muted', 'ink');
  return { role: 'cover', sourceIndex: 0, background: tokens.color('bg'), nodes };
}

// ---------------- CTA ----------------
function buildCta(content: ContentText, totalPages: number, ctx: BuildCtx): RawSlide {
  const { tokens, metrics } = ctx;
  const prefix = slidePrefix('cta', 0);
  const nodes: SceneNode[] = [];
  corners(nodes, prefix, tokens.color('bg'));
  topbar(nodes, ctx, prefix, content.ctaLabelTopo || 'TÁ NA HORA', `${String(totalPages).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, 'bg', 'bg');

  let cursor = PADY + 22 + 56;
  const label = st(tokens, 'display', 600, 18, 'bg', { ls: 0.18 });
  const lb = layoutBlock(spec([{ text: (content.ctaLabel || 'leva 2 minutos pra colar').toUpperCase(), key: 'ink' }], CW, () => label), metrics);
  cursor += pushBlock(nodes, prefix, 'label', lb, CX, cursor, 10) + 32;

  const ast = st(tokens, 'accent', 400, 80, 'bg', { lh: 1 });
  const ab = layoutBlock(spec([{ text: tokens.brand.logoGlyph, key: 'ink' }], CW, () => ast), metrics);
  cursor += pushBlock(nodes, prefix, 'asterisk', ab, CX, cursor, 10) + 20;

  const ctaStyleOf = (k: StyleKey): ResolvedTextStyle => {
    if (k === 'em') return st(tokens, 'accent', 400, 62 * 0.96, 'bg', { italic: true, lh: 1.08 });
    if (k === 'keyword' || k === 'code') return st(tokens, 'mono', 500, 62 * 0.78, 'bg', { lh: 1.08 });
    return st(tokens, 'display', 800, 62, 'bg', { ls: -0.02, lh: 1.08 });
  };
  const cb = fitBlock(spec(parseInline(content.ctaText || ''), CW, typed(ctx, nid(prefix, 'text'), ctaStyleOf)), metrics, 360, 0.7);
  cursor += pushBlock(nodes, prefix, 'text', cb, CX, cursor, 10) + 28;
  nodes.push(rect(nid(prefix, 'underline'), CX, cursor, 96, 4, tokens.color('bg'), { z: 5, radius: 2 }));
  cursor += 4 + 28;

  if (content.ctaSub) {
    const sub = st(tokens, 'body', 400, 26, 'bg', { lh: 1.32 });
    const sb = layoutBlock(spec([{ text: content.ctaSub, key: 'ink' }], CW, typed(ctx, nid(prefix, 'sub'), () => sub)), metrics);
    pushBlock(nodes, prefix, 'sub', sb, CX, cursor, 10);
  }

  footer(nodes, ctx, prefix, '👇 COMENTA AÍ', 'bg', 'bg', 'bg');
  return { role: 'cta', sourceIndex: 0, background: tokens.color('accent'), nodes };
}

export const stepTemplate: TemplateProgram = {
  family: 'step',
  build(content, ctx) {
    Z = 0;
    const totalPages = content.slides.length + 2;
    const slides: RawSlide[] = [];
    slides.push(buildCover(content, totalPages, ctx));
    content.slides.forEach((s, i) => slides.push(buildBody(s, i, i + 2, totalPages, ctx)));
    slides.push(buildCta(content, totalPages, ctx));
    return slides;
  },
};
