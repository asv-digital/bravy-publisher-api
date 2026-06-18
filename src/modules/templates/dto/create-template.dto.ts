import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Template custom criado no designer free-form. `layout` = LayoutSpec (slots). */
export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsIn(['post', 'carousel'])
  kind: 'post' | 'carousel';

  @IsOptional()
  @IsString()
  format?: string;

  /** LayoutSpec: { kind, width, height, background, slots[] }. */
  @IsObject()
  layout: Record<string, unknown>;

  /** snapshot de estilo (paleta/tipografia) opcional. */
  @IsOptional()
  @IsObject()
  styleData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
