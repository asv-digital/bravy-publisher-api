import { nid, slidePrefix } from '../ids.js';
import { parseInline } from '../text/runs.js';
import { fitBlock, layoutBlock } from '../text/layout.js';
const W = 1080;
const H = 1080;
function st(tokens, role, weight, size, fill, o = {}) {
    const f = tokens.font(role, weight);
    return {
        family: f.family,
        weight: f.weight,
        italic: o.italic ?? f.italic,
        size,
        fill: tokens.color(fill),
        letterSpacingEm: o.ls ?? 0,
        lineHeight: o.lh ?? 1.2,
    };
}
let Z = 0;
function rect(id, x, y, w, h, fill, opts = {}) {
    return { type: 'rect', id, z: opts.z ?? 1, frame: { x, y, w, h }, fill, ...opts };
}
function spec(runs, width, styleOf, align) {
    return { runs, width, styleOf, align };
}
/** aplica o override de tipografia do container ANTES do layout (reflow real). */
function typed(ctx, containerId, styleOf) {
    const t = ctx.typo?.(containerId);
    if (!t)
        return styleOf;
    return (k) => {
        const s = styleOf(k);
        return { ...s, family: t.family ?? s.family, weight: t.weight ?? s.weight, italic: t.family ? false : s.italic };
    };
}
function pushBlock(nodes, prefix, path, block, x, y, z) {
    let li = 0;
    for (const line of block.lines) {
        let ri = 0;
        for (const r of line.runs) {
            nodes.push({
                type: 'glyphrun',
                id: nid(prefix, `${path}.l${li}r${ri}`),
                container: nid(prefix, path),
                z,
                x: x + r.x,
                baselineY: y + r.baselineY,
                text: r.text,
                style: r.style,
            });
            ri++;
        }
        li++;
    }
    return block.height;
}
function centerGlyph(nodes, id, text, style, cx, baselineY, metrics, z, opacity) {
    const m = metrics.measure(text, style);
    nodes.push({ type: 'glyphrun', id, z, x: cx - m.width / 2, baselineY, text, style, ...(opacity != null ? { opacity } : {}) });
}
function pageNo(nodes, ctx, prefix, page, total) {
    const style = st(ctx.tokens, 'mono', 500, 15, 'muted', { ls: 0.12 });
    const txt = `${String(page).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    const w = ctx.metrics.measure(txt, style).width;
    nodes.push({ type: 'glyphrun', id: nid(prefix, 'pageno'), z: 10, x: W - 60 - w, baselineY: 48 + ctx.metrics.measure('Mg', style).ascent, text: txt, style });
}
// ---- style resolvers ----
function titleStyleOf(tokens, size) {
    return (k) => k === 'em'
        ? st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: 1.08, ls: -0.025 })
        : st(tokens, 'accent', 400, size, 'ink', { italic: true, lh: 1.08, ls: -0.025 });
}
function headlineStyleOf(tokens, size) {
    return (k) => k === 'em'
        ? st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: 1.04, ls: -0.02 })
        : st(tokens, 'accent', 400, size, 'ink', { italic: true, lh: 1.04, ls: -0.02 });
}
function termRowStyleOf(tokens, size = 32) {
    return (k) => {
        switch (k) {
            case 'strong': return st(tokens, 'mono', 600, size, 'termStrong', { lh: 1.55 });
            case 'em': return st(tokens, 'accent', 400, size, 'accent', { italic: true, lh: 1.55 });
            case 'code': return st(tokens, 'mono', 500, size, 'termText', { lh: 1.55 });
            case 'keyword': return st(tokens, 'mono', 500, size, 'accent', { lh: 1.55 });
            default: return st(tokens, 'mono', 400, size, 'termText', { lh: 1.55 });
        }
    };
}
function rowsFrom(slide) {
    if (slide.list)
        return slide.list.map((i) => parseInline(i));
    if (slide.paragraphs)
        return slide.paragraphs.map((p) => parseInline(p));
    if (slide.stats)
        return slide.stats.map(([n, t]) => [{ text: n, key: 'em' }, { text: ` — ${t}`, key: 'ink' }]);
    if (slide.cards)
        return slide.cards.map((c) => [{ text: c.title ?? '', key: 'strong' }, { text: ` — ${c.body ?? ''}`, key: 'ink' }]);
    return [];
}
function capitalize(s) {
    const t = s.trim();
    if (!t)
        return t;
    return t[0].toUpperCase() + t.slice(1);
}
// ---------------- COVER ----------------
function buildCover(content, total, ctx) {
    const { tokens, metrics } = ctx;
    const prefix = slidePrefix('cover', 0);
    const nodes = [];
    const PAD = 96;
    const CW = W - 2 * PAD;
    // asterisco gigante decorativo (bottom-left)
    const astStyle = st(tokens, 'accent', 400, 340, 'accent', { lh: 1 });
    nodes.push({ type: 'glyphrun', id: nid(prefix, 'decoration.asterisk'), z: 0, opacity: 0.18, x: -40, baselineY: H + 40, text: tokens.brand.logoGlyph, style: astStyle });
    pageNo(nodes, ctx, prefix, 1, total);
    const titleRuns = [{ text: `${tokens.brand.logoGlyph} `, key: 'em' }, ...parseInline(content.hookCapa)];
    const tb = fitBlock(spec(titleRuns, CW, typed(ctx, nid(prefix, 'hook'), titleStyleOf(tokens, 108)), 'center'), metrics, 620, 0.6);
    const authorStyle = st(tokens, 'accent', 400, 26, 'ink', { italic: true });
    const ab = layoutBlock(spec([{ text: tokens.brand.handle, key: 'ink' }], CW, () => authorStyle, 'center'), metrics);
    const gap = 80;
    const totalH = tb.height + gap + ab.height;
    let y = (H - totalH) / 2;
    y += pushBlock(nodes, prefix, 'hook', tb, PAD, y, 10) + gap;
    pushBlock(nodes, prefix, 'author', ab, PAD, y, 10);
    return { role: 'cover', sourceIndex: 0, background: tokens.color('cardBg'), nodes };
}
// ---------------- BODY ----------------
function buildBody(slide, sourceIndex, page, total, ctx) {
    const { tokens, metrics } = ctx;
    const prefix = slidePrefix('body', sourceIndex);
    const nodes = [];
    const PAD = 96;
    const CX = 100;
    const CW = W - 2 * 100;
    pageNo(nodes, ctx, prefix, page, total);
    // author-top
    const authorStyle = st(tokens, 'accent', 400, 24, 'ink', { italic: true });
    const ab = layoutBlock(spec([{ text: tokens.brand.handle, key: 'ink' }], CW, () => authorStyle, 'center'), metrics);
    let cursor = PAD + 4;
    cursor += pushBlock(nodes, prefix, 'author', ab, CX, cursor, 10) + 48;
    // headline (serif itálico) + asterisco
    const labelTopo = slide.labelTopo ?? '';
    const after = labelTopo.includes('—') ? labelTopo.split('—')[1]?.trim() ?? '' : '';
    const headlineText = capitalize(slide.tag ?? (after || 'Como funciona'));
    const hlRuns = [{ text: `${headlineText} `, key: 'ink' }, { text: tokens.brand.logoGlyph, key: 'em' }];
    const hb = fitBlock(spec(hlRuns, CW, typed(ctx, nid(prefix, 'headline'), headlineStyleOf(tokens, 88)), 'center'), metrics, 240, 0.6);
    cursor += pushBlock(nodes, prefix, 'headline', hb, CX, cursor, 10) + 24;
    // underline central
    nodes.push(rect(nid(prefix, 'underline'), (W - 120) / 2, cursor, 120, 3, tokens.color('accent'), { z: 5, radius: 2 }));
    cursor += 3 + 56;
    // ---- terminal box ----
    const footerBaseY = H - PAD - 6;
    const footerStyle = st(tokens, 'mono', 500, 14, 'muted', { ls: 0.18 });
    const termTop = cursor;
    const termBottom = footerBaseY - 24 - 24;
    const termX = (W - 880) / 2;
    const termW = 880;
    nodes.push(rect(nid(prefix, 'terminal'), termX, termTop, termW, termBottom - termTop, tokens.color('termBg'), { z: 4, radius: 18 }));
    // term-list (linhas)
    const padIn = 56;
    let ry = termTop + 48;
    const rowStyleOf = termRowStyleOf(tokens, 32);
    const rows = rowsFrom(slide);
    rows.forEach((runs, i) => {
        const b = layoutBlock(spec(runs, termW - 2 * padIn, typed(ctx, nid(prefix, `term.row[${i}]`), rowStyleOf)), metrics);
        ry += pushBlock(nodes, prefix, `term.row[${i}]`, b, termX + padIn, ry, 10);
    });
    // term-footer: borda + plus + model-pill + send-btn
    const ftY = termBottom - 24 - 42;
    nodes.push(rect(nid(prefix, 'term.divider'), termX + padIn, ftY - 24, termW - 2 * padIn, 1, tokens.color('termPillBorder'), { z: 6 }));
    nodes.push(rect(nid(prefix, 'term.plus'), termX + padIn, ftY, 42, 42, tokens.color('termPill'), { z: 7, radius: 21, stroke: tokens.color('termPillBorder'), strokeWidth: 1 }));
    centerGlyph(nodes, nid(prefix, 'term.plus.icon'), '+', st(tokens, 'body', 400, 24, 'termMuted'), termX + padIn + 21, ftY + 28, metrics, 8);
    const pillStyle = st(tokens, 'body', 400, 18, 'termMuted', { ls: 0.02 });
    nodes.push({ type: 'glyphrun', id: nid(prefix, 'term.pill'), z: 8, x: termX + padIn + 42 + 24, baselineY: ftY + 28, text: 'Sonnet 4.6 ⌄', style: pillStyle });
    nodes.push(rect(nid(prefix, 'term.send'), termX + termW - padIn - 42, ftY, 42, 42, tokens.color('accent'), { z: 7, radius: 21 }));
    centerGlyph(nodes, nid(prefix, 'term.send.icon'), '↑', st(tokens, 'body', 600, 22, 'termStrong'), termX + termW - padIn - 21, ftY + 28, metrics, 8);
    // comp-footer
    centerGlyph(nodes, nid(prefix, 'footer'), `${tokens.brand.breadcrumb} · ${tokens.brand.handle}`, footerStyle, W / 2, footerBaseY, metrics, 10);
    return { role: 'body', sourceIndex, background: tokens.color('cardBg'), nodes };
}
// ---------------- CTA ----------------
function buildCta(content, total, ctx) {
    const { tokens, metrics } = ctx;
    const prefix = slidePrefix('cta', 0);
    const nodes = [];
    const PAD = 100;
    const CW = W - 2 * PAD;
    pageNo(nodes, ctx, prefix, total, total);
    // mede tudo p/ centralizar verticalmente
    const authorStyle = st(tokens, 'accent', 400, 24, 'ink', { italic: true });
    const ab = layoutBlock(spec([{ text: tokens.brand.handle, key: 'ink' }], CW, () => authorStyle, 'center'), metrics);
    const headStyle = (k) => st(tokens, 'accent', 400, 64, 'ink', { lh: 1.16, ls: -0.01 });
    const capsRuns = [{ text: (content.ctaText || 'Tá na hora').replace(/<[^>]+>/g, '').toUpperCase(), key: 'ink' }];
    const cb = fitBlock(spec(capsRuns, CW, typed(ctx, nid(prefix, 'caps'), headStyle), 'center'), metrics, 320, 0.6);
    const callRuns = parseInline(content.ctaSub || `Comenta <span class="keyword">${tokens.brand.ctaKeyword}</span> pra receber o link.`);
    const callStyleOf = (k) => k === 'keyword' || k === 'code'
        ? st(tokens, 'mono', 600, 34 * 0.82, 'accent', { lh: 1.32 })
        : st(tokens, 'body', 700, 34, 'ink', { lh: 1.32, ls: -0.01 });
    const callb = layoutBlock(spec(callRuns, CW, typed(ctx, nid(prefix, 'call'), callStyleOf), 'center'), metrics);
    const square = 96;
    const gap1 = 24 + 3 + 56; // underline + margens
    const gap2 = 40;
    const gap3 = 48;
    const totalH = ab.height + 48 + cb.height + gap1 + square + gap2 + callb.height;
    let y = (H - totalH) / 2;
    y += pushBlock(nodes, prefix, 'author', ab, PAD, y, 10) + 48;
    y += pushBlock(nodes, prefix, 'caps', cb, PAD, y, 10) + 24;
    nodes.push(rect(nid(prefix, 'underline'), (W - 160) / 2, y, 160, 3, tokens.color('accent'), { z: 5, radius: 2 }));
    y += 3 + 56;
    nodes.push(rect(nid(prefix, 'square'), (W - square) / 2, y, square, square, tokens.color('accent'), { z: 5, radius: 14 }));
    centerGlyph(nodes, nid(prefix, 'square.mark'), tokens.brand.logoGlyph, st(tokens, 'accent', 400, 56, 'termStrong'), W / 2, y + square / 2 + 20, metrics, 6);
    y += square + gap2;
    pushBlock(nodes, prefix, 'call', callb, PAD, y, 10);
    void gap3;
    return { role: 'cta', sourceIndex: 0, background: tokens.color('cardBg'), nodes };
}
export const compendiumTemplate = {
    family: 'compendium',
    build(content, ctx) {
        Z = 0;
        void Z;
        const total = content.slides.length + 2;
        const slides = [];
        slides.push(buildCover(content, total, ctx));
        content.slides.forEach((s, i) => slides.push(buildBody(s, i, i + 2, total, ctx)));
        slides.push(buildCta(content, total, ctx));
        return slides;
    },
};
