/**
 * Scene Graph — estrutura derivada (não persistida) que o painter consome.
 * Geometria em design px absolutos (1080×1080), origem top-left, Y pra baixo.
 * Ver RFC §2.1 / §2.2.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Estilo de texto já resolvido (família/peso/cor concretos). */
export interface ResolvedTextStyle {
  family: string;
  weight: number;
  italic: boolean;
  size: number; // px
  fill: string; // hex
  letterSpacingEm: number; // relativo ao size (CSS usa em)
  lineHeight: number; // multiplicador
  /** sublinhado (decoração de pintura; não afeta métricas/quebra). */
  underline?: boolean;
  /** destaque atrás do texto (hex). */
  bg?: string;
}

export type NodeId = string;

export interface BaseNode {
  id: NodeId;
  z: number;
  opacity?: number;
  locked?: boolean;
  /** id do container semântico ao qual pertence (p/ seleção/override). */
  container?: NodeId;
  /** rotação em graus, aplicada no paint em torno de rotationCenter. */
  rotation?: number;
  /** âncora da rotação em design px (centro do bloco; compartilhada pelo grupo). */
  rotationCenter?: { x: number; y: number };
}

export interface RectNode extends BaseNode {
  type: 'rect';
  frame: Rect;
  fill?: string;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  frame: Rect; // bounding box; raio = w/2, h/2
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineNode extends BaseNode {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

/** Uma linha visual de UM estilo contíguo. Posicionada pela baseline. */
export interface GlyphRunNode extends BaseNode {
  type: 'glyphrun';
  x: number;
  baselineY: number;
  text: string;
  style: ResolvedTextStyle;
}

export type ImageFit = 'cover' | 'contain';

export interface ImageNode extends BaseNode {
  type: 'image';
  frame: Rect;
  src: string; // url / data / path
  fit: ImageFit;
  radius?: number;
  focal?: { x: number; y: number }; // 0..1
}

export type SceneNode = RectNode | EllipseNode | LineNode | GlyphRunNode | ImageNode;

export interface SceneSlide {
  index: number;
  width: number;
  height: number;
  background: string;
  nodes: SceneNode[];
}

export interface SceneGraph {
  slides: SceneSlide[];
}
