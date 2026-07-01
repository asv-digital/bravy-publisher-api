/** prefixo do slide: cover/cta são únicos; body usa índice estável de origem. */
export function slidePrefix(role, index) {
    if (role === 'cover')
        return 'cover';
    if (role === 'cta')
        return 'cta';
    return `slide[${index}]`;
}
export function nid(prefix, path) {
    return `${prefix}/${path}`;
}
