import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { Prisma } from '@prisma/client';

const SELECT = {
  id: true,
  name: true,
  kind: true,
  format: true,
  layout: true,
  styleData: true,
  thumbnailUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TemplateSelect;

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: QueryTemplateDto) {
    const { kind, search } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.TemplateWhereInput = { tenantId };
    if (kind) where.kind = kind;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: SELECT,
      }),
      this.prisma.template.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(tenantId: string, id: string) {
    const template = await this.prisma.template.findFirst({ where: { id, tenantId }, select: SELECT });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  async create(tenantId: string, dto: CreateTemplateDto) {
    return this.prisma.template.create({
      data: {
        tenantId,
        name: dto.name,
        kind: dto.kind,
        format: dto.format ?? '1:1',
        layout: dto.layout as Prisma.InputJsonValue,
        styleData: (dto.styleData as Prisma.InputJsonValue) ?? undefined,
        thumbnailUrl: dto.thumbnailUrl,
      },
      select: SELECT,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTemplateDto) {
    await this.findOne(tenantId, id);
    return this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.layout !== undefined ? { layout: dto.layout as Prisma.InputJsonValue } : {}),
        ...(dto.styleData !== undefined ? { styleData: dto.styleData as Prisma.InputJsonValue } : {}),
        ...(dto.thumbnailUrl !== undefined ? { thumbnailUrl: dto.thumbnailUrl } : {}),
      },
      select: SELECT,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.template.delete({ where: { id } });
    return { id };
  }
}
