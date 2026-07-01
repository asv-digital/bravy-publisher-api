/**
 * ContentText → StyledRun[] (RFC §3.1).
 * Headline já vem segmentada (top/em/bottom). Campos com markup inline
 * (<em>, <strong>, .strong, .keyword, <code>, .cmd) passam por um parser
 * tolerante: markup malformado degrada pra texto puro (nunca quebra).
 * Decorações ORTOGONAIS à chave semântica: <u> (sublinhado),
 * <span data-c="#hex"> (cor do texto) e <span data-bg="#hex"> (destaque).
 */

export type StyleKey = 'ink' | 'em' | 'strong' | 'code' | 'keyword';

export interface StyledRun {
  text: string;
  key: StyleKey;
  /** sublinhado (decoração de pintura; não afeta métricas). */
  underline?: boolean;
  /** cor do texto (hex) — sobrepõe o fill resolvido da chave. */
  color?: string;
  /** cor de destaque atrás do texto (hex). */
  bg?: string;
}

/** estado aninhável do parser: chave semântica + decorações herdadas. */
interface Frame {
  key: StyleKey;
  underline?: boolean;
  color?: string;
  bg?: string;
}

const HEX_RE = /^#[0-9a-f]{3,8}$/i;

// ordem importa: classes específicas antes de tags genéricas
const KEY_RULES: Array<{ re: RegExp; key: StyleKey }> = [
  { re: /^<span class=["']?strong["']?>/i, key: 'strong' },
  { re: /^<span class=["']?keyword["']?>/i, key: 'keyword' },
  { re: /^<span class=["']?cmd["']?>/i, key: 'code' },
  { re: /^<strong>/i, key: 'strong' },
  { re: /^<em>/i, key: 'em' },
  { re: /^<code>/i, key: 'code' },
  { re: /^<b>/i, key: 'strong' },
  { re: /^<i>/i, key: 'em' },
];
const U_OPEN_RE = /^<u>/i;
const COLOR_OPEN_RE = /^<span data-c=["']?(#[0-9a-f]{3,8})["']?>/i;
const BG_OPEN_RE = /^<span data-bg=["']?(#[0-9a-f]{3,8})["']?>/i;
const CLOSE_RE = /^<\/(span|strong|em|code|b|i|u)>/i;

/** Parser inline tolerante → runs. */
export function parseInline(input: string, base: StyleKey = 'ink'): StyledRun[] {
  const runs: StyledRun[] = [];
  const stack: Frame[] = [{ key: base }];
  let i = 0;
  let buf = '';
  const cur = () => stack[stack.length - 1]!;
  const flush = () => {
    if (buf) {
      const f = cur();
      const run: StyledRun = { text: decodeEntities(buf), key: f.key };
      if (f.underline) run.underline = true;
      if (f.color) run.color = f.color;
      if (f.bg) run.bg = f.bg;
      runs.push(run);
      buf = '';
    }
  };
  while (i < input.length) {
    if (input[i] === '<') {
      const rest = input.slice(i);
      const keyRule = KEY_RULES.find((r) => r.re.test(rest));
      if (keyRule) {
        flush();
        stack.push({ ...cur(), key: keyRule.key });
        i += rest.match(keyRule.re)![0].length;
        continue;
      }
      if (U_OPEN_RE.test(rest)) {
        flush();
        stack.push({ ...cur(), underline: true });
        i += rest.match(U_OPEN_RE)![0].length;
        continue;
      }
      const colorM = rest.match(COLOR_OPEN_RE);
      if (colorM && HEX_RE.test(colorM[1]!)) {
        flush();
        stack.push({ ...cur(), color: colorM[1]! });
        i += colorM[0].length;
        continue;
      }
      const bgM = rest.match(BG_OPEN_RE);
      if (bgM && HEX_RE.test(bgM[1]!)) {
        flush();
        stack.push({ ...cur(), bg: bgM[1]! });
        i += bgM[0].length;
        continue;
      }
      const close = rest.match(CLOSE_RE);
      if (close) {
        flush();
        if (stack.length > 1) stack.pop();
        i += close[0].length;
        continue;
      }
      // tag desconhecida: pula até '>' (degrada)
      const gt = input.indexOf('>', i);
      if (gt === -1) {
        buf += input[i];
        i++;
      } else {
        i = gt + 1;
      }
      continue;
    }
    buf += input[i];
    i++;
  }
  flush();
  return runs.length ? runs : [{ text: '', key: base }];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Headline 3-partes → runs (top ink · em accent · bottom ink). */
export function headlineRuns(top?: string, em?: string, bottom?: string): StyledRun[] {
  const runs: StyledRun[] = [];
  if (top?.trim()) runs.push({ text: top.trim() + (em || bottom ? ' ' : ''), key: 'ink' });
  if (em?.trim()) runs.push({ text: em.trim() + (bottom ? ' ' : ''), key: 'em' });
  if (bottom?.trim()) runs.push({ text: bottom.trim(), key: 'ink' });
  return runs.length ? runs : [{ text: '', key: 'ink' }];
}
