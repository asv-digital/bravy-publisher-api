/**
 * Fonte unica das personas e padroes validos para geracao.
 * Mantenha em sincronia com o frontend (PERSONAS em lib/constants.ts).
 */
export const PERSONAS = [
  'contador',
  'advogado',
  'empresario',
  'gestor',
  'arquiteto',
  'engenheiro',
  'agencia',
] as const;

export const PATTERNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type Persona = (typeof PERSONAS)[number];
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

export interface VocabEntry {
  ferramentas?: string[];
  obrigacoes?: string[];
  tributos?: string[];
  regimes?: string[];
  operacoes?: string[];
  documentos?: string[];
  areas?: string[];
  dores?: string[];
}

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

export interface GenerationOutput {
  slug: string;
  padrao: HookPattern;
  persona: Persona;
  template: TemplateName;
  label_topo_capa: string;
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
  }>;
  cta_label_topo: string;
  cta_label: string;
  cta_text: string;
  cta_sub: string;
  caption: string;
}
