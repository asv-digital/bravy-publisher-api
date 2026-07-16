import { Injectable, Logger } from '@nestjs/common';
import { BrandKit } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Brand Kit por tenant (RFC §13). O kit editorial JP.ASV abaixo é o SEED —
 * criado lazy no primeiro acesso do tenant; daí em diante o user edita
 * (cada edição incrementa `version`; contents guardam snapshot da versão).
 * Mantido em sincronia com SEED_BRAND_KIT de packages/scene-engine.
 */
const SEED_TYPOGRAPHY = {
  display: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800], style: 'normal', source: 'bundled' },
  body: { family: 'Plus Jakarta Sans', weights: [400, 500, 700], style: 'normal', source: 'bundled' },
  mono: { family: 'JetBrains Mono', weights: [400, 500, 600], style: 'normal', source: 'bundled' },
  accent: { family: 'DM Serif Display', weights: [400], style: 'italic', source: 'bundled' },
};

const SEED_PALETTE = {
  bg: '#F2EBE0',
  bg2: '#E8E0D2',
  bgRose: '#EBDAC8',
  cardBg: '#FAF6ED',
  ink: '#1A1815',
  inkSoft: '#3A3530',
  muted: '#8A8275',
  accent: '#C7634F',
  accentSoft: '#D9785F',
  line: '#C9BFA9',
  termBg: '#1F1D1A',
  termText: '#E5DFD0',
  termMuted: '#9C9586',
  termStrong: '#FFFFFF',
  termPill: '#2D2A26',
  termPillBorder: '#3A3631',
};

const SEED_BRAND = {
  handle: '',
  breadcrumb: '',
  ctaKeyword: '',
  logoGlyph: '',
};

export interface BrandKitPatch {
  typography?: Record<string, unknown>;
  palette?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  name?: string;
  template?: string;
}

@Injectable()
export class BrandKitService {
  private readonly logger = new Logger(BrandKitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Kit default do tenant; cria com o seed editorial no primeiro acesso. */
  async getOrCreateDefault(tenantId: string): Promise<BrandKit> {
    const existing = await this.prisma.brandKit.findFirst({
      where: { tenantId, isDefault: true },
    });
    if (existing) return existing;

    this.logger.log(`Semeando Brand Kit default para tenant ${tenantId}`);
    return this.prisma.brandKit.create({
      data: {
        tenantId,
        isDefault: true,
        typography: SEED_TYPOGRAPHY as any,
        palette: SEED_PALETTE as any,
        brand: SEED_BRAND as any,
      },
    });
  }

  /** Merge raso por seção + version++ (snapshot dos contents não reflui, §13.2). */
  async update(tenantId: string, patch: BrandKitPatch): Promise<BrandKit> {
    const kit = await this.getOrCreateDefault(tenantId);
    return this.prisma.brandKit.update({
      where: { id: kit.id },
      data: {
        typography: (patch.typography ?? kit.typography) as any,
        palette: (patch.palette ?? kit.palette) as any,
        brand: (patch.brand ?? kit.brand) as any,
        version: { increment: 1 },
      },
    });
  }

  // ---- estilos nomeados (presets do usuário) ----

  /** todos os kits do tenant (default + estilos nomeados). */
  async list(tenantId: string): Promise<BrandKit[]> {
    await this.getOrCreateDefault(tenantId); // garante o default
    return this.prisma.brandKit.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** cria um estilo nomeado do zero (base = seed quando seção ausente). */
  async createStyle(tenantId: string, patch: BrandKitPatch): Promise<BrandKit> {
    return this.prisma.brandKit.create({
      data: {
        tenantId,
        isDefault: false,
        name: patch.name ?? 'Meu estilo',
        template: patch.template ?? 'step',
        typography: (patch.typography ?? SEED_TYPOGRAPHY) as any,
        palette: (patch.palette ?? SEED_PALETTE) as any,
        brand: (patch.brand ?? SEED_BRAND) as any,
      },
    });
  }

  async updateStyle(tenantId: string, id: string, patch: BrandKitPatch): Promise<BrandKit> {
    const kit = await this.prisma.brandKit.findFirst({ where: { id, tenantId } });
    if (!kit) throw new Error(`Estilo ${id} não encontrado`);
    return this.prisma.brandKit.update({
      where: { id },
      data: {
        name: patch.name ?? kit.name,
        template: patch.template ?? kit.template,
        typography: (patch.typography ?? kit.typography) as any,
        palette: (patch.palette ?? kit.palette) as any,
        brand: (patch.brand ?? kit.brand) as any,
        version: { increment: 1 },
      },
    });
  }

  async removeStyle(tenantId: string, id: string): Promise<void> {
    const kit = await this.prisma.brandKit.findFirst({ where: { id, tenantId } });
    if (!kit || kit.isDefault) return; // default não se apaga
    await this.prisma.brandKit.delete({ where: { id } });
  }

  /** Reseta o kit do tenant de volta pro seed editorial (version++). */
  async resetToSeed(tenantId: string): Promise<BrandKit> {
    const kit = await this.getOrCreateDefault(tenantId);
    return this.prisma.brandKit.update({
      where: { id: kit.id },
      data: {
        typography: SEED_TYPOGRAPHY as any,
        palette: SEED_PALETTE as any,
        brand: SEED_BRAND as any,
        version: { increment: 1 },
      },
    });
  }
}
