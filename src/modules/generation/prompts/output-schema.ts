/**
 * Schema Zod do GenerationOutput (RFC §6.2). Valida a saída do Claude antes de
 * persistir; em erro, o service roda o repair loop (reenvia os erros ao Claude).
 * Estrutura estrita; enums tolerantes (string) p/ não rejeitar por rótulo.
 */
import { z } from 'zod';

export const SlideOutSchema = z.object({
  label_topo: z.string().optional().default(''),
  tag: z.string().optional(),
  headline_top: z.string().optional(),
  headline_em: z.string().optional(),
  headline_bottom: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  list: z.array(z.string()).optional(),
  stats: z.array(z.tuple([z.string(), z.string()])).optional(),
  cards: z
    .array(
      z.object({
        label: z.string().optional(),
        icon: z.string().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        highlight: z.boolean().optional(),
      }),
    )
    .optional(),
  callout: z.string().optional(),
});

export const GenerationOutputSchema = z.object({
  slug: z.string().min(1),
  padrao: z.string().min(1),
  persona: z.string().min(1),
  template: z.enum(['step', 'compendium', 'tweet']).catch('step'),
  label_topo_capa: z.string().default(''),
  label_capa: z.string().default(''),
  hook_capa: z.string().min(1),
  slides: z.array(SlideOutSchema).min(1),
  cta_label_topo: z.string().default(''),
  cta_label: z.string().default(''),
  cta_text: z.string().default(''),
  cta_sub: z.string().default(''),
  caption: z.string().default(''),
});

export type SlideOut = z.infer<typeof SlideOutSchema>;
export type GenerationOutputParsed = z.infer<typeof GenerationOutputSchema>;

/** Erros do Zod em texto compacto p/ o repair loop. */
export function zodErrorText(error: z.ZodError): string {
  return error.issues.map((i) => `- ${i.path.join('.') || '(raiz)'}: ${i.message}`).join('\n');
}
