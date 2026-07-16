import { IsString, IsOptional, IsIn } from 'class-validator';
import { PATTERNS, Persona, HookPattern } from '../types';

export class SuggestThemeDto {
  /** Slug de uma persona do tenant; desconhecida degrada pro prompt generico. */
  @IsOptional()
  @IsString()
  persona?: Persona;

  @IsOptional()
  @IsString()
  @IsIn(PATTERNS)
  pattern?: HookPattern;

  /** Opcional: dica/area de interesse pra enviesar as sugestoes. */
  @IsOptional()
  @IsString()
  hint?: string;
}
