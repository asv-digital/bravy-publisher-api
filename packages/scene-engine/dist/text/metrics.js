const keyOf = (family, italic) => `${family}__${italic ? 'i' : 'n'}`;
export class FontkitMetrics {
    fonts = new Map();
    variationCache = new Map();
    constructor(initial) {
        if (initial) {
            for (const [k, v] of initial)
                this.fonts.set(k, Array.isArray(v) ? v : [v]);
        }
    }
    static fontKey = keyOf;
    /** registro incremental (fontes dinâmicas carregadas depois do boot). */
    register(family, italic, entry) {
        const k = keyOf(family, italic);
        const list = this.fonts.get(k) ?? [];
        list.push(entry);
        this.fonts.set(k, list);
    }
    has(family, italic) {
        return this.fonts.has(keyOf(family, italic)) || this.fonts.has(keyOf(family, false));
    }
    instance(style) {
        const list = this.fonts.get(keyOf(style.family, style.italic)) ?? this.fonts.get(keyOf(style.family, false));
        if (!list?.length) {
            throw new Error(`Fonte não registrada: ${style.family} (${style.italic ? 'italic' : 'normal'})`);
        }
        // estáticas por peso: escolhe a entrada de peso mais próximo
        let lf = list[0];
        if (list.length > 1) {
            lf = list.reduce((best, cur) => Math.abs((cur.weight ?? 400) - style.weight) < Math.abs((best.weight ?? 400) - style.weight) ? cur : best);
        }
        if (!lf.variable || typeof lf.font.getVariation !== 'function')
            return lf.font;
        const ck = `${keyOf(style.family, style.italic)}@${style.weight}`;
        let inst = this.variationCache.get(ck);
        if (!inst) {
            inst = lf.font.getVariation({ wght: style.weight });
            this.variationCache.set(ck, inst);
        }
        return inst;
    }
    measure(text, style) {
        const font = this.instance(style);
        const upm = font.unitsPerEm || 1000;
        const scale = style.size / upm;
        const ls = style.letterSpacingEm * style.size;
        const chars = Array.from(text);
        const advances = [];
        let width = 0;
        for (let i = 0; i < chars.length; i++) {
            const cp = chars[i].codePointAt(0);
            let adv = 0;
            try {
                adv = font.glyphForCodePoint(cp).advanceWidth * scale;
            }
            catch {
                adv = font.glyphForCodePoint(0x20).advanceWidth * scale;
            }
            const withLs = adv + (i < chars.length - 1 ? ls : 0);
            advances.push(withLs);
            width += withLs;
        }
        return {
            width,
            ascent: (font.ascent / upm) * style.size,
            descent: (Math.abs(font.descent) / upm) * style.size,
            advances,
        };
    }
}
