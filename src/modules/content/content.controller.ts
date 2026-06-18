import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { CreateSlideDto } from './dto/create-slide.dto';
import { UpdateSlideDto } from './dto/update-slide.dto';
import { BulkDeleteDto, BulkUpdateStatusDto } from './dto/bulk-content.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('contents')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  async findAll(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Query() query: QueryContentDto,
  ) {
    return this.contentService.findAll(user.tenantId, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
  ) {
    return this.contentService.findOne(id, user.tenantId);
  }

  @Post()
  async create(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Body() dto: CreateContentDto,
  ) {
    return this.contentService.create(dto, user.tenantId, user.userId);
  }

  @Post('bulk-delete')
  async bulkDelete(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Body() dto: BulkDeleteDto,
  ) {
    return this.contentService.bulkSoftDelete(dto.ids, user.tenantId);
  }

  @Post('bulk-status')
  async bulkStatus(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Body() dto: BulkUpdateStatusDto,
  ) {
    return this.contentService.bulkUpdateStatus(dto.ids, user.tenantId, dto.status);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.contentService.update(id, user.tenantId, dto);
  }

  @Patch(':id/status')
  async transitionStatus(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
  ) {
    return this.contentService.transitionStatus(id, user.tenantId, dto.targetStatus);
  }

  @Post(':id/duplicate')
  async duplicate(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
  ) {
    return this.contentService.duplicate(id, user.tenantId, user.userId);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
  ) {
    return this.contentService.softDelete(id, user.tenantId);
  }

  @Get(':id/slides')
  async findSlides(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
  ) {
    return this.contentService.findSlides(id, user.tenantId);
  }

  @Post(':id/slides')
  async createSlide(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('id') id: string,
    @Body() dto: CreateSlideDto,
  ) {
    return this.contentService.createSlide(id, user.tenantId, dto);
  }

  @Patch(':contentId/slides/:slideId')
  async updateSlide(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('contentId') contentId: string,
    @Param('slideId') slideId: string,
    @Body() dto: UpdateSlideDto,
  ) {
    return this.contentService.updateSlide(contentId, slideId, user.tenantId, dto);
  }

  @Delete(':contentId/slides/:slideId')
  async deleteSlide(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('contentId') contentId: string,
    @Param('slideId') slideId: string,
  ) {
    return this.contentService.deleteSlide(contentId, slideId, user.tenantId);
  }
}
