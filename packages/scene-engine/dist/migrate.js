import { CURRENT_SCHEMA_VERSION } from './doc.js';
/**
 * Mapa from-version → migração. Cada entrada N transforma vN em v(N+1).
 * (Vazio até a v1; a primeira mudança de formato adiciona MIGRATIONS[1].)
 */
const MIGRATIONS = {};
/**
 * Normaliza e migra um doc (possivelmente legado) até CURRENT_SCHEMA_VERSION.
 * Tolerante: doc sem schemaVersion é tratado como v1.
 */
export function migrateDoc(doc) {
    let d = { ...doc };
    let v = Number.isInteger(d.schemaVersion) ? d.schemaVersion : 1;
    while (v < CURRENT_SCHEMA_VERSION) {
        const step = MIGRATIONS[v];
        if (!step)
            throw new Error(`Sem migração de schemaVersion ${v} → ${v + 1}`);
        d = step(d);
        v += 1;
    }
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
    return d;
}
