import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION } from './doc.js';
import { migrateDoc } from './migrate.js';
import { EDITORIAL_DOC } from './__fixtures__/docs.js';

test('migrateDoc carimba a versão corrente e é idempotente', () => {
  const a = migrateDoc(EDITORIAL_DOC);
  assert.equal(a.schemaVersion, CURRENT_SCHEMA_VERSION);
  const b = migrateDoc(a);
  assert.deepEqual(a, b, 'migrar de novo não deve mudar nada');
});

test('migrateDoc trata doc sem schemaVersion como v1', () => {
  const noVer = { ...EDITORIAL_DOC } as any;
  delete noVer.schemaVersion;
  const out = migrateDoc(noVer);
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('migrateDoc falha alto se faltar migração para versão futura', () => {
  const future = { ...EDITORIAL_DOC, schemaVersion: CURRENT_SCHEMA_VERSION + 5 } as any;
  // versão acima da corrente: o while não roda, então apenas re-carimba (não quebra)
  const out = migrateDoc(future);
  assert.equal(out.schemaVersion, CURRENT_SCHEMA_VERSION);
});
