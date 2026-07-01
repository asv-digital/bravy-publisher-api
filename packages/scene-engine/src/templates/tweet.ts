/**
 * Template "tweet" — carrossel em estilo card de tweet (X/Twitter).
 * Cada slide é um card: header (avatar + nome + @handle + contador) → texto
 * curto (lead bold + parágrafos, ênfase itálica) → faixa de imagem opcional
 * embaixo. Tema dark/light vem da paleta do kit/estilo (sem hex literal).
 * Emite SceneNode[] no design space 1080². Cover / body / CTA = cards de tweet.
 */
import type { ContentText, SlideText } from '../doc.js';
import { nid, slidePrefix } from '../ids.js';
import type { EllipseNode, GlyphRunNode, ImageNode, RectNode, ResolvedTextStyle, SceneNode } from '../scene.js';
import { headlineRuns, parseInline, type StyleKey, type StyledRun } from '../text/runs.js';
import { fitBlock, layoutBlock, type BlockSpec, type LaidBlock } from '../text/layout.js';
import type { Tokens, RoleName, ColorToken } from '../tokens.js';
import type { BuildCtx, RawSlide, TemplateProgram } from './registry.js';

const W = 1080;
const H = 1080;
const PAD = 76;
const CX = PAD;
const CW = W - 2 * PAD; // 928
const AVATAR = 104;

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

function rect(id: string, x: number, y: number, w: number, h: number, fill: string, opts: Partial<RectNode> = {}): RectNode {
  return { type: 'rect', id, z: opts.z ?? 1, frame: { x, y, w, h }, fill, ...opts };
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

function pushBlock(nodes: SceneNode[], prefix: string, path: string, block: LaidBlock, x: number, y: number, z: number): number {
  let li = 0;
  for (const line of block.lines) {
    let ri = 0;
    for (const r of line.runs) {
      nodes.push({
        type: 'glyphrun',
        id: nid(prefix, `${path}.l${li}r${ri}`),
        container: nid(prefix, path),
        z,
        x: x + r.x,
        baselineY: y + r.baselineY,
        text: r.text,
        style: r.style,
      } satisfies GlyphRunNode);
      ri++;
    }
    li++;
  }
  return block.height;
}

// ---- nome / @handle derivados do brand kit (display name à parte chega depois) ----
function displayName(handle: string): string {
  return handle.replace(/^@/, '');
}
function atHandle(handle: string): string {
  const h = handle.replace(/^@/, '');
  return `@${h.toLowerCase()}`;
}

// ---- estilos de texto do card ----
function leadStyleOf(tokens: Tokens, size: number): (k: StyleKey) => ResolvedTextStyle {
  return (k) => {
    switch (k) {
      case 'em': return st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: 1.24 });
      case 'code':
      case 'keyword': return st(tokens, 'mono', 500, size * 0.9, 'accent', { lh: 1.24 });
      default: return st(tokens, 'display', 700, size, 'ink', { ls: -0.01, lh: 1.24 });
    }
  };
}
function bodyStyleOf(tokens: Tokens, size: number): (k: StyleKey) => ResolvedTextStyle {
  return (k) => {
    switch (k) {
      case 'strong': return st(tokens, 'body', 700, size, 'ink', { lh: 1.38 });
      case 'em': return st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: 1.38 });
      case 'code':
      case 'keyword': return st(tokens, 'mono', 500, size * 0.92, 'accent', { lh: 1.38 });
      default: return st(tokens, 'body', 400, size, 'inkSoft', { lh: 1.38 });
    }
  };
}

/** Cabeçalho do card: avatar + nome + @handle + contador (page/total). */
function header(nodes: SceneNode[], ctx: BuildCtx, prefix: string, page: number, total: number): number {
  const { tokens, metrics } = ctx;
  const ay = PAD;

  // avatar: foto de perfil do canal conectado quando houver; senão, placeholder
  // circular com o glifo da marca. ImageNode com radius = AVATAR/2 → círculo.
  const avatarUrl = tokens.brand.avatarUrl;
  if (avatarUrl) {
    nodes.push({ type: 'image', id: nid(prefix, 'avatar'), z: 6, frame: { x: CX, y: ay, w: AVATAR, h: AVATAR }, src: avatarUrl, fit: 'cover', radius: AVATAR / 2 } satisfies ImageNode);
  } else {
    nodes.push({ type: 'ellipse', id: nid(prefix, 'avatar'), z: 6, frame: { x: CX, y: ay, w: AVATAR, h: AVATAR }, fill: tokens.color('accentSoft') } satisfies EllipseNode);
    const glyph = st(tokens, 'accent', 400, AVATAR * 0.5, 'bg', { lh: 1 });
    const gm = metrics.measure(tokens.brand.logoGlyph, glyph);
    nodes.push({ type: 'glyphrun', id: nid(prefix, 'avatar.glyph'), z: 7, x: CX + AVATAR / 2 - gm.width / 2, baselineY: ay + AVATAR / 2 + gm.ascent / 2 - gm.descent / 2, text: tokens.brand.logoGlyph, style: glyph });
  }

  const tx = CX + AVATAR + 28;
  const nameStyle = st(tokens, 'display', 800, 38, 'ink', { ls: -0.01 });
  const nm = metrics.measure(displayName(tokens.brand.handle), nameStyle);
  const nameBaseline = ay + 44;
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'name'), z: 10, x: tx, baselineY: nameBaseline, text: displayName(tokens.brand.handle), style: nameStyle });
  void nm;

  const handleStyle = st(tokens, 'body', 400, 30, 'muted');
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'handle'), z: 10, x: tx, baselineY: nameBaseline + 42, text: atHandle(tokens.brand.handle), style: handleStyle });

  // contador 1/8 no topo-direita, alinhado ao nome
  const countStyle = st(tokens, 'mono', 600, 32, 'accent', { ls: 0.02 });
  const counter = `${page}/${total}`;
  const cw = metrics.measure(counter, countStyle).width;
  nodes.push({ type: 'glyphrun', id: nid(prefix, 'counter'), z: 10, x: W - PAD - cw, baselineY: nameBaseline, text: counter, style: countStyle });

  return ay + AVATAR; // bottom do header
}

