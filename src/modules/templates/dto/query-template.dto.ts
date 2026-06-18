import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export class QueryTemplateDto extends PaginationDto {
  @IsOptional()
  @IsIn(['post', 'carousel'])
  kind?: 'post' | 'carousel';

  @IsOptional()
  @IsString()
  search?: string;
}
