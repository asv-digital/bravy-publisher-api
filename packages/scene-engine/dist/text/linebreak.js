export function scaleStyle(s, scale) {
    return scale === 1 ? s : { ...s, size: s.size * scale };
}
/** funde as decorações do run no estilo resolvido (cor sobrepõe o fill da chave). */
function decorate(s, run) {
    if (!run.underline && !run.color && !run.bg)
        return s;
    const out = { ...s };
    if (run.color)
        out.fill = run.color;
    if (run.underline)
        out.underline = true;
    if (run.bg)
        out.bg = run.bg;
    return out;
}
/** runs → parágrafos de pieces (split por '\n' explícito, espaços viram tokens). */
export function tokenize(runs, styleOf, metrics, scale) {
    const paragraphs = [[]];
    for (const run of runs) {
        const style = decorate(scaleStyle(styleOf(run.key), scale), run);
        const segments = run.text.split('\n');
        for (let s = 0; s < segments.length; s++) {
            if (s > 0)
                paragraphs.push([]);
            const seg = segments[s];
            const chunks = seg.split(/(\s+)/).filter((c) => c.length > 0);
            const para = paragraphs[paragraphs.length - 1];
            for (const chunk of chunks) {
                const isSpace = /^\s+$/.test(chunk);
                para.push({ text: chunk, key: run.key, style, width: metrics.measure(chunk, style).width, isSpace });
            }
        }
    }
    return paragraphs;
}
function trimLine(line) {
    let a = 0;
    let b = line.length;
    while (a < b && line[a].isSpace)
        a++;
    while (b > a && line[b - 1].isSpace)
        b--;
    return line.slice(a, b);
}
/** Quebra gulosa de UM parágrafo numa caixa de largura W. Mantém o estilo por piece. */
export function breakParagraph(para, width) {
    if (para.length === 0)
        return [[]]; // parágrafo vazio = uma linha em branco
    const lines = [];
    let line = [];
    let lineW = 0;
    for (const piece of para) {
        if (piece.isSpace && line.length === 0)
            continue;
        const tentative = lineW + piece.width;
        if (!piece.isSpace && line.length > 0 && tentative > width) {
            lines.push(trimLine(line));
            line = [piece];
            lineW = piece.width;
        }
        else {
            line.push(piece);
            lineW = tentative;
        }
    }
    lines.push(trimLine(line));
    return lines;
}
/** Bloco inteiro (todos os parágrafos) quebrado em linhas, preservando linhas em branco. */
export function breakBlock(runs, styleOf, metrics, width, scale = 1) {
    const out = [];
    for (const para of tokenize(runs, styleOf, metrics, scale)) {
        for (const line of breakParagraph(para, width))
            out.push(line);
    }
    return out;
}
/** Altura em px de uma linha (max do lineHeight dos pieces; fallback p/ linha vazia). */
export function lineHeightPx(line, fallback) {
    if (line.length === 0)
        return fallback.size * fallback.lineHeight;
    return Math.max(...line.map((p) => p.style.size * p.style.lineHeight));
}
/** Altura total do bloco quebrado. */
export function blockHeight(lines, fallback) {
    return lines.reduce((h, l) => h + lineHeightPx(l, fallback), 0);
}
/**
 * Auto-fit (shrink-to-fit): busca binária em escala [floor,1] até o bloco
 * caber em maxHeight. Se nem no floor couber, trunca linhas excedentes e
 * coloca reticências na última linha visível — GARANTE que não estoura a caixa.
 */
export function fitBlockLines(runs, styleOf, metrics, width, maxHeight, floor, fallbackKey = 'ink') {
    const fb1 = scaleStyle(styleOf(fallbackKey), 1);
    let lines = breakBlock(runs, styleOf, metrics, width, 1);
    if (blockHeight(lines, fb1) <= maxHeight)
        return { lines, scale: 1, truncated: false };
    let lo = floor;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const fbMid = scaleStyle(styleOf(fallbackKey), mid);
        const h = blockHeight(breakBlock(runs, styleOf, metrics, width, mid), fbMid);
        if (h <= maxHeight)
            lo = mid;
        else
            hi = mid;
    }
    const fbLo = scaleStyle(styleOf(fallbackKey), lo);
    lines = breakBlock(runs, styleOf, metrics, width, lo);
    if (blockHeight(lines, fbLo) <= maxHeight)
        return { lines, scale: lo, truncated: false };
    // nem no floor coube → trunca e elipsa
    const kept = [];
    let acc = 0;
    for (const line of lines) {
        const h = lineHeightPx(line, fbLo);
        if (acc + h > maxHeight && kept.length > 0)
            break;
        kept.push(line);
        acc += h;
    }
    ellipsize(kept[kept.length - 1], metrics);
    return { lines: kept, scale: lo, truncated: true };
}
/** Acrescenta '…' ao último piece de texto da linha (in-place). */
function ellipsize(line, metrics) {
    for (let i = line.length - 1; i >= 0; i--) {
        const p = line[i];
        if (p.isSpace)
            continue;
        p.text = p.text.replace(/[.,;:]?$/, '') + '…';
        p.width = metrics.measure(p.text, p.style).width;
        return;
    }
}
