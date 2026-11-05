import { createRequire } from 'node:module';

const decode = createRequire(import.meta.url)('./vendor/jsQR.js');

export function decodeQrMatrix(modules, scale = 8) {
  if (!Array.isArray(modules) || !modules.length || modules.some(row => !Array.isArray(row) || row.length !== modules.length || row.some(cell => typeof cell !== 'boolean'))) {
    throw new TypeError('Expected a square boolean QR matrix.');
  }
  if (!Number.isSafeInteger(scale) || scale < 2 || scale > 16) throw new RangeError('QR test raster scale is out of range.');
  const quietZone = 4;
  const dimension = (modules.length + quietZone * 2) * scale;
  const pixels = new Uint8ClampedArray(dimension * dimension * 4);
  pixels.fill(255);
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (!modules[y][x]) continue;
      const left = (x + quietZone) * scale;
      const top = (y + quietZone) * scale;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const index = ((top + py) * dimension + left + px) * 4;
          pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
          pixels[index + 3] = 255;
        }
      }
    }
  }
  return decode(pixels, dimension, dimension, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}
