import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePersonaDto, ReorderPersonasDto, UpdatePersonaDto } from './dto/persona.dto';
import { PersonasService } from './personas.service';

@Controller('personas')
export class PersonasController {
  constructor(private readonly service: PersonasService) {}

  @Get()
  async list(
    @CurrentUser() user: { tenantId: string },
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.service.listForTenant(user.tenantId, includeArchived === 'true');
  }

  @Post()
  async create(@CurrentUser() user: { tenantId: string }, @Body() dto: CreatePersonaDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch('reorder')
  async reorder(@CurrentUser() user: { tenantId: string }, @Body() dto: ReorderPersonasDto) {
    return this.service.reorder(user.tenantId, dto.ids);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdatePersonaDto,
  ) {
    return this.service.update(user.tenantId, id, dto);
  }

  /** Arquiva em vez de deletar — conteúdo já gerado referencia o slug. */
  @Post(':id/archive')
  async archive(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.service.archive(user.tenantId, id);
  }

  @Post(':id/restore')
  async restore(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.service.restore(user.tenantId, id);
  }
}
