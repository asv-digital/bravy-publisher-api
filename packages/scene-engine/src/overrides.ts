/**
 * Overrides (RFC §2.5–§2.7): aplica deltas esparsos do usuário sobre os nós
 * default do template e reconcilia o OverrideMap após regeneração.
 * Tudo validado: fill ∈ paleta, fontScale ∈ [0.5,2], frame clampeado ao slide.
 */
import type { NodeOverride, OverrideMap } from './doc.js';
import type { BrandPalette } from './brand-kit.js';
import type { Rect, SceneNode } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';

const SLIDE = 1080;
const MIN_SIZE = 24;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Sanitiza um override contra limites. Campos inválidos são descartados. */
export function validateOverride(ov: NodeOverride, _palette: BrandPalette): NodeOverride {
  const out: NodeOverride = {};
  if (ov.hidden != null) out.hidden = ov.hidden;
  if (ov.rotation != null && Number.isFinite(ov.rotation)) out.rotation = ov.rotation;
  if (ov.fontScale != null && Number.isFinite(ov.fontScale)) out.fontScale = clamp(ov.fontScale, 0.25, 4);
  if (ov.opacity != null && Number.isFinite(ov.opacity)) out.opacity = clamp(ov.opacity, 0.05, 1);
  // cor livre (mini-Figma): qualquer hex válido — paleta vira sugestão, não trava
  if (ov.fill != null && /^#[0-9a-fA-F]{3,8}$/.test(ov.fill)) out.fill = ov.fill;
  if (ov.family) out.family = ov.family;
  if (ov.weight != null && Number.isFinite(ov.weight)) out.weight = ov.weight;
  if (ov.frame) out.frame = ov.frame; // clamp depende do frame base → no apply
  return out;
}

function clampFrame(base: Rect, delta: Partial<Rect>): Rect {
  const w = clamp(delta.w ?? base.w, MIN_SIZE, SLIDE);
  const h = clamp(delta.h ?? base.h, MIN_SIZE, SLIDE);
  const x = clamp(delta.x ?? base.x, 0, SLIDE - w);
  const y = clamp(delta.y ?? base.y, 0, SLIDE - h);
  return { x, y, w, h };
}

/** Origem (minX, minBaselineY) de cada container de texto — âncora do fontScale. */
function textOrigins(nodes: SceneNode[]): Map<string, { x: number; b: number }> {
  const o = new Map<string, { x: number; b: number }>();
  for (const n of nodes) {
    if (n.type !== 'glyphrun' || !n.container) continue;
    const cur = o.get(n.container);
    if (!cur) o.set(n.container, { x: n.x, b: n.baselineY });
    else o.set(n.container, { x: Math.min(cur.x, n.x), b: Math.min(cur.b, n.baselineY) });
  }
  return o;
}

/** bbox por âncora de override (id ou container) — p/ âncora de rotação. */
function anchorBounds(nodes: SceneNode[], metrics?: MetricsProvider): Map<string, { x0: number; y0: number; x1: number; y1: number }> {
  const out = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  const grow = (key: string, x0: number, y0: number, x1: number, y1: number) => {
    const c = out.get(key);
    if (!c) out.set(key, { x0, y0, x1, y1 });
    else out.set(key, { x0: Math.min(c.x0, x0), y0: Math.min(c.y0, y0), x1: Math.max(c.x1, x1), y1: Math.max(c.y1, y1) });
  };
  for (const n of nodes) {
    const key = n.container ?? n.id;
    if (n.type === 'glyphrun') {
      const m = metrics?.measure(n.text, n.style);
      const w = m?.width ?? 0;
      const asc = m?.ascent ?? n.style.size;
      const desc = m?.descent ?? 0;
      grow(key, n.x, n.baselineY - asc, n.x + w, n.baselineY + desc);
    } else if (n.type === 'line') {
      grow(key, Math.min(n.x1, n.x2), Math.min(n.y1, n.y2), Math.max(n.x1, n.x2), Math.max(n.y1, n.y2));
    } else {
      grow(key, n.frame.x, n.frame.y, n.frame.x + n.frame.w, n.frame.y + n.frame.h);
    }
  }
  return out;
}

/**
 * Aplica os overrides do slide sobre os nós. Override ancora no container
 * semântico (RFC §2.4): glyphruns herdam via `node.container`.
 * Suporta: fill, hidden, translação (frame.x/y), fontScale em texto (escala
 * uniforme sobre a origem, §5.1) e rotation (âncora = centro da bbox do bloco).
 */
export function applyOverrides(
  nodes: SceneNode[],
  ov: OverrideMap | undefined,
  palette: BrandPalette,
  metrics?: MetricsProvider,
): SceneNode[] {
  if (!ov || Object.keys(ov).length === 0) return nodes;
  const origins = textOrigins(nodes);
  const needsBounds = Object.values(ov).some((o) => o.rotation);
  const bounds = needsBounds ? anchorBounds(nodes, metrics) : null;
  // hidden e translação cascateiam pra ids descendentes no path semântico
  // (bullet[0] → bullet[0].dot, callout → callout.text, card[1] → card[1].title…)
  const hiddenAnchors = Object.keys(ov).filter((k) => ov[k]!.hidden === true);
  const isDescendantHidden = (n: SceneNode): boolean =>
    hiddenAnchors.some(
      (a) => n.id.startsWith(`${a}.`) || (n.container != null && n.container !== a && n.container.startsWith(`${a}.`)),
    );
  // delta de translação por âncora: container de texto guarda frame como DELTA;
  // rect/image guarda frame ABSOLUTO → delta = clamp(novo) − base
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const textContainers = new Set(nodes.filter((n) => n.type === 'glyphrun' && n.container).map((n) => n.container!));
  const moveAnchors = new Map<string, { dx: number; dy: number }>();
  for (const [k, rawOv] of Object.entries(ov)) {
    const o = validateOverride(rawOv, palette);
    if (!o.frame) continue;
    if (textContainers.has(k)) {
      const dx = o.frame.x ?? 0;
      const dy = o.frame.y ?? 0;
      if (dx || dy) moveAnchors.set(k, { dx, dy });
    } else {
      const base = byId.get(k);
      if (base && (base.type === 'rect' || base.type === 'image')) {
        const nf = clampFrame(base.frame, o.frame);
        const dx = nf.x - base.frame.x;
        const dy = nf.y - base.frame.y;
        if (dx || dy) moveAnchors.set(k, { dx, dy });
      }
    }
  }
  const cascadeMoveOf = (n: SceneNode): { dx: number; dy: number } | undefined => {
    let best: string | undefined;
    for (const a of moveAnchors.keys()) {
      const hit = n.id.startsWith(`${a}.`) || (n.container != null && n.container !== a && n.container.startsWith(`${a}.`));
      if (hit && (!best || a.length > best.length)) best = a;
    }
    return best ? moveAnchors.get(best) : undefined;
  };

  return nodes.map((n) => {
    const anchor = n.container ?? n.id;
    const raw = ov[n.id] ?? (n.container ? ov[n.container] : undefined);
    const cascadeHidden = isDescendantHidden(n);
    // só cascateia movimento em quem NÃO tem override direto (sem dupla translação)
    const cascadeMove = raw ? undefined : cascadeMoveOf(n);
    if (!raw && !cascadeHidden && !cascadeMove) return n;
    const o = raw ? validateOverride(raw, palette) : {};
    const m = { ...n } as SceneNode;
    if (cascadeMove) {
      if (m.type === 'glyphrun') {
        m.x += cascadeMove.dx;
        m.baselineY += cascadeMove.dy;
      } else if (m.type === 'line') {
        m.x1 += cascadeMove.dx;
        m.y1 += cascadeMove.dy;
        m.x2 += cascadeMove.dx;
        m.y2 += cascadeMove.dy;
      } else {
        m.frame = { ...m.frame, x: m.frame.x + cascadeMove.dx, y: m.frame.y + cascadeMove.dy };
      }
    }
    if (o.hidden || cascadeHidden) m.opacity = 0;
    else if (o.opacity != null) m.opacity = o.opacity * (n.opacity ?? 1);
    if (o.fill) {
      if (m.type === 'glyphrun') m.style = { ...m.style, fill: o.fill };
      else if (m.type === 'rect') m.fill = o.fill;
    }
    if (m.type === 'glyphrun') {
      // fontScale: escala size + posição relativa à origem do container
      if (o.fontScale && o.fontScale !== 1) {
        const org = (m.container && origins.get(m.container)) || { x: m.x, b: m.baselineY };
        m.style = { ...m.style, size: m.style.size * o.fontScale };
        m.x = org.x + (m.x - org.x) * o.fontScale;
        m.baselineY = org.b + (m.baselineY - org.b) * o.fontScale;
      }
      if (o.frame?.x != null) m.x += o.frame.x;
      if (o.frame?.y != null) m.baselineY += o.frame.y;
    } else if ((m.type === 'rect' || m.type === 'image') && o.frame) {
      m.frame = clampFrame(m.frame, o.frame);
    }
    if (o.rotation && bounds) {
      const b = bounds.get(anchor);
      if (b) {
        m.rotation = o.rotation;
        // âncora acompanha a translação aplicada acima
        const dx = o.frame?.x ?? 0;
        const dy = o.frame?.y ?? 0;
        m.rotationCenter = { x: (b.x0 + b.x1) / 2 + dx, y: (b.y0 + b.y1) / 2 + dy };
      }
    }
    return m;
  });
}

export interface ReconcileResult {
  kept: OverrideMap;
  dropped: string[];
}

/**
 * Reconciliação pós-regeneração (RFC §2.7): mantém overrides cujo container
 * ainda existe na cena nova; descarta (e loga) os de containers que sumiram.
 */
export function reconcileOverrides(prev: OverrideMap | undefined, currentIds: Iterable<string>): ReconcileResult {
  const valid = currentIds instanceof Set ? currentIds : new Set(currentIds);
  const kept: OverrideMap = {};
  const dropped: string[] = [];
  for (const [id, ov] of Object.entries(prev ?? {})) {
    if (valid.has(id)) kept[id] = ov;
    else dropped.push(id);
  }
  return { kept, dropped };
}

/** Conjunto de ids ancoráveis (containers + nós sem container) de uma lista de nós. */
export function anchorableIds(nodes: SceneNode[]): Set<string> {
  const ids = new Set<string>();
  for (const n of nodes) {
    ids.add(n.container ?? n.id);
  }
  return ids;
}
