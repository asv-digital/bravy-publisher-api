/**
 * resolveScene(doc, metrics, brandKit) → SceneGraph (RFC §1, §2.6).
 * Função PURA e isomórfica: mesmo input → mesma cena no browser e no Node.
 */
import type { DesignDocument, TypographyOverride } from './doc.js';
import type { BrandKit } from './brand-kit.js';
import { resolveTokens } from './tokens.js';
import type { SceneGraph, SceneSlide } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';
import { getTemplate, registerTemplate } from './templates/registry.js';
import { stepTemplate } from './templates/step.js';
import { compendiumTemplate } from './templates/compendium.js';
import { tweetTemplate } from './templates/tweet.js';
import { layoutTemplate } from './templates/layout.js';
import { applyOverrides } from './overrides.js';
import { materializeUserNodes } from './user-nodes.js';
import { migrateDoc } from './migrate.js';

registerTemplate(stepTemplate);
registerTemplate(compendiumTemplate);
registerTemplate(tweetTemplate);

function applyTypographyOverride(kit: BrandKit, ov?: Partial<Record<'display' | 'body' | 'mono' | 'accent', TypographyOverride['display']>>): BrandKit {
  if (!ov) return kit;
  const typography = { ...kit.typography };
  for (const role of ['display', 'body', 'mono', 'accent'] as const) {
    const o = ov[role];
    if (o) typography[role] = { ...typography[role], family: o.family, weights: o.weights, style: o.style, source: 'google' };
  }
  return { ...kit, typography };
}

export function resolveScene(doc: DesignDocument, metrics: MetricsProvider, brandKit: BrandKit): SceneGraph {
  const migrated = migrateDoc(doc);
  const kit = applyTypographyOverride(brandKit, migrated.typographyOverride);
  const tokens = resolveTokens(kit);
  const program =
    migrated.content.template === 'custom' && migrated.layout
      ? layoutTemplate(migrated.layout)
      : getTemplate(migrated.content.template);

  // tipografia por container (override do usuário) — containerIds são únicos
  // (cover/*, slide[i]/*, cta/*), então um mapa global serve todos os slides.
  const typoMap = new Map<string, { family?: string; weight?: number }>();
  for (const map of Object.values(migrated.overrides ?? {})) {
    for (const [id, ov] of Object.entries(map)) {
      if (ov.family || ov.weight) typoMap.set(id, { family: ov.family, weight: ov.weight });
    }
  }
  const typo = typoMap.size ? (id: string) => typoMap.get(id) : undefined;

  const raw = program.build(migrated.content, { tokens, metrics, typo });

  const slides: SceneSlide[] = raw.map((rs, index) => ({
    index,
    width: 1080,
    height: 1080,
    background: rs.background,
    nodes: [
      ...applyOverrides(rs.nodes, migrated.overrides?.[index], kit.palette, metrics),
      ...materializeUserNodes(migrated.added?.[index], tokens, metrics),
    ],
  }));

  return { slides };
}
