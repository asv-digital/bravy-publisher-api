import {
  ArrayMaxSize,
  IsArray,
  IsHexColor,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * `vocab` é Record<string, string[]> com chaves livres — o user nomeia os
 * grupos ("Dores", "Sistemas que já paga"...). class-validator não expressa
 * isso nativamente, daí o constraint custom.
 */
@ValidatorConstraint({ name: 'isVocabMap', async: false })
export class IsVocabMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 20) return false;
    return entries.every(
      ([key, list]) =>
        typeof key === 'string' &&
        key.length > 0 &&
        key.length <= 40 &&
        Array.isArray(list) &&
        list.length <= 60 &&
        list.every((item) => typeof item === 'string' && item.length <= 120),
    );
  }

  defaultMessage(): string {
    return 'vocab deve ser um objeto de grupos (max 20) com listas de strings (max 60 itens, 120 chars)';
  }
}

export class CreatePersonaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @IsHexColor()
  accentHex: string;

  @IsHexColor()
  softHex: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accentLabel?: string;

  @IsOptional()
  @IsObject()
  @Validate(IsVocabMapConstraint)
  vocab?: Record<string, string[]>;
}

export class UpdatePersonaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @IsOptional()
  @IsHexColor()
  accentHex?: string;

  @IsOptional()
  @IsHexColor()
  softHex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accentLabel?: string;

  @IsOptional()
  @IsObject()
  @Validate(IsVocabMapConstraint)
  vocab?: Record<string, string[]>;
}

export class ReorderPersonasDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}
