const registry = new Map();
export function registerTemplate(p) {
    registry.set(p.family, p);
}
export function getTemplate(family) {
    const p = registry.get(family);
    if (p)
        return p;
    // fallback p/ step (compendium chega no Sprint 3)
    const step = registry.get('step');
    if (!step)
        throw new Error(`Nenhum template registrado para "${family}"`);
    return step;
}
