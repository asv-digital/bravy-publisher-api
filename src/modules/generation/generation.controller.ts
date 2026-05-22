import { Controller, Post, Param, Body } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateDto } from './dto/generate.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('generation')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('generate')
  async generate(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Body() dto: GenerateDto,
  ) {
    return this.generationService.generate(dto, user.tenantId, user.userId);
  }

  @Post('regenerate/:id')
  async regenerate(@Param('id') id: string) {
    return this.generationService.regenerate(id);
  }
}
