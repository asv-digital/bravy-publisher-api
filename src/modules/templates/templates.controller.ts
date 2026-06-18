import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async findAll(@CurrentUser() user: { tenantId: string }, @Query() query: QueryTemplateDto) {
    return this.templatesService.findAll(user.tenantId, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.templatesService.findOne(user.tenantId, id);
  }

  @Post()
  async create(@CurrentUser() user: { tenantId: string }, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(user.tenantId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.templatesService.remove(user.tenantId, id);
  }
}
