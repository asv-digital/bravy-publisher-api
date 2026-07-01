/**
 * Template CUSTOM data-driven (RFC fase 2) — `layoutTemplate(spec)` recebe um
 * LayoutSpec (slots desenhados pelo usuário) e devolve um TemplateProgram que
 * preenche cada slot com o conteúdo e emite a cena. `kind: 'post'` → 1 slide;
 * `kind: 'carousel'` → o mesmo molde aplicado a capa / corpo[i] / CTA.
 * Texto auto-encolhe (fitBlock) pra caber no frame; slot sem conteúdo some.
 */
import type { LayoutSpec } from '../doc.js';
import type { TemplateProgram } from './registry.js';
export declare function layoutTemplate(layout: LayoutSpec): TemplateProgram;
