import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Persona } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Personas por tenant. As 6 abaixo são o SEED do nicho original — criadas lazy
 * no primeiro acesso do tenant. Não são especiais: depois de semeadas o user
 * edita, renomeia, recolore e arquiva como qualquer persona que ele criar.
 *
 * Mantido em sincronia com o que era hardcoded em frontend/src/lib/constants.ts
 * (PERSONAS + PERSONA_COLORS) e generation/prompts/accent-palette.ts.
 */
const SEED_PERSONAS: Array<{
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentHex: string;
  softHex: string;
  accentLabel: string;
}> = [
  {
    slug: 'contador',
    name: 'Contador',
    description: 'Profissionais contabeis, escritorios, BPO fiscal',
    icon: 'Calculator',
    accentHex: '#3B5D3A',
    softHex: '#E8F0E8',
    accentLabel: 'Verde escuro',
  },
  {
    slug: 'advogado',
    name: 'Advogado',
    description: 'Escritorios juridicos, departamentos legais',
    icon: 'Scale',
    accentHex: '#8B2635',
    softHex: '#F5E8EB',
    accentLabel: 'Bordo',
  },
  {
    slug: 'empresario',
    name: 'Empresario',
    description: 'Gestores, donos de empresa, diretores',
    icon: 'Briefcase',
    accentHex: '#DA7756',
    softHex: '#FBF0EC',
    accentLabel: 'Laranja Claude',
  },
  {
    slug: 'arquiteto',
    name: 'Arquiteto',
    description: 'Escritorios de arquitetura e engenharia',
    icon: 'Ruler',
    accentHex: '#C8932F',
    softHex: '#F8F0E0',
    accentLabel: 'Ocre',
  },
  {
    slug: 'engenheiro',
    name: 'Engenheiro',
    description: 'Engenheiros civis, mecanicos, eletricos',
    icon: 'Wrench',
    accentHex: '#4A6FA5',
    softHex: '#E8EFF8',
    accentLabel: 'Azul',
  },
  {
    slug: 'agencia',
    name: 'Agencia',
    description: 'Agencias de marketing, publicidade, social media',
    icon: 'Megaphone',
    accentHex: '#7B4DAA',
    softHex: '#F0E8F8',
    accentLabel: 'Roxo',
  },
];

/** Fallback de cor quando a persona pedida não existe mais (conteúdo antigo). */
export const FALLBACK_ACCENT = { accentHex: '#DA7756', softHex: '#FBF0EC', accentLabel: 'Laranja Claude' };

export type VocabMap = Record<string, string[]>;

export interface PersonaPatch {
  name?: string;
  description?: string | null;
  icon?: string;
  accentHex?: string;
  softHex?: string;
  accentLabel?: string | null;
  vocab?: VocabMap;
  sortOrder?: number;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

@Injectable()
export class PersonasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista as personas ativas do tenant, semeando as defaults se for o primeiro
   * acesso. Espelha BrandKitService.getOrCreateDefault — sem migration de
   * backfill, o tenant ganha as personas na primeira leitura.
   */
  async listForTenant(tenantId: string, includeArchived = false): Promise<Persona[]> {
    const existing = await this.prisma.persona.findMany({
      where: { tenantId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (existing.length > 0) return existing;

    // Só semeia se o tenant nunca teve persona alguma — um tenant que arquivou
    // todas não deve vê-las ressuscitar na próxima listagem.
    const anyEver = await this.prisma.persona.count({ where: { tenantId } });
    if (anyEver > 0) return existing;

    await this.seedDefaults(tenantId);
    return this.prisma.persona.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async seedDefaults(tenantId: string): Promise<void> {
    await this.prisma.persona.createMany({
      data: SEED_PERSONAS.map((p, i) => ({ ...p, tenantId, sortOrder: i, vocab: {} })),
      skipDuplicates: true,
    });
  }

  async findBySlug(tenantId: string, slug: string): Promise<Persona | null> {
    return this.prisma.persona.findUnique({ where: { tenantId_slug: { tenantId, slug } } });
  }

  async getById(tenantId: string, id: string): Promise<Persona> {
    const persona = await this.prisma.persona.findFirst({ where: { id, tenantId } });
    if (!persona) throw new NotFoundException(`Persona ${id} nao encontrada`);
    return persona;
  }

  async create(
    tenantId: string,
    dto: { name: string; description?: string; icon?: string; accentHex: string; softHex: string; accentLabel?: string; vocab?: VocabMap },
  ): Promise<Persona> {
    const slug = slugify(dto.name);
    if (!slug) throw new BadRequestException('Nome da persona invalido');

    const clash = await this.findBySlug(tenantId, slug);
    if (clash) throw new ConflictException(`Ja existe uma persona "${dto.name}"`);

    const last = await this.prisma.persona.findFirst({
      where: { tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.persona.create({
      data: {
        tenantId,
        slug,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        icon: dto.icon || 'Users',
        accentHex: dto.accentHex,
        softHex: dto.softHex,
        accentLabel: dto.accentLabel || null,
        vocab: (dto.vocab ?? {}) as object,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  /**
   * O slug NÃO muda no update, mesmo que o nome mude: Content.persona aponta
   * pro slug, e renomear não pode órfãozar o conteúdo já gerado.
   */
  async update(tenantId: string, id: string, patch: PersonaPatch): Promise<Persona> {
    await this.getById(tenantId, id);
    return this.prisma.persona.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...(patch.description !== undefined && { description: patch.description?.trim() || null }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.accentHex !== undefined && { accentHex: patch.accentHex }),
        ...(patch.softHex !== undefined && { softHex: patch.softHex }),
        ...(patch.accentLabel !== undefined && { accentLabel: patch.accentLabel || null }),
        ...(patch.vocab !== undefined && { vocab: patch.vocab as object }),
        ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      },
    });
  }

  async archive(tenantId: string, id: string): Promise<Persona> {
    await this.getById(tenantId, id);
    return this.prisma.persona.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async restore(tenantId: string, id: string): Promise<Persona> {
    await this.getById(tenantId, id);
    return this.prisma.persona.update({ where: { id }, data: { archivedAt: null } });
  }

  async reorder(tenantId: string, ids: string[]): Promise<Persona[]> {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.persona.updateMany({ where: { id, tenantId }, data: { sortOrder: i } }),
      ),
    );
    return this.listForTenant(tenantId);
  }

  /** Vocab da persona no formato que o prompt de geração consome. */
  async vocabFor(tenantId: string, slug: string): Promise<VocabMap> {
    const persona = await this.findBySlug(tenantId, slug);
    const vocab = persona?.vocab as VocabMap | null;
    if (!vocab) return {};
    // defensivo: Json aceita qualquer coisa, o prompt espera string[]
    return Object.fromEntries(
      Object.entries(vocab).filter(([, v]) => Array.isArray(v) && v.length > 0),
    );
  }

  /** Acento da persona, com fallback pra conteúdo cuja persona sumiu. */
  async accentFor(tenantId: string, slug: string) {
    const persona = await this.findBySlug(tenantId, slug);
    if (!persona) return FALLBACK_ACCENT;
    return {
      accentHex: persona.accentHex,
      softHex: persona.softHex,
      accentLabel: persona.accentLabel ?? FALLBACK_ACCENT.accentLabel,
    };
  }
}
