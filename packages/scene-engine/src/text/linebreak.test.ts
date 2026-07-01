import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedTextStyle } from '../scene.js';
import type { StyleKey } from './runs.js';
import { MockMetrics } from '../__fixtures__/mock-metrics.js';
import { breakBlock, blockHeight, fitBlockLines, lineHeightPx } from './linebreak.js';

const metrics = new MockMetrics();

function style(size: number, key: StyleKey = 'ink'): ResolvedTextStyle {
  return {
    family: 'Test', weight: key === 'ink' ? 800 : 400, italic: key === 'em',
    size, fill: '#000', letterSpacingEm: 0, lineHeight: 1.2,
  };
}
const styleOf = (sizes: Partial<Record<StyleKey, number>>, base = 40) => (k: StyleKey) => style(sizes[k] ?? base, k);

test('breakBlock quebra texto longo em múltiplas linhas dentro da largura', () => {
  const so = styleOf({}, 40);
  const lines = breakBlock([{ text: 'um dois tres quatro cinco seis sete oito nove dez', key: 'ink' }], so, metrics, 300);
  assert.ok(lines.length > 1, 'deveria quebrar em >1 linha');
  for (const line of lines) {
    const w = line.reduce((s, p) => s + p.width, 0);
    // cada linha cabe (tolerância de 1 palavra: greedy garante prefixo ≤ W)
    assert.ok(w <= 300 + 1e-6 || line.length === 1, `linha excede a caixa: ${w}`);
  }
});

test('quebra explícita por \\n cria parágrafos separados', () => {
  const so = styleOf({}, 40);
  const lines = breakBlock([{ text: 'linha um\nlinha dois', key: 'ink' }], so, metrics, 9999);
  assert.equal(lines.length, 2);
});

test('parágrafo vazio vira linha em branco', () => {
  const so = styleOf({}, 40);
  const lines = breakBlock([{ text: 'a\n\nb', key: 'ink' }], so, metrics, 9999);
  assert.equal(lines.length, 3);
  assert.equal(lines[1]!.length, 0);
});

test('fitBlockLines encolhe até caber em maxHeight', () => {
  const so = styleOf({}, 80);
  const runs = [{ text: 'palavra '.repeat(40).trim(), key: 'ink' as StyleKey }];
  const max = 360;
  const fit = fitBlockLines(runs, so, metrics, 800, max, 0.5);
  assert.ok(fit.scale < 1, 'deveria ter encolhido');
  assert.ok(blockHeight(fit.lines, so('ink')) <= max + 1e-6, 'altura final estourou a caixa');
});

test('fitBlockLines trunca com reticências quando nem o floor cabe', () => {
  const so = styleOf({}, 80);
  const runs = [{ text: 'palavra '.repeat(200).trim(), key: 'ink' as StyleKey }];
  const max = 200;
  const fit = fitBlockLines(runs, so, metrics, 600, max, 0.7);
  assert.equal(fit.truncated, true);
  assert.ok(blockHeight(fit.lines, so('ink')) <= max + 1e-6, 'altura final estourou a caixa');
  const last = fit.lines.at(-1)!;
  const lastText = last.map((p) => p.text).join('');
  assert.ok(lastText.endsWith('…'), `última linha deveria terminar com reticências: "${lastText}"`);
});

test('lineHeightPx usa o maior lineHeight dos pieces da linha', () => {
  const so = styleOf({ em: 100 }, 40);
  const lines = breakBlock([{ text: 'a ', key: 'ink' }, { text: 'B', key: 'em' }], so, metrics, 9999);
  assert.equal(lineHeightPx(lines[0]!, so('ink')), 100 * 1.2);
});
