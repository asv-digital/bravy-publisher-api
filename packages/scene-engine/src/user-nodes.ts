/**
 * Materializa elementos adicionados pelo usuário (UserNode) em SceneNodes.
 * Texto passa pelo MESMO layout engine (papel do kit → família com métricas
 * garantidas nos dois runtimes). Ordem no array = ordem de pintura, em duas
 * bandas de z: acima do template (base 1000) ou, com behind=true, atrás de
 * todo o template (base -1000 — acima só do fundo do slide).
 */
import type { UserNode } from './doc.js';
import type { ResolvedTextStyle, SceneNode } from './scene.js';
import type { MetricsProvider } from './text/metrics.js';
import { layoutBlock } from './text/layout.js';
import { parseInline } from './text/runs.js';
import type { StyleResolver } from './text/linebreak.js';
import type { Tokens } from './tokens.js';

const Z_BASE = 1000;

function textStyle(node: Extract<UserNode, { kind: 'text' }>, tokens: Tokens): ResolvedTextStyle {
  const f = tokens.font(node.role ?? 'body', node.weight ?? 400);
  return {
    family: node.family ?? f.family,
    weight: node.family ? (node.weight ?? 400) : f.weight,
    italic: node.italic ?? (node.family ? false : f.italic),
    size: node.size,
    fill: node.fill,
    letterSpacingEm: 0,
    lineHeight: node.lineHeight ?? 1.25,
  };
}

/** texto livre aceita o MESMO markup inline do conteúdo (em/strong/code…). */
function userStyleOf(node: Extract<UserNode, { kind: 'text' }>, tokens: Tokens): StyleResolver {
  const base = textStyle(node, tokens);
  const accent = tokens.font('accent');
  const mono = tokens.font('mono', 500);
  return (k) => {
    switch (k) {
      case 'em':
        return { ...base, family: accent.family, weight: accent.weight, italic: true, fill: tokens.color('accent') };
      case 'strong':
        return { ...base, weight: Math.max(600, base.weight) };
      case 'keyword':
        return { ...base, family: mono.family, weight: mono.weight, italic: false, fill: tokens.color('accent') };
      case 'code':
        return { ...base, family: mono.family, weight: mono.weight, italic: false };
      default:
        return base;
    }
  };
}

export function materializeUserNodes(
  added: UserNode[] | undefined,
  tokens: Tokens,
  metrics: MetricsProvider,
): SceneNode[] {
  if (!added?.length) return [];
  const out: SceneNode[] = [];
  added.forEach((n, i) => {
    const z = (n.behind ? -Z_BASE : Z_BASE) + i;
    // âncora de rotação compartilhada: centro do frame/bbox do elemento
    const rot = n.kind !== 'line' && n.rotation ? n.rotation : undefined;
    const rc =
      rot != null && n.kind !== 'line'
        ? { x: n.frame.x + n.frame.w / 2, y: n.frame.y + n.frame.h / 2 }
        : undefined;
    switch (n.kind) {
      case 'text': {
        const block = layoutBlock(
          { runs: parseInline(n.text), width: Math.max(24, n.frame.w), styleOf: userStyleOf(n, tokens), align: n.align },
          metrics,
        );
        // âncora do texto: centro da caixa real (w × altura medida)
        const trc = rot != null ? { x: n.frame.x + n.frame.w / 2, y: n.frame.y + block.height / 2 } : undefined;
        let li = 0;
        for (const line of block.lines) {
          let ri = 0;
          for (const r of line.runs) {
            out.push({
              type: 'glyphrun',
              id: `${n.id}.l${li}r${ri}`,
              container: n.id,
              z,
              opacity: n.opacity,
              rotation: rot,
              rotationCenter: trc,
              x: n.frame.x + r.x,
              baselineY: n.frame.y + r.baselineY,
              text: r.text,
              style: r.style,
            });
            ri++;
          }
          li++;
        }
        break;
      }
      case 'rect':
        out.push({ type: 'rect', id: n.id, z, opacity: n.opacity, rotation: rot, rotationCenter: rc, frame: n.frame, fill: n.fill, radius: n.radius, stroke: n.stroke, strokeWidth: n.strokeWidth });
        break;
      case 'ellipse':
        out.push({ type: 'ellipse', id: n.id, z, opacity: n.opacity, rotation: rot, rotationCenter: rc, frame: n.frame, fill: n.fill, stroke: n.stroke, strokeWidth: n.strokeWidth });
        break;
      case 'line':
        out.push({ type: 'line', id: n.id, z, opacity: n.opacity, x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2, stroke: n.stroke, strokeWidth: n.strokeWidth });
        break;
      case 'image':
        out.push({ type: 'image', id: n.id, z, opacity: n.opacity, rotation: rot, rotationCenter: rc, frame: n.frame, src: n.src, fit: n.fit ?? 'cover', radius: n.radius });
        break;
    }
  });
  return out;
}

/** Altura real do bloco de texto de um UserTextNode (p/ caixa de seleção). */
export function measureUserText(
  node: Extract<UserNode, { kind: 'text' }>,
  tokens: Tokens,
  metrics: MetricsProvider,
): number {
  return layoutBlock(
    { runs: parseInline(node.text), width: Math.max(24, node.frame.w), styleOf: userStyleOf(node, tokens), align: node.align },
    metrics,
  ).height;
}
