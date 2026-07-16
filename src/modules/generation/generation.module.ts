import { Module } from '@nestjs/common';
import { FactCheckModule } from '../fact-check/fact-check.module';
import { PersonasModule } from '../personas/personas.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { SlideImageService } from './slide-image.service';

@Module({
  imports: [FactCheckModule, PersonasModule],
  controllers: [GenerationController],
  providers: [GenerationService, SlideImageService],
  exports: [GenerationService, SlideImageService],
})
export class GenerationModule {}
