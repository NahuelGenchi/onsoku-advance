// Read-only view of a Nintendo DS ROM: its header and the files of its file system (NitroFS), found by path
// through the file name table and read through the file allocation table.

export class NdsRom {
  /** @param {ArrayBuffer} buffer */
  constructor(buffer) {
    this.buffer = buffer;
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.size = this.bytes.length;
  }

  u8(at) { return this.bytes[at]; }
  u16(at) { return this.view.getUint16(at, true); }
  u32(at) { return this.view.getUint32(at, true); }

  ascii(at, length) {
    let text = '';
    for (let i = 0; i < length; i++) {
      const c = this.bytes[at + i];
      if (c === 0) break;
      text += String.fromCharCode(c);
    }
    return text;
  }

  /** The cartridge header's game title (0x00) and game code (0x0C). */
  header() { return { title: this.ascii(0, 12), code: this.ascii(0x0C, 4) }; }

  /** The bytes of the file at `path` ("dir/name.ext"), or null when the ROM has no such file. */
  file(path) {
    const fnt = this.u32(0x40), fat = this.u32(0x48);
    if (fnt + 8 > this.size || fat > this.size) return null;
    let dir = 0;   // the root directory's entry in the main table
    const parts = path.split('/');
    for (let p = 0; p < parts.length; p++) {
      const last = p === parts.length - 1;
      let at = fnt + this.u32(fnt + dir * 8), id = this.u16(fnt + dir * 8 + 4), found = -1;
      // each entry: a length byte (bit 7 set for a directory), the name, and for a directory its id
      for (let len = this.u8(at); len !== 0 && at < this.size; len = this.u8(at)) {
        const isDir = len & 0x80, n = len & 0x7F, name = this.ascii(at + 1, n);
        at += 1 + n;
        if (isDir) {
          const sub = this.u16(at) & 0xFFF;
          at += 2;
          if (!last && name === parts[p]) { found = sub; break; }
        } else {
          if (last && name === parts[p]) { found = id; break; }
          id++;
        }
      }
      if (found < 0) return null;
      if (last) {
        const start = this.u32(fat + found * 8), end = this.u32(fat + found * 8 + 4);
        if (end < start || end > this.size) return null;
        return this.bytes.subarray(start, end);
      }
      dir = found;
    }
    return null;
  }
}

/** LZ77 type 0x10 data (the DS BIOS's LZ77UnCompReadByCallback format), decompressed. */
export function lz10(src, at = 0) {
  if (src[at] !== 0x10) throw new Error('Unexpected data in the ROM: not LZ77 compressed.');
  const size = src[at + 1] | (src[at + 2] << 8) | (src[at + 3] << 16);
  const out = new Uint8Array(size);
  let i = at + 4, o = 0;
  while (o < size) {
    const flags = src[i++];
    for (let bit = 0x80; bit && o < size; bit >>= 1) {
      if (flags & bit) {
        const x = (src[i] << 8) | src[i + 1];
        i += 2;
        const back = (x & 0xFFF) + 1;
        for (let n = (x >> 12) + 3; n > 0 && o < size; n--, o++) out[o] = out[o - back];
      } else out[o++] = src[i++];
    }
  }
  return out;
}
