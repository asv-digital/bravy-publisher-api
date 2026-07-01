function nearestWeight(role, want) {
    if (role.weights.includes(want))
        return want;
    return role.weights.reduce((best, w) => Math.abs(w - want) < Math.abs(best - want) ? w : best, role.weights[0] ?? 400);
}
export function resolveTokens(kit) {
    return {
        color: (token) => kit.palette[token],
        font: (role, weight) => {
            const r = kit.typography[role];
            return {
                family: r.family,
                weight: nearestWeight(r, weight ?? r.weights[0] ?? 400),
                italic: r.style === 'italic',
            };
        },
        brand: kit.brand,
        kit,
    };
}
