/**
 * resolveScene(doc, metrics, brandKit) → SceneGraph (RFC §1, §2.6).
 * Função PURA e isomórfica: mesmo input → mesma cena no browser e no Node.
 */
import type { DesignDocument } from './doc.js';
import type { BrandKit } from './brand-kit.js';
import type { SceneGraph } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';
export declare function resolveScene(doc: DesignDocument, metrics: MetricsProvider, brandKit: BrandKit): SceneGraph;
