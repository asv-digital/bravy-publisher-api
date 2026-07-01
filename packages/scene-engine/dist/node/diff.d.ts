export interface DiffResult {
    ratio: number;
    diffPixels: number;
    width: number;
    height: number;
    mismatchedSize: boolean;
    diffPng?: Buffer;
}
export declare function diffPng(a: Buffer, b: Buffer, opts?: {
    threshold?: number;
    emitDiff?: boolean;
}): DiffResult;
