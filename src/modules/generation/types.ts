export const PATTERNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/**
 * Slug de uma persona do tenant (model Persona). Já foi uma union fechada de 7
 * slugs hardcoded que vivia fora de sincronia com o frontend — hoje as personas
 * são dados por tenant, então a validação é feita no PersonasService (a persona
 * existe pra este tenant?), não no tipo.
 */
export type Persona = string;
export type HookPattern = (typeof PATTERNS)[number];
export type TemplateName = 'step' | 'compendium' | 'tweet' | 'custom';

export interface PatternInfo {
  id: HookPattern;
  nome: string;
  score_referencia: number;
  exemplo_top: string;
  estrutura_s1: string;
  ancora: string;
  exemplo_real: string;
  fechamento_s2: string;
  quando_usar: string;
}

/**
 * Vocabulário do nicho da persona, injetado no prompt pra o carrossel soar
 * específico. Chave = grupo (livre, definido pelo user: 'dores', 'tributos',
 * 'sistemas que ja paga'...), valor = termos daquele grupo.
 *
 * Era uma interface de chaves fixas do nicho contábil/jurídico; virou aberta
 * quando as personas passaram a ser criadas pelo user. VOCAB_LABELS no
 * carousel-prompt rotula as chaves conhecidas; o resto usa a própria chave.
 */
export type VocabEntry = Record<string, string[]>;

export interface DatasetTop {
  code: string;
  date_iso: string;
  likes: number;
  comments: number;
  slides: number;
  caption: string;
  url: string;
  score: number;
}

export interface GenerationInput {
  tema: string;
  persona: Persona;
  pattern?: HookPattern;
  /** família visual explícita do wizard (ausente = automático pelo pattern). */
  template?: TemplateName;
  /** snapshot de estilo (tipografia/paleta) do template escolhido — ex.: Twitter dark. */
  styleData?: Record<string, unknown>;
}

/**
 * Espelho snake_case do SlideImage do scene-engine, como persistido em
 * slidesData/bodyData (mesmo shape que o adapter de render consome).
 */
export interface SlideImageRaw {
  enabled: boolean;
  role: 'figure' | 'background';
  prompt: string;
  model: 'nano-banana' | 'gpt-5.5-image';
  seed?: number;
  focal?: { x: number; y: number };
  treatment?: 'duotone' | 'grain' | 'none';
  status: 'idle' | 'queued' | 'generating' | 'ready' | 'failed';
  asset_url?: string;
  asset_key?: string;
  width?: number;
  height?: number;
  last_error?: string;
}

export interface GenerationOutput {
  slug: string;
  padrao: HookPattern;
  persona: Persona;
  template: TemplateName;
  label_topo_capa: string;
  /** 2-4 tags curtas em MAIUSCULAS da capa, derivadas do conteudo (sem marcas). */
  tags_capa: string[];
  label_capa: string;
  hook_capa: string;
  slides: Array<{
    label_topo: string;
    tag?: string;
    headline_top?: string;
    headline_em?: string;
    headline_bottom?: string;
    paragraphs?: string[];
    list?: string[];
    stats?: [string, string][];
    cards?: Array<{
      label?: string;
      icon?: string;
      title?: string;
      body?: string;
      highlight?: boolean;
    }>;
    callout?: string;
    /** descrição visual em inglês emitida pelo LLM (opcional, template tweet). */
    image_prompt?: string;
    /** imagem gerada por IA p/ o slide (gravada pelo SlideImageService). */
    image?: SlideImageRaw;
  }>;
  cta_label_topo: string;
  cta_label: string;
  cta_text: string;
  cta_sub: string;
  caption: string;
}
