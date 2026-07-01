/**
 * Brand Kit — style guide POR TENANT (RFC §13).
 * Os tokens NÃO são hardcoded no engine: vêm daqui. O kit editorial JP.ASV
 * é apenas o SEED default (extraído de backend/render/template-engine.css.ts).
 */
/** SEED — kit editorial JP.ASV / Claude Code BR. Default p/ novos tenants. */
export const SEED_BRAND_KIT = {
    id: 'seed-editorial',
    tenantId: 'seed',
    version: 1,
    typography: {
        display: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800], style: 'normal', source: 'bundled' },
        body: { family: 'Plus Jakarta Sans', weights: [400, 500, 700], style: 'normal', source: 'bundled' },
        mono: { family: 'JetBrains Mono', weights: [400, 500, 600], style: 'normal', source: 'bundled' },
        accent: { family: 'DM Serif Display', weights: [400], style: 'italic', source: 'bundled' },
    },
    palette: {
        bg: '#F2EBE0',
        bg2: '#E8E0D2',
        bgRose: '#EBDAC8',
        cardBg: '#FAF6ED',
        ink: '#1A1815',
        inkSoft: '#3A3530',
        muted: '#8A8275',
        accent: '#C7634F',
        accentSoft: '#D9785F',
        line: '#C9BFA9',
        termBg: '#1F1D1A',
        termText: '#E5DFD0',
        termMuted: '#9C9586',
        termStrong: '#FFFFFF',
        termPill: '#2D2A26',
        termPillBorder: '#3A3631',
    },
    brand: {
        handle: '@JP.ASV',
        breadcrumb: 'CLAUDE CODE BR',
        ctaKeyword: 'hoje',
        logoGlyph: '✻',
    },
};
