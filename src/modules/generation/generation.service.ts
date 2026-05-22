import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../database/prisma.service';
import { FactCheckService } from '../fact-check/fact-check.service';
import { buildSystemPrompt } from './prompts/carousel-prompt';
import { selectTemplate } from './prompts/template-selector';
import { ACCENT_PALETTE } from './prompts/accent-palette';
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
    const vocabAll = this.loadJson<Record<string, VocabEntry>>('vocab.json');
    const vocab = vocabAll[input.persona] || vocabAll['geral'] || {};

    // Select pattern
    const pattern: HookPattern = input.pattern || 'A';
    const templateName = selectTemplate(pattern);
    const accent = ACCENT_PALETTE[input.persona] || ACCENT_PALETTE.empresario;

    // Build prompt
    const systemPrompt = buildSystemPrompt({
      persona: input.persona,
      pattern,
      patterns,
      topPosts,
      vocab,
      accentHex: accent.hex,
    });

    const userPrompt = `Gere um carrossel sobre: ${input.tema}\nPersona: ${input.persona}\nPadrao: ${pattern}`;

    // Call Claude API with prompt caching
    this.logger.log(`Generating carousel: ${input.tema} (${input.persona}, pattern ${pattern})`);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [{
        type: 'text' as const,
        text: systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      }],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const durationMs = Date.now() - startTime;

    // Extract text from response
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const generated: GenerationOutput = JSON.parse(jsonStr);

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
        authorId,
        slides: {
          create: [
            {
              position: 0,
              slideType: 'COVER',
              bodyData: {
                label_topo_capa: generated.label_topo_capa,
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
            model: response.model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            durationMs,
          },
        },
      },
      include: { slides: true, generations: true },
    });

    return content;
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
