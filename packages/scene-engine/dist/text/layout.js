import { breakBlock, fitBlockLines, scaleStyle } from './linebreak.js';
/** Posiciona linhas pré-quebradas: baseline (max ascent) + x por align + merge de runs contíguos. */
function positionLines(lines, spec, metrics, scale) {
    const fallback = scaleStyle(spec.styleOf('ink'), scale);
    const out = [];
    let cursorY = 0;
    let maxWidth = 0;
    for (const line of lines) {
        if (line.length === 0) {
            const h = fallback.size * fallback.lineHeight;
            out.push({ runs: [], top: cursorY, height: h, baselineY: cursorY + fallback.size, width: 0 });
            cursorY += h;
            continue;
        }
        const lineW = line.reduce((s, p) => s + p.width, 0);
        const maxAscent = Math.max(...line.map((p) => metrics.measure('Mg', p.style).ascent));
        const lineH = Math.max(...line.map((p) => p.style.size * p.style.lineHeight));
        const baselineY = cursorY + maxAscent;
        const startX = spec.align === 'center' ? (spec.width - lineW) / 2 : spec.align === 'right' ? spec.width - lineW : 0;
        const placed = [];
        let x = startX;
        for (const piece of line) {
            placed.push({ text: piece.text, style: piece.style, x, baselineY });
            x += piece.width;
        }
        // merge runs contíguos de mesmo estilo (mesma referência)
        const merged = [];
        for (const pr of placed) {
            const last = merged[merged.length - 1];
            if (last && last.style === pr.style)
                last.text += pr.text;
            else
                merged.push({ ...pr });
        }
        out.push({ runs: merged, top: cursorY, height: lineH, baselineY, width: lineW });
        cursorY += lineH;
        maxWidth = Math.max(maxWidth, lineW);
    }
    return { lines: out, width: maxWidth, height: cursorY, scale };
}
/** Layout simples (sem auto-fit). */
export function layoutBlock(spec, metrics) {
    const lines = breakBlock(spec.runs, spec.styleOf, metrics, spec.width, 1);
    return positionLines(lines, spec, metrics, 1);
}
/** Auto-fit (shrink-to-fit + reticências): garante height ≤ maxHeight. */
export function fitBlock(spec, metrics, maxHeight, floor = 0.7) {
    const fit = fitBlockLines(spec.runs, spec.styleOf, metrics, spec.width, maxHeight, floor);
    return positionLines(fit.lines, spec, metrics, fit.scale);
}
