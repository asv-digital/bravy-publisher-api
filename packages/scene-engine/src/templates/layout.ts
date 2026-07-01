/**
 * Template CUSTOM data-driven (RFC fase 2) — `layoutTemplate(spec)` recebe um
 * LayoutSpec (slots desenhados pelo usuário) e devolve um TemplateProgram que
 * preenche cada slot com o conteúdo e emite a cena. `kind: 'post'` → 1 slide;
 * `kind: 'carousel'` → o mesmo molde aplicado a capa / corpo[i] / CTA.
 * Texto auto-encolhe (fitBlock) pra caber no frame; slot sem conteúdo some.
 */
import type { ContentText, LayoutSlot, LayoutSpec, SlotType } from '../doc.js';
import { nid, slidePrefix, type SlideRole } from '../ids.js';
import type { EllipseNode, GlyphRunNode, ImageNode, RectNode, ResolvedTextStyle, SceneNode } from '../scene.js';
import { headlineRuns, parseInline, type StyleKey, type StyledRun } from '../text/runs.js';
import { fitBlock, layoutBlock, type BlockSpec, type LaidBlock } from '../text/layout.js';
import type { Tokens, RoleName, ColorToken } from '../tokens.js';
import type { BuildCtx, RawSlide, TemplateProgram } from './registry.js';

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

function spec(runs: StyledRun[], width: number, styleOf: (k: StyleKey) => ResolvedTextStyle, align?: BlockSpec['align']): BlockSpec {
  return { runs, width, styleOf, align };
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

// ---- defaults de estilo por tipo de slot (role/size editáveis no designer) ----
const DEFAULTS: Record<SlotType, { role: RoleName; weight: number; size: number; fill: ColorToken; lh: number; ls?: number }> = {
  headline: { role: 'display', weight: 800, size: 64, fill: 'ink', lh: 1.08, ls: -0.02 },
  subtitle: { role: 'display', weight: 600, size: 30, fill: 'accent', lh: 1.2 },
  label: { role: 'mono', weight: 600, size: 20, fill: 'accent', lh: 1.2, ls: 0.14 },
  body: { role: 'body', weight: 400, size: 32, fill: 'inkSoft', lh: 1.34 },
  bullets: { role: 'body', weight: 400, size: 30, fill: 'inkSoft', lh: 1.3 },
  cta: { role: 'display', weight: 800, size: 42, fill: 'accent', lh: 1.1 },
  image: { role: 'body', weight: 400, size: 0, fill: 'ink', lh: 1 },
};

function styleForSlot(tokens: Tokens, slot: LayoutSlot): (k: StyleKey) => ResolvedTextStyle {
  const d = DEFAULTS[slot.type];
  const role = slot.role ?? d.role;
  const size = slot.size ?? d.size;
  return (k) => {
    switch (k) {
      case 'strong':
        return st(tokens, role, Math.max(d.weight, 700), size, 'ink', { lh: d.lh });
      case 'em':
        return st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: d.lh });
      case 'code':
      case 'keyword':
        return st(tokens, 'mono', 500, size * 0.92, 'accent', { lh: d.lh });
      default:
        return st(tokens, role, d.weight, size, d.fill, { lh: d.lh, ls: d.ls });
    }
  };
}

// ---- conteúdo por slot, derivado do Content para um slide específico ----
interface SlotData {
  headline?: StyledRun[];
  subtitle?: string;
  label?: string;
  body?: StyledRun[][];
  bullets?: StyledRun[][];
  image?: string;
  cta?: StyledRun[];
  /** mostra placeholder de imagem mesmo sem asset (post / corpo do carrossel). */
  imagePlaceholder?: boolean;
}

function nonEmpty(runs?: StyledRun[]): StyledRun[] | undefined {
  return runs && runs.some((r) => r.text.trim()) ? runs : undefined;
}

type Has = (t: SlotType) => boolean;
type Slide = ContentText['slides'][number];

