/**
 * Migrações de schemaVersion do DesignDocument (RFC §2.8).
 * Loader roda migrações sequenciais idempotentes antes de resolveScene.
 * Sem isso, mudança no formato de override quebra documentos salvos.
 */
import type { DesignDocument } from './doc.js';
/**
 * Normaliza e migra um doc (possivelmente legado) até CURRENT_SCHEMA_VERSION.
 * Tolerante: doc sem schemaVersion é tratado como v1.
 */
export declare function migrateDoc(doc: DesignDocument): DesignDocument;
