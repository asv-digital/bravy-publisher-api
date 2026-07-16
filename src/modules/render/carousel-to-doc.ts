/**
 * Adapter CarouselInput (snake_case, fonte do LLM/Prisma) → DesignDocument
 * (camelCase, consumido pelo scene-engine). RFC §2.3 — o texto que o LLM já
 * produz vira a fonte de verdade do engine, sem migração de dados.
 */
import type {
  CardText,
  ContentText,
  DesignDocument,
  SlideImage,
  SlideText,
} from '@publisher/scene-engine';
import type {
  CarouselInput,
  CardInput,
  SlideImageInput,
  SlideInput,
} from './types';

function mapCard(c: CardInput): CardText {
  return {
    label: c.label,
    icon: c.icon,
    title: c.title,
    body: c.body,
    highlight: c.highlight,
  };
}

function mapSlideImage(i: SlideImageInput): SlideImage {
  return {
    enabled: i.enabled,
    role: i.role,
    prompt: i.prompt,
    model: i.model,
    seed: i.seed,
    focal: i.focal,
    treatment: i.treatment,
    status: i.status,
    assetUrl: i.asset_url,
    assetKey: i.asset_key,
    width: i.width,
    height: i.height,
    lastError: i.last_error,
  };
}

function mapSlide(s: SlideInput): SlideText {
  return {
    labelTopo: s.label_topo,
    tag: s.tag,
    headlineTop: s.headline_top,
    headlineEm: s.headline_em,
    headlineBottom: s.headline_bottom,
    paragraphs: s.paragraphs,
    list: s.list,
    stats: s.stats,
    cards: s.cards?.map(mapCard),
    callout: s.callout,
    image: s.image ? mapSlideImage(s.image) : undefined,
  };
}

export function carouselToContentText(input: CarouselInput): ContentText {
  return {
    slug: input.slug,
    template: input.template,
    persona: input.persona,
    labelTopoCapa: input.label_topo_capa,
    tagsCapa: input.tags_capa,
    labelCapa: input.label_capa,
    hookCapa: input.hook_capa,
    slides: (input.slides ?? []).map(mapSlide),
    ctaLabelTopo: input.cta_label_topo,
    ctaLabel: input.cta_label,
    ctaText: input.cta_text,
    ctaSub: input.cta_sub,
    caption: input.caption,
  };
}

export function carouselToDoc(input: CarouselInput): DesignDocument {
  return { schemaVersion: 1, content: carouselToContentText(input) };
}