/** Corpo do slide (paragraphs > list > stats > cards) como blocos de runs. */
function bodyPiecesOf(s: Slide): StyledRun[][] | undefined {
  if (s.list?.length) return s.list.map((i) => parseInline(i));
  if (s.paragraphs?.length) return s.paragraphs.map((p) => parseInline(p));
  if (s.stats?.length) return s.stats.map(([n, t]) => [{ text: `${n} `, key: 'em' as StyleKey }, ...parseInline(t)]);
  if (s.cards?.length) return s.cards.map((c) => [{ text: `${c.title ?? ''} `, key: 'strong' as StyleKey }, ...parseInline(c.body ?? '')]);
  return undefined;
}

/**
 * Distribui o conteúdo entre os slots QUE EXISTEM no layout, sem duplicar e sem
 * perder texto: se não há headline própria, promove o 1º bloco de corpo a
 * headline; o kicker (tag/label) vai pra subtitle (ou label); o resto do corpo
 * vai pra body (ou bullets). Assim o conteúdo cai sempre em cima dos slots.
 */
function distribute(opts: {
  has: Has;
  headline?: StyledRun[];
  kicker?: string;
  pieces?: StyledRun[][];
  cta?: StyledRun[];
  image?: string;
  imagePlaceholder?: boolean;
}): SlotData {
  const { has, kicker } = opts;
  let headline = nonEmpty(opts.headline ?? []);
  let pieces = opts.pieces;
  // sem headline própria: promove o 1º bloco de corpo (evita usar o kicker/tag)
  if (!headline && pieces?.length) {
    headline = pieces[0];
    pieces = pieces.slice(1);
  }
  if (!headline && kicker) headline = parseInline(kicker);

  const data: SlotData = { imagePlaceholder: opts.imagePlaceholder ?? true, image: opts.image };

  if (has('headline')) {
    data.headline = headline;
    if (has('subtitle')) data.subtitle = kicker;
    else if (has('label')) data.label = kicker;
  } else if (has('subtitle')) {
    // sem slot de headline: o título principal vira o subtítulo (não perde o texto)
    data.subtitle = headline ? headline.map((r) => r.text).join('') : kicker;
  } else if (has('label')) {
    data.label = kicker;
  }

  // corpo restante → body (preferido) ou bullets
  if (pieces?.length) {
    if (has('body')) data.body = pieces;
    else if (has('bullets')) data.bullets = pieces;
  }

  if (has('cta')) data.cta = nonEmpty(opts.cta ?? []);
  return data;
}

function postData(content: ContentText, has: Has): SlotData {
  const s0 = content.slides[0] ?? {};
  const headline = s0.headlineTop || s0.headlineEm || s0.headlineBottom
    ? headlineRuns(s0.headlineTop, s0.headlineEm, s0.headlineBottom)
    : parseInline(content.hookCapa || '');
  return distribute({
    has,
    headline,
    kicker: content.labelCapa ?? s0.tag ?? content.labelTopoCapa,
    pieces: bodyPiecesOf(s0),
    cta: parseInline(content.ctaText || ''),
    image: s0.image?.assetUrl,
    imagePlaceholder: true,
  });
}

function coverData(content: ContentText, has: Has): SlotData {
  return distribute({
    has,
    headline: parseInline(content.hookCapa || ''),
    kicker: content.labelCapa ?? content.labelTopoCapa,
    imagePlaceholder: false,
  });
}

function bodyData(content: ContentText, i: number, has: Has): SlotData {
  const s = content.slides[i]!;
  const headline = s.headlineTop || s.headlineEm || s.headlineBottom
    ? headlineRuns(s.headlineTop, s.headlineEm, s.headlineBottom)
    : undefined;
  return distribute({
    has,
    headline,
    kicker: s.tag,
    pieces: bodyPiecesOf(s),
    image: s.image?.assetUrl,
    imagePlaceholder: true,
  });
}

function ctaData(content: ContentText, has: Has): SlotData {
  return distribute({
    has,
    headline: parseInline(content.ctaText || ''),
    kicker: content.ctaLabelTopo,
    pieces: content.ctaSub ? [parseInline(content.ctaSub)] : undefined,
    cta: parseInline(content.ctaLabel || ''),
    imagePlaceholder: false,
  });
}

