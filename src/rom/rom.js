// Read-only view of a Game Boy Advance ROM with little-endian helpers.

export const ROM_BASE = 0x08000000;   // where the cartridge is mapped in the GBA address space

export class Rom {
  /** @param {ArrayBuffer} buffer */
  constructor(buffer) {
    this.buffer = buffer;
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.size = this.bytes.length;
  }

  u8(at) { return this.bytes[at]; }
  u16(at) { return this.view.getUint16(at, true); }
  s16(at) { return this.view.getInt16(at, true); }
  u32(at) { return this.view.getUint32(at, true); }
  s32(at) { return this.view.getInt32(at, true); }

  /** True when `value` is an address inside this ROM. */
  isPointer(value) { return value >= ROM_BASE && value < ROM_BASE + this.size; }

  /** Follows the pointer stored at `at` and returns a file offset, or null when it does not point into the ROM. */
  ptr(at) {
    const value = this.u32(at);
    return this.isPointer(value) ? value - ROM_BASE : null;
  }

  /** Like ptr(), but throws with a readable message when the data is not where the format says it is. */
  requirePtr(at, what) {
    const offset = this.ptr(at);
    if (offset === null) throw new Error(`unexpected data in the rom: ${what} at 0x${at.toString(16)} is not a pointer.`);
    return offset;
  }

  ascii(at, length) {
    let text = '';
    for (let i = 0; i < length; i++) {
      const c = this.bytes[at + i];
      if (c === 0) break;
      text += String.fromCharCode(c);
    }
    return text;
  }
}
