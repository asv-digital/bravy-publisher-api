/**
 * Diff pixel-a-pixel entre dois PNGs (shadow-compare do worker / paridade).
 * Node-only (pngjs + pixelmatch). Retorna a fração de pixels divergentes.
 */
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffResult {
  ratio: number;
  diffPixels: number;
  width: number;
  height: number;
  mismatchedSize: boolean;
  diffPng?: Buffer;
}

export function diffPng(a: Buffer, b: Buffer, opts: { threshold?: number; emitDiff?: boolean } = {}): DiffResult {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) {
    return { ratio: 1, diffPixels: pa.width * pa.height, width: pa.width, height: pa.height, mismatchedSize: true };
  }
  const { width, height } = pa;
  const out = opts.emitDiff ? new PNG({ width, height }) : null;
  const diffPixels = pixelmatch(pa.data, pb.data, out ? out.data : null, width, height, { threshold: opts.threshold ?? 0.1 });
  return {
    ratio: diffPixels / (width * height),
    diffPixels,
    width,
    height,
    mismatchedSize: false,
    diffPng: out ? PNG.sync.write(out) : undefined,
  };
}