/** Faixa de imagem arredondada na base; usa o asset se houver, senão placeholder sutil. */
function imageBand(nodes: SceneNode[], ctx: BuildCtx, prefix: string, src?: string): number {
  const { tokens } = ctx;
  const h = 392;
  const y = H - PAD - h;
  if (src) {
    nodes.push({ type: 'image', id: nid(prefix, 'image'), z: 4, frame: { x: CX, y, w: CW, h }, src, fit: 'cover', radius: 24 } satisfies ImageNode);
  } else {
    nodes.push(rect(nid(prefix, 'image.placeholder'), CX, y, CW, h, tokens.color('bg2'), { z: 4, radius: 24, stroke: tokens.color('line'), strokeWidth: 1 }));
  }
  return y; // topo da faixa
}

/** Empilha lead + parágrafos a partir de `top`, limitado por `bottom`. */
function textBlock(
  nodes: SceneNode[],
  ctx: BuildCtx,
  prefix: string,
  leadRuns: StyledRun[],
  paragraphs: StyledRun[][],
  top: number,
): void {
  const { metrics } = ctx;
  let cursor = top;
  if (leadRuns.some((r) => r.text.trim())) {
    const lb = fitBlock(spec(leadRuns, CW, typed(ctx, nid(prefix, 'lead'), leadStyleOf(ctx.tokens, 50))), metrics, 360, 0.8);
    cursor += pushBlock(nodes, prefix, 'lead', lb, CX, cursor, 10) + 34;
  }
  const styleOf = bodyStyleOf(ctx.tokens, 40);
  paragraphs.forEach((runs, i) => {
    if (!runs.some((r) => r.text.trim())) return;
    const b = layoutBlock(spec(runs, CW, typed(ctx, nid(prefix, `para[${i}]`), styleOf)), metrics);
    cursor += pushBlock(nodes, prefix, `para[${i}]`, b, CX, cursor, 10) + 22;
  });
}

/** Converte o corpo do slide (list/paragraphs/stats/cards) em parágrafos de tweet. */
function paragraphsFrom(slide: SlideText): StyledRun[][] {
  if (slide.list) return slide.list.map((i) => parseInline(i));
  if (slide.paragraphs) return slide.paragraphs.map((p) => parseInline(p));
  if (slide.stats) return slide.stats.map(([n, t]) => [{ text: `${n} `, key: 'em' as StyleKey }, ...parseInline(t)]);
  if (slide.cards) return slide.cards.map((c) => [{ text: `${c.title ?? ''} `, key: 'strong' as StyleKey }, ...parseInline(c.body ?? '')]);
  return [];
}

// ---------------- COVER ----------------
function buildCover(content: ContentText, total: number, ctx: BuildCtx): RawSlide {
  const { tokens } = ctx;
  const prefix = slidePrefix('cover', 0);
  const nodes: SceneNode[] = [];
  const headerBottom = header(nodes, ctx, prefix, 1, total);

  const lead = parseInline(content.hookCapa);
  const paras: StyledRun[][] = [];
  if (content.labelCapa) paras.push(parseInline(content.labelCapa));
  textBlock(nodes, ctx, prefix, lead, paras, headerBottom + 56);

  return { role: 'cover', sourceIndex: 0, background: tokens.color('bg'), nodes };
}

// ---------------- BODY ----------------
function buildBody(slide: SlideText, sourceIndex: number, page: number, total: number, ctx: BuildCtx): RawSlide {
  const { tokens } = ctx;
  const prefix = slidePrefix('body', sourceIndex);
  const nodes: SceneNode[] = [];
  const headerBottom = header(nodes, ctx, prefix, page, total);

  const src = slide.image?.assetUrl;
  imageBand(nodes, ctx, prefix, src);

  const lead = slide.headlineTop || slide.headlineEm || slide.headlineBottom
    ? headlineRuns(slide.headlineTop, slide.headlineEm, slide.headlineBottom)
    : slide.tag
      ? parseInline(slide.tag)
      : [];
  textBlock(nodes, ctx, prefix, lead, paragraphsFrom(slide), headerBottom + 56);

  return { role: 'body', sourceIndex, background: tokens.color('bg'), nodes };
}

// ---------------- CTA ----------------
function buildCta(content: ContentText, total: number, ctx: BuildCtx): RawSlide {
  const { tokens } = ctx;
  const prefix = slidePrefix('cta', 0);
  const nodes: SceneNode[] = [];
  const headerBottom = header(nodes, ctx, prefix, total, total);

  const lead = parseInline(content.ctaText || '');
  const paras: StyledRun[][] = [];
  if (content.ctaSub) paras.push(parseInline(content.ctaSub));
  textBlock(nodes, ctx, prefix, lead, paras, headerBottom + 56);

  return { role: 'cta', sourceIndex: 0, background: tokens.color('bg'), nodes };
}

export const tweetTemplate: TemplateProgram = {
  family: 'tweet',
  build(content, ctx) {
    const total = content.slides.length + 2;
    const slides: RawSlide[] = [];
    slides.push(buildCover(content, total, ctx));
    content.slides.forEach((s, i) => slides.push(buildBody(s, i, i + 2, total, ctx)));
    slides.push(buildCta(content, total, ctx));
    return slides;
  },
};
