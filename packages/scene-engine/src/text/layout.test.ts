import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedTextStyle } from '../scene.js';
import type { StyleKey } from './runs.js';
import { MockMetrics } from '../__fixtures__/mock-metrics.js';
import { fitBlock, layoutBlock } from './layout.js';

const metrics = new MockMetrics();
const mk = (size: number, key: StyleKey): ResolvedTextStyle => ({
  family: 'Test', weight: 400, italic: key === 'em', size, fill: '#000', letterSpacingEm: 0, lineHeight: 1.2,
});
const styleOf = (k: StyleKey) => (k === 'em' ? mk(100, k) : mk(40, k));

test('baseline compartilhada entre estilos mistos na mesma linha', () => {
  const block = layoutBlock({ runs: [{ text: 'ink ', key: 'ink' }, { text: 'EM', key: 'em' }], width: 9999, styleOf }, metrics);
  assert.equal(block.lines.length, 1);
  const bys = new Set(block.lines[0]!.runs.map((r) => r.baselineY));
  assert.equal(bys.size, 1, 'runs da mesma linha devem dividir a baseline');
  // baseline = maxAscent (do em, size 100 → 80)
  assert.equal([...bys][0], 100 * 0.8);
});

test('align center centraliza a linha na caixa', () => {
  const block = layoutBlock({ runs: [{ text: 'abc', key: 'ink' }], width: 1000, styleOf, align: 'center' }, metrics);
  const first = block.lines[0]!.runs[0]!;
  const lineW = block.lines[0]!.width;
  assert.ok(Math.abs(first.x - (1000 - lineW) / 2) < 1e-6);
});

test('fitBlock nunca devolve altura maior que maxHeight', () => {
  const runs = [{ text: 'palavra '.repeat(120).trim(), key: 'ink' as StyleKey }];
  const block = fitBlock({ runs, width: 600, styleOf: (k) => mk(70, k) }, metrics, 240, 0.7);
  assert.ok(block.height <= 240 + 1e-6, `estourou: ${block.height}`);
});