// ---- renderiza um slot dentro do seu frame ----
function renderSlot(nodes: SceneNode[], ctx: BuildCtx, prefix: string, slot: LayoutSlot, data: SlotData): void {
  const { tokens, metrics } = ctx;
  const { x, y, w, h } = slot.frame;
  const align = slot.align ?? 'left';
  const path = `slot.${slot.id}`;

  if (slot.type === 'image') {
    const src = data.image;
    if (src) {
      nodes.push({ type: 'image', id: nid(prefix, path), container: nid(prefix, path), z: 4, frame: { x, y, w, h }, src, fit: 'cover', radius: 20 } satisfies ImageNode);
    } else if (data.imagePlaceholder) {
      nodes.push({ type: 'rect', id: nid(prefix, path), container: nid(prefix, path), z: 4, frame: { x, y, w, h }, fill: tokens.color('bg2'), radius: 20, stroke: tokens.color('line'), strokeWidth: 1 } satisfies RectNode);
    }
    return;
  }

  const styleOf = styleForSlot(tokens, slot);

  if (slot.type === 'bullets') {
    if (!data.bullets?.length) return;
    let cursor = y;
    const d = DEFAULTS.bullets;
    const indent = 38;
    data.bullets.forEach((runs, i) => {
      const b = layoutBlock(spec(runs, w - indent, styleOf, align), metrics);
      const dotY = cursor + (b.lines[0]?.baselineY ?? 24) - (slot.size ?? d.size) * 0.32;
      nodes.push({ type: 'ellipse', id: nid(prefix, `${path}.dot[${i}]`), z: 9, frame: { x, y: dotY, w: 11, h: 11 }, fill: tokens.color('accent') } satisfies EllipseNode);
      cursor += pushBlock(nodes, prefix, `${path}[${i}]`, b, x + indent, cursor, 10) + 16;
    });
    return;
  }

  // texto simples (headline/subtitle/label/body/cta)
  let runs: StyledRun[] | undefined;
  if (slot.type === 'headline') runs = data.headline;
  else if (slot.type === 'cta') runs = data.cta;
  else if (slot.type === 'subtitle') runs = data.subtitle ? parseInline(data.subtitle) : undefined;
  else if (slot.type === 'label') runs = data.label ? [{ text: data.label.toUpperCase(), key: 'ink' }] : undefined;
  else if (slot.type === 'body') {
    if (!data.body?.length) return;
    let cursor = y;
    data.body.forEach((p, i) => {
      const b = fitBlock(spec(p, w, styleOf, align), metrics, h, 0.7);
      cursor += pushBlock(nodes, prefix, `${path}[${i}]`, b, x, cursor, 10) + 14;
    });
    return;
  }

  if (!runs || !runs.some((r) => r.text.trim())) return;
  const block = fitBlock(spec(runs, w, styleOf, align), metrics, h, 0.6);
  pushBlock(nodes, prefix, path, block, x, y, 10);
}

function buildSlide(spec: LayoutSpec, ctx: BuildCtx, role: SlideRole, sourceIndex: number, data: SlotData): RawSlide {
  const prefix = slidePrefix(role, sourceIndex);
  const nodes: SceneNode[] = [];
  for (const slot of spec.slots) renderSlot(nodes, ctx, prefix, slot, data);
  return { role, sourceIndex, background: ctx.tokens.color(spec.background), nodes };
}

export function layoutTemplate(layout: LayoutSpec): TemplateProgram {
  return {
    family: 'custom',
    build(content, ctx) {
      const types = new Set(layout.slots.map((s) => s.type));
      const has: Has = (t) => types.has(t);
      if (layout.kind === 'post') {
        return [buildSlide(layout, ctx, 'cover', 0, postData(content, has))];
      }
      const slides: RawSlide[] = [];
      slides.push(buildSlide(layout, ctx, 'cover', 0, coverData(content, has)));
      content.slides.forEach((_, i) => slides.push(buildSlide(layout, ctx, 'body', i, bodyData(content, i, has))));
      slides.push(buildSlide(layout, ctx, 'cta', 0, ctaData(content, has)));
      return slides;
    },
  };
}
