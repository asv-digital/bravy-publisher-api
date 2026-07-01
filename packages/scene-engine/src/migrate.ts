/**
 * Migrações de schemaVersion do DesignDocument (RFC §2.8).
 * Loader roda migrações sequenciais idempotentes antes de resolveScene.
 * Sem isso, mudança no formato de override quebra documentos salvos.
 */
import type { DesignDocument } from './doc.js';
import { CURRENT_SCHEMA_VERSION } from './doc.js';

/** Recebe o doc na versão N, devolve na versão N+1. */
type Migration = (doc: any) => any;

/**
 * Mapa from-version → migração. Cada entrada N transforma vN em v(N+1).
 * (Vazio até a v1; a primeira mudança de formato adiciona MIGRATIONS[1].)
 */
const MIGRATIONS: Record<number, Migration> = {};

/**
 * Normaliza e migra um doc (possivelmente legado) até CURRENT_SCHEMA_VERSION.
 * Tolerante: doc sem schemaVersion é tratado como v1.
 */
export function migrateDoc(doc: DesignDocument): DesignDocument {
  let d: any = { ...doc };
  let v: number = Number.isInteger(d.schemaVersion) ? d.schemaVersion : 1;

  while (v < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Sem migração de schemaVersion ${v} → ${v + 1}`);
    d = step(d);
    v += 1;
  }

  d.schemaVersion = CURRENT_SCHEMA_VERSION;
  return d as DesignDocument;
}
