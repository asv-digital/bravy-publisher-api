import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedTextStyle } from '../scene.js';
import type { StyleKey } from './runs.js';
import { parseInline } from './runs.js';
import { MockMetrics } from '../__fixtures__/mock-metrics.js';
import { tokenize } from './linebreak.js';

test('parseInline: chaves semânticas básicas', () => {
  const runs = parseInline('a <em>b</em> <strong>c</strong>');
  assert.deepEqual(runs, [
    { text: 'a ', key: 'ink' },
    { text: 'b', key: 'em' },
    { text: ' ', key: 'ink' },
    { text: 'c', key: 'strong' },
  ]);
});

test('parseInline: <u> vira decoração underline ortogonal à chave', () => {
  const runs = parseInline('a <u>sub</u> b');
  assert.deepEqual(runs, [
    { text: 'a ', key: 'ink' },
    { text: 'sub', key: 'ink', underline: true },
    { text: ' b', key: 'ink' },
  ]);
});

test('parseInline: decoração aninha com chave (underline + em)', () => {
  const runs = parseInline('<u><em>x</em></u>');
  assert.deepEqual(runs, [{ text: 'x', key: 'em', underline: true }]);
});

test('parseInline: data-c e data-bg carregam cores hex', () => {
  const runs = parseInline('<span data-c="#C7634F">cor</span><span data-bg="#FFE08A">marca</span>');
  assert.deepEqual(runs, [
    { text: 'cor', key: 'ink', color: '#C7634F' },
    { text: 'marca', key: 'ink', bg: '#FFE08A' },
  ]);
});

test('parseInline: span com cor inválida degrada pra texto puro (tag ignorada)', () => {
  const runs = parseInline('<span data-c="red">x</span>');
  assert.deepEqual(runs, [{ text: 'x', key: 'ink' }]);
});

test('tokenize: decorações entram no estilo resolvido (cor sobrepõe fill)', () => {
  const metrics = new MockMetrics();
  const base: ResolvedTextStyle = { family: 'Test', weight: 400, italic: false, size: 40, fill: '#000', letterSpacingEm: 0, lineHeight: 1.2 };
  const styleOf = (_k: StyleKey) => base;
  const runs = parseInline('a <u><span data-c="#C7634F"><span data-bg="#FFE08A">b</span></span></u>');
  const [para] = tokenize(runs, styleOf, metrics, 1);
  const plain = para!.find((p) => p.text === 'a')!;
  const deco = para!.find((p) => p.text === 'b')!;
  assert.equal(plain.style.fill, '#000');
  assert.equal(plain.style.underline, undefined);
  assert.equal(deco.style.fill, '#C7634F');
  assert.equal(deco.style.underline, true);
  assert.equal(deco.style.bg, '#FFE08A');
});
