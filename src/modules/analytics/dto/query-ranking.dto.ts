import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export const RANKING_SORT_FIELDS = [
  'likes',
  'comments',
  'shares',
  'saves',
  'reposts',
  'reach',
  'impressions',
  'engagementRate',
];

export class QueryRankingDto extends PaginationDto {
  @IsOptional()
  @IsIn(RANKING_SORT_FIELDS)
  sortBy?: string = 'engagementRate';

  @IsOptional()
  @IsIn(['7d', '30d', '60d', '90d'])
  period?: string = '30d';

  @IsOptional()
  @IsString()
  persona?: string;

  @IsOptional()
  @IsString()
  pattern?: string;
}
