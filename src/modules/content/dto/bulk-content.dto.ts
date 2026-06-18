import { IsArray, IsEnum, IsUUID, ArrayNotEmpty } from 'class-validator';
import { ContentStatus } from '@prisma/client';

export class BulkDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class BulkUpdateStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];

  @IsEnum(ContentStatus)
  status: ContentStatus;
}
