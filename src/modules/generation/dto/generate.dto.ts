import { IsString, IsIn, IsOptional, IsObject } from 'class-validator';
import { PATTERNS, Persona, HookPattern, TemplateName } from '../types';

export class GenerateDto {
  @IsString()
  tema: string;

  /** Slug de uma persona do tenant — existência validada no GenerationService. */
  @IsString()
  persona: Persona;

  @IsOptional()
  @IsIn(PATTERNS)
  pattern?: HookPattern;

  /** família visual escolhida no wizard; ausente = automático (pelo pattern). */
  @IsOptional()
  @IsIn(['step', 'compendium', 'tweet', 'custom'])
  template?: TemplateName;

  /** snapshot de estilo do template escolhido (tipografia/paleta) — ex.: Twitter dark. */
  @IsOptional()
  @IsObject()
  styleData?: Record<string, unknown>;
}
