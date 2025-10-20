declare module "gifenc" {
  export type WriteFrameOptions = {
    palette: number[][];
    delay?: number;
    repeat?: number;
    transparent?: number;
  };

  export type GIFEncoderInstance = {
    // Correct signature from gifenc: writeFrame(index, width, height, opts)
    writeFrame: (indexData: Uint8Array, width: number, height: number, options: WriteFrameOptions) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
    reset: () => void;
  };

  export function GIFEncoder(): GIFEncoderInstance;
  export function quantize(pixels: Uint8Array, maxColors?: number): number[][];
  export function applyPalette(pixels: Uint8Array, palette: number[][]): Uint8Array;
}
