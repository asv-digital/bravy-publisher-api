import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { PrismaService } from '../../database/prisma.service';
import { FactCheckService } from '../fact-check/fact-check.service';
import { SlideImageService } from './slide-image.service';
import { buildSystemPrompt } from './prompts/carousel-prompt';
import { buildThemeIdeasPrompt } from './prompts/theme-ideas-prompt';
import { selectTemplate } from './prompts/template-selector';
import { PersonasService } from '../personas/personas.service';
import {
  GenerationOutputSchema,
  SlideOutSchema,
  zodErrorText,
  type SlideOut,
} from './prompts/output-schema';
import { buildRegenerateSlidePrompt } from './prompts/regenerate-slide-prompt';
import {
  GenerationInput,
  GenerationOutput,
  Persona,
  HookPattern,
  PatternInfo,
  VocabEntry,
  DatasetTop,
} from './types';
import { readFileSync } from 'fs';
import { join } from 'path';

// Repo-local path by default; override with DATASET_DIR env if a custom location is needed.
// Service is started from the backend root in dev (ts-node) and prod (node dist/main.js),
// so process.cwd() resolves to the backend root in both cases.
const DATASET_DIR =
  process.env.DATASET_DIR && process.env.DATASET_DIR.length > 0
    ? process.env.DATASET_DIR
    : join(process.cwd(), 'datasets');

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly factCheck: FactCheckService,
    private readonly slideImage: SlideImageService,
    private readonly personas: PersonasService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async generate(input: GenerationInput, tenantId: string, authorId?: string) {
    const startTime = Date.now();

    // Load dataset files
    const patterns = this.loadJson<PatternInfo[]>('padroes_validados.json');
    const topPosts = this.loadJson<DatasetTop[]>('top_carrosseis.json');
    const { persona, vocab } = await this.resolvePersona(tenantId, input.persona);

    // Select pattern
    const pattern: HookPattern = input.pattern || 'A';
    const templateName = selectTemplate(pattern);

    // Build prompt
    const systemPrompt = buildSystemPrompt({
      persona: input.persona,
      pattern,
      patterns,
      topPosts,
      vocab,
      accentHex: persona.accentHex,
      templateOverride: input.template,
    });

    const userPrompt = `Gere um carrossel sobre: ${input.tema}\nPersona: ${input.persona}\nPadrao: ${pattern}`;

    // Call Claude API with prompt caching + Zod validation + repair loop
    this.logger.log(`Generating carousel: ${input.tema} (${input.persona}, pattern ${pattern})`);

    const { data: parsed, model, usage } = await this.completeJson({
      system: [{
        type: 'text' as const,
        text: systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      }],
      user: userPrompt,
      schema: GenerationOutputSchema,
      maxTokens: 4096,
    });
    const generated = parsed as unknown as GenerationOutput;
    // escolha explícita do wizard prevalece sobre o que o modelo devolveu
    if (input.template) generated.template = input.template;

    const durationMs = Date.now() - startTime;

    // Run fact-check
    const factResult = this.factCheck.validate({
      hook_capa: generated.hook_capa,
      caption: generated.caption,
      cta_text: generated.cta_text,
      slides: generated.slides.map(s => ({
        label_topo: s.label_topo,
        tag: s.tag,
        paragraphs: s.paragraphs,
        list: s.list,
        stats: s.stats,
        cards: s.cards,
        callout: s.callout,
      })),
    });

    if (factResult.warnings.length > 0) {
      this.logger.warn(`Fact-check warnings: ${factResult.warnings.join('; ')}`);
    }

    // Determine status based on fact-check
    const status = factResult.ok ? 'READY' : 'DRAFT';

    // Snapshot do Brand Kit vigente (§13.2 — editar o kit não reflui posts antigos)
    const brandKit = await this.prisma.brandKit.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true, version: true },
    });

    // Create Content + Slides in database
    const content = await this.prisma.content.create({
      data: {
        tenantId,
        slug: generated.slug,
        contentType: 'CAROUSEL',
        status,
        persona: generated.persona,
        pattern: generated.padrao,
        template: generated.template,
        hookCapa: generated.hook_capa,
        caption: generated.caption,
        slidesData: generated as any,
        styleData: (input.styleData as any) ?? undefined,
        brandKitId: brandKit?.id,
        brandKitVersion: brandKit?.version,
        authorId,
        slides: {
          create: [
            {
              position: 0,
              slideType: 'COVER',
              bodyData: {
                label_topo_capa: generated.label_topo_capa,
                tags_capa: generated.tags_capa,
                label_capa: generated.label_capa,
                hook_capa: generated.hook_capa,
              },
            },
            ...generated.slides.map((s, i) => ({
              position: i + 1,
              slideType: 'BODY' as const,
              bodyData: s as any,
            })),
            {
              position: generated.slides.length + 1,
              slideType: 'CTA',
              bodyData: {
                cta_label_topo: generated.cta_label_topo,
                cta_label: generated.cta_label,
                cta_text: generated.cta_text,
                cta_sub: generated.cta_sub,
              },
            },
          ],
        },
        generations: {
          create: {
            prompt: systemPrompt + '\n\n---\n\n' + userPrompt,
            response: generated as any,
            model,
            inputTokens: usage.input,
            outputTokens: usage.output,
            durationMs,
          },
        },
      },
      include: { slides: true, generations: true },
    });

    // P1: imagens por slide (best-effort, fire-and-forget — não bloqueia a resposta).
    // Sequencial de propósito: a dupla-escrita faz read-modify-write no slidesData.
    if (this.slideImage.hasProvider()) {
      const positions = generated.slides
        .map((s, i) => (s.image_prompt ? i + 1 : null))
        .filter((p): p is number => p !== null);
      if (positions.length) {
        void (async () => {
          for (const position of positions) {
            await this.slideImage
              .generateForSlide(content.id, position, tenantId)
              .catch((err) =>
                this.logger.warn(
                  `Imagem do slide ${position} falhou (best-effort): ${err?.message ?? err}`,
                ),
              );
          }
        })();
      }
    }

    return content;
  }

  async suggestThemes(
    input: {
      persona?: string;
      pattern?: string;
      hint?: string;
    },
    tenantId: string,
  ): Promise<{ ideas: string[] }> {
    const patterns = this.loadJson<PatternInfo[]>('padroes_validados.json');

    // Persona é opcional aqui (o user pode pedir ideias antes de escolher),
    // então uma persona inexistente degrada pro prompt genérico em vez de 400.
    const persona = input.persona
      ? await this.personas.findBySlug(tenantId, input.persona)
      : null;

    let vocab: VocabEntry = persona ? await this.personas.vocabFor(tenantId, persona.slug) : {};
    if (Object.keys(vocab).length === 0) {
      const legacy = this.loadJson<Record<string, VocabEntry>>('vocab.json');
      vocab = (input.persona && legacy?.[input.persona]) || legacy?.['geral'] || {};
    }

    const prompt = buildThemeIdeasPrompt({
      persona: input.persona,
      personaLabel: persona?.description ?? persona?.name,
      pattern: input.pattern,
      patterns,
      vocab,
      hint: input.hint,
    });

    this.logger.log(
      `Suggesting themes (persona=${input.persona ?? 'none'}, pattern=${input.pattern ?? 'none'})`,
    );

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let ideas: string[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      ideas = Array.isArray(parsed?.ideas)
        ? parsed.ideas.filter(
            (i: unknown): i is string => typeof i === 'string' && i.length > 0,
          )
        : [];
    } catch {
      this.logger.warn(`Failed to parse theme ideas: ${jsonStr.slice(0, 200)}`);
      throw new Error('Failed to parse theme suggestions');
    }

    return { ideas: ideas.slice(0, 3) };
  }

  async regenerate(contentId: string) {
    const content = await this.prisma.content.findUniqueOrThrow({
      where: { id: contentId },
    });

    return this.generate(
      {
        tema: content.hookCapa || content.slug,
        persona: (content.persona as Persona) || 'empresario',
        pattern: (content.pattern as HookPattern) || undefined,
      },
      content.tenantId,
      content.authorId || undefined,
    );
  }

  /**
   * Regenera UM slide de corpo (RFC §6.4). Prompt focado + Zod; faz splice no
   * slidesData e na linha Slide, e RECONCILIA dropando os overrides do próprio
   * slide (o conteúdo mudou). Overrides dos demais slides ficam intactos.
   */
  async regenerateSlide(
    contentId: string,
    position: number,
    tenantId: string,
    hint?: string,
  ): Promise<SlideOut> {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, tenantId, deletedAt: null },
    });
    if (!content) throw new NotFoundException(`Content ${contentId} not found`);

    const raw = (content.slidesData ?? {}) as unknown as GenerationOutput;
    const bodyIdx = position - 1; // cover=0 → body i ocupa position i+1
    if (!Array.isArray(raw.slides) || bodyIdx < 0 || bodyIdx >= raw.slides.length) {
      throw new BadRequestException(`Posição ${position} não é um slide de corpo`);
    }

    const system = buildRegenerateSlidePrompt({
      persona: content.persona ?? raw.persona ?? 'empresario',
      pattern: content.pattern ?? raw.padrao ?? 'A',
      template: content.template ?? raw.template ?? 'step',
      position,
      total: raw.slides.length + 2,
      current: raw.slides[bodyIdx],
      prev: raw.slides[bodyIdx - 1],
      next: raw.slides[bodyIdx + 1],
      hint,
    });

    const { data: slide } = await this.completeJson({
      system,
      user: 'Reescreva o slide conforme as instruções. Responda só o JSON do slide.',
      schema: SlideOutSchema,
      maxTokens: 1500,
    });

    raw.slides[bodyIdx] = slide as GenerationOutput['slides'][number];
    await this.prisma.content.update({
      where: { id: contentId },
      data: { slidesData: raw as any },
    });

    const dbSlide = await this.prisma.slide.findFirst({ where: { contentId, position } });
    if (dbSlide) {
      await this.prisma.slide.update({
        where: { id: dbSlide.id },
        data: { bodyData: slide as any, sceneOverrides: undefined as any },
      });
      this.logger.log(`Slide ${position} regenerado; overrides do slide descartados (reconcile)`);
    }

    return slide;
  }

  /** Texto JSON da resposta (desembrulha cercas markdown). */
  private extractJsonText(resp: Anthropic.Message): string {
    const block = resp.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Sem resposta de texto do Claude');
    const s = block.text.trim();
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    return (m ? m[1] : s).trim();
  }

  private safeJson(s: string): unknown {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  /**
   * Completa um JSON validado por Zod. SDK cuida de retry (3x) + timeout (30s);
   * em erro de schema, faz UM repair loop reenviando os erros ao Claude.
   */
  private async completeJson<T>(args: {
    system: Anthropic.MessageCreateParams['system'];
    user: string;
    schema: ZodType<T>;
    model?: string;
    maxTokens?: number;
  }): Promise<{ data: T; model: string; usage: { input: number; output: number } }> {
    const model = args.model ?? 'claude-sonnet-4-6';
    const maxTokens = args.maxTokens ?? 4096;
    const opts = { maxRetries: 3, timeout: 30_000 };
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: args.user }];

    let resp = await this.anthropic.messages.create(
      { model, max_tokens: maxTokens, system: args.system, messages },
      opts,
    );
    let text = this.extractJsonText(resp);
    let result = args.schema.safeParse(this.safeJson(text));
    let usage = { input: resp.usage.input_tokens, output: resp.usage.output_tokens };

    if (!result.success) {
      const errs = zodErrorText(result.error);
      this.logger.warn(`Saída fora do schema; repair loop:\n${errs}`);
      const repair = await this.anthropic.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system: args.system,
          messages: [
            ...messages,
            { role: 'assistant', content: text },
            { role: 'user', content: `O JSON acima viola o schema:\n${errs}\nResponda APENAS o JSON corrigido, sem markdown.` },
          ],
        },
        opts,
      );
      text = this.extractJsonText(repair);
      result = args.schema.safeParse(this.safeJson(text));
      usage = { input: usage.input + repair.usage.input_tokens, output: usage.output + repair.usage.output_tokens };
      if (!result.success) throw new Error(`Schema inválido após repair:\n${zodErrorText(result.error)}`);
      resp = repair;
    }

    return { data: result.data, model: resp.model, usage };
  }

  /**
   * Resolve a persona do tenant (cores + vocab do nicho).
   *
   * O vocab do banco tem precedência. Se a persona ainda não tem vocab próprio,
   * cai no vocab.json legado (o dataset dropado em DATASET_DIR) — assim os
   * tenants que já rodavam com o arquivo não perdem qualidade de geração
   * enquanto o vocab não é preenchido em /settings/personas.
   */
  private async resolvePersona(tenantId: string, slug: string) {
    const persona = await this.personas.findBySlug(tenantId, slug);
    if (!persona) {
      throw new BadRequestException(`Persona "${slug}" nao existe neste tenant`);
    }
    if (persona.archivedAt) {
      throw new BadRequestException(`Persona "${persona.name}" esta arquivada`);
    }

    let vocab = await this.personas.vocabFor(tenantId, slug);
    if (Object.keys(vocab).length === 0) {
      const legacy = this.loadJson<Record<string, VocabEntry>>('vocab.json');
      vocab = legacy?.[slug] || legacy?.['geral'] || {};
    }
    return { persona, vocab };
  }

  private loadJson<T>(filename: string): T {
    try {
      const content = readFileSync(join(DATASET_DIR, filename), 'utf-8');
      return JSON.parse(content);
    } catch {
      this.logger.warn(`Dataset file not found: ${filename}`);
      return [] as unknown as T;
    }
  }
}
