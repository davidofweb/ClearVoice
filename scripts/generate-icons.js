import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPNG(width, height, drawFn) {
  // RGBA buffer
  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    typeBuf.copy(buf, 4);
    data.copy(buf, 8);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    buf.writeInt32BE(crc, 8 + len);
    return buf;
  }

  // CRC32 table
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ 0xffffffff;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon drawer: dark slate background, concentric studio rings, glowing red recording center with waveform bars
function drawIcon(x, y, w, h, isMaskable = false) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxR = w / 2;

  // Background rounded corners if not maskable
  if (!isMaskable) {
    const cornerRadius = w * 0.22;
    const inCornerX = x < cornerRadius ? cornerRadius - x : x > w - cornerRadius ? x - (w - cornerRadius) : 0;
    const inCornerY = y < cornerRadius ? cornerRadius - y : y > h - cornerRadius ? y - (h - cornerRadius) : 0;
    if (inCornerX > 0 && inCornerY > 0) {
      if (Math.sqrt(inCornerX * inCornerX + inCornerY * inCornerY) > cornerRadius) {
        return [0, 0, 0, 0]; // transparent outside rounded corner
      }
    }
  }

  // Base background gradient: dark studio #121218 down to #08080a
  const bgGrad = y / h;
  let r = Math.round(18 - bgGrad * 10);
  let g = Math.round(18 - bgGrad * 10);
  let b = Math.round(24 - bgGrad * 14);

  // Outer isolation ring
  const ring1 = w * 0.38;
  if (Math.abs(dist - ring1) < w * 0.008) {
    return [45, 45, 58, 255];
  }

  // Mid isolation ring
  const ring2 = w * 0.29;
  if (Math.abs(dist - ring2) < w * 0.008) {
    return [60, 60, 80, 255];
  }

  // Inner red glow ring
  const ring3 = w * 0.21;
  if (Math.abs(dist - ring3) < w * 0.01) {
    return [239, 68, 68, 180];
  }

  // Glowing center recording capsule
  const centerR = w * 0.16;
  if (dist <= centerR) {
    // Red core gradient
    const centerGrad = dist / centerR;
    const cr = Math.round(248 - centerGrad * 40);
    const cg = Math.round(113 - centerGrad * 60);
    const cb = Math.round(113 - centerGrad * 60);

    // Dark inset circle
    if (dist <= centerR * 0.85) {
      // Inset dark
      r = 18;
      g = 18;
      b = 24;

      // 5 waveform bars inside inset
      const barWidth = w * 0.02;
      const barSpacing = w * 0.038;
      const barHeights = [0.08, 0.16, 0.22, 0.18, 0.11]; // normalized heights
      for (let i = 0; i < 5; i++) {
        const barX = cx + (i - 2) * barSpacing;
        const bH = w * barHeights[i];
        if (Math.abs(x - barX) <= barWidth / 2 && Math.abs(y - cy) <= bH / 2) {
          if (i === 2) return [255, 255, 255, 255]; // central white bar
          return [239, 68, 68, 255]; // red bars
        }
      }
      return [r, g, b, 255];
    }
    return [cr, cg, cb, 255];
  }

  return [r, g, b, 255];
}

const outDir = path.resolve('public');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), createPNG(192, 192, (x, y, w, h) => drawIcon(x, y, w, h, false)));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), createPNG(512, 512, (x, y, w, h) => drawIcon(x, y, w, h, false)));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), createPNG(512, 512, (x, y, w, h) => drawIcon(x, y, w, h, true)));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), createPNG(180, 180, (x, y, w, h) => drawIcon(x, y, w, h, false)));

console.log('Successfully generated PWA PNG icons in /public!');
