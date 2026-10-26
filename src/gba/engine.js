// The engine the Sonic Advance games are built on (SAT-R decompilation, src/core.c, src/task.c, src/sprite.c,
// src/background.c), as the screens before the act use it: the list of tasks run once a frame in order of
// priority, the copies of the display registers they write and the V-blank that puts them in the hardware, the
// queue of graphics copied to VRAM in the V-blank, the background maps copied there, the sprites' OAM entries
// sorted by their order, the H-blank DMA that changes a register from one line to the next, and the keys with
// their auto-repeat. The video hardware is video.js; the ROM is where every copy reads from.
//
// A frame is run(): the keys are read, the tasks run, and the V-blank does its work, which the original does
// in its main loop (EngineMainLoop). The original skips its keys and tasks for a frame when the V-blank's
// copies run past the V-blank; the screens ported here never do, on the recordings they are checked against,
// so that isn't modelled.

import { REG, SCREEN_W, SCREEN_H } from './video.js';

export const FLAGS = {
  UPDATE_BG_PALETTES: 0x1, UPDATE_OBJ_PALETTES: 0x2, HBLANK_COPY: 0x4, KEEP_HBLANK_BUFFER: 0x20,
  PAUSED: 0x800, NO_RESET: 0x8000,
};
export const TASK = { INACTIVE: 0x1, DESTROY_DISABLED: 0x2, RUNS_PAUSED: 0x4 };
// the bits of the GBA's key register
export const KEY = { A: 0x1, B: 0x2, SELECT: 0x4, START: 0x8, RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80, R: 0x100, L: 0x200 };

const MAX_TASKS = 128, GFX_QUEUE = 32, BG_QUEUE = 16, OAM_ENTRIES = 128, OAM_ORDERS = 32;
const COPY_CHUNK = 1024;
// the H-blank DMA's two buffers of 160 lines of up to 4 bytes (gBgOffsetsBuffer)
const HBLANK_BUFFER = 160 * 4;
const s8 = v => (v << 24) >> 24;

/**
 * The engine's state on `video` (createVideo), reading graphics from `rom` (rom.js). `sound` gets the songs the
 * tasks start (m4aSongNumStart).
 */
export function createEngine(video, rom, sound) {
  // In IWRAM the sprites' colours (gObjPalette) come right after the H-blank buffers, and the window effects
  // (lines.js) can write a line past the end of the second, into the first two colours.
  const iwram = new ArrayBuffer(2 * HBLANK_BUFFER + 0x200);
  const e = {
    rom, video,
    playSong: song => sound?.play(song),   // m4aSongNumStart
    stopSong: song => sound?.stop(song),   // m4aSongNumStop
    flags: 0, flagsPreVBlank: 0, frameCount: 0,
    // the RAM copies of the display registers (gDispCnt, gBgCntRegs, gBgScrollRegs as [x, y] per layer,
    // gBgAffineRegs for BG2 and BG3, gWinRegs: WIN0H, WIN1H, WIN0V, WIN1V, WININ, WINOUT, gBldRegs)
    dispCnt: 0x80, bgCnt: new Uint16Array(4), bgScroll: new Uint16Array(8),
    bgAffine: [0, 1].map(() => ({ pa: 0x100, pb: 0, pc: 0, pd: 0x100, x: 0, y: 0 })),
    winRegs: new Uint16Array(6), bldCnt: 0, bldAlpha: 0, bldY: 0,
    bgPalette: new Uint16Array(256), objPalette: new Uint16Array(iwram, 2 * HBLANK_BUFFER, 256),
    oamBuffer: new Uint16Array(OAM_ENTRIES * 4).fill(0x200),
    // the H-blank DMA: the buffers, which half the tasks write (gBgOffsetsHBlankPrimary), and where it copies to
    hblank: new Uint8Array(iwram), primary: 0, hblankTarget: null, hblankSize: 0,
    // the keys (gInput and the rest)
    input: 0, prevInput: 0, pressed: 0, released: 0, repeated: 0,
    repeatCounters: new Uint8Array(10), firstRepeat: new Uint8Array(10).fill(20), nextRepeat: new Uint8Array(10).fill(8),
    keys: 0,   // what the player holds, as KEY bits
    curTask: null,
    // for the widescreen view (video.js): how each layer goes on past the screen's edges, as the screens set it
    // with their layers (null: wrapping, as the hardware does); every sprite piece DisplaySprite puts out, where
    // it really is; a window effect's true shape, for each half of the H-blank buffer and each window; and the
    // H-blank buffer's scroll values before they are cut to the registers' 9 bits (NaN where not known). A screen
    // laid out for the original screen alone, with nothing of its own past its edges, sets wideBars: the view
    // is then black around it.
    wideLayers: [null, null, null, null], wideOam: [], wideWindows: [[null, null], [null, null]], wideBars: false,
    hblankTrue: new Float64Array(iwram.byteLength >> 1).fill(NaN),
  };
  const gfxQueue = new Array(GFX_QUEUE).fill(null), bgQueue = new Array(BG_QUEUE).fill(null);
  let gfxCursor = 0, gfxIndex = 0, bgCursor = 0, bgIndex = 0;
  // gBgSprites_Unknown1 and 2: a rectangle of a layer's map to fill in the next V-blank
  e.mapFill = [0, 1, 2, 3].map(() => ({ value: 0, rect: new Uint8Array(4) }));

  // --- tasks (task.c): a fixed pool of 128, the first two the list's ends --------------------------------------
  const pool = Array.from({ length: MAX_TASKS }, () => ({ main: null, dtor: null, priority: 0, flags: 0, data: null, parent: null, prev: null, next: null }));
  const free = pool.slice();
  let numTasks = 0, nextTask = null;
  const dummy = () => {};
  const head = free[numTasks++], tail = free[numTasks++];
  Object.assign(head, { main: dummy, next: tail });
  Object.assign(tail, { main: dummy, priority: 0xFFFF, prev: head });

  /** TaskCreate: a task running `main(task)` each frame, put after every task of the same or lower priority. */
  e.createTask = (main, data, priority, flags = 0, dtor = null) => {
    if (numTasks >= MAX_TASKS) return null;
    const t = free[numTasks++];
    Object.assign(t, { main, dtor, priority, flags, data, parent: e.curTask });
    for (let slow = head, fast = head.next; fast; slow = fast, fast = fast.next) {
      if (fast.priority > priority) { fast.prev = t; t.next = slow.next; t.prev = slow; slow.next = t; break; }
    }
    return t;
  };
  /** TaskDestroy: a task already destroyed, or one of the list's ends, stays as it is. */
  e.destroyTask = t => {
    if (t.flags & TASK.DESTROY_DISABLED || !t.prev || !t.next) return;
    t.dtor?.(t);
    if (t === nextTask) nextTask = t.next;
    t.prev.next = t.next; t.next.prev = t.prev;
    free[--numTasks] = t;
    Object.assign(t, { parent: null, prev: null, main: dummy, priority: 0, flags: 0, data: null });
  };
  /** TasksDestroyInPriorityRange: the tasks from the first of priority `lo` or more, up to one of `hi` or more. */
  e.destroyTasks = (lo = 0, hi = 0xFFFF) => {
    for (let cur = head; cur; cur = cur.next) {
      if (cur.priority < lo) continue;
      while (cur && cur.priority < hi) {
        const prev = cur;
        cur = prev.next;
        if (prev !== head && prev !== tail) e.destroyTask(prev);
      }
      break;
    }
  };
  function runTasks() {
    const paused = e.flags & FLAGS.PAUSED;
    for (let t = head; t; t = nextTask) {
      nextTask = t.next;
      e.curTask = t;
      if (!(t.flags & TASK.INACTIVE) && (!paused || t.flags & TASK.RUNS_PAUSED)) t.main(t);
    }
    e.curTask = nextTask = null;
  }
  /** The tasks in the list's order, for checking. */
  e.tasks = () => {
    const list = [];
    for (let t = head.next; t !== tail; t = t.next) list.push(t);
    return list;
  };

  // --- copies to VRAM --------------------------------------------------------------------------------------------
  /** ADD_TO_GRAPHICS_QUEUE: `gfx` ({ src, dest, size }, src a ROM offset and dest a VRAM offset) is copied in
   *  the next V-blank, as it is then. */
  e.queueGraphics = gfx => { gfxQueue[gfxIndex] = gfx; gfxIndex = (gfxIndex + 1) % GFX_QUEUE; };
  /** Drops what the queues hold, as screens do when they start. */
  e.clearQueues = () => { gfxCursor = gfxIndex; bgCursor = bgIndex; };
  e.queueBackground = bg => { bgQueue[bgIndex] = bg; bgIndex = (bgIndex + 1) % BG_QUEUE; };

  // DmaCopy16 of `bytes` bytes from the ROM into VRAM
  function copy16(src, dest, bytes) {
    const n = bytes & ~1;
    video.vram.set(rom.bytes.subarray(src, src + n), dest);
  }
  // ProcessVramGraphicsCopyQueue: 1 KB at a time, each entry's size counted down to 0
  function copyGraphics() {
    while (gfxCursor !== gfxIndex) {
      const g = gfxQueue[gfxCursor];
      for (let offset = 0; g.size > 0; offset += COPY_CHUNK) {
        if (g.size > COPY_CHUNK) { copy16(g.src + offset, g.dest + offset, COPY_CHUNK); g.size -= COPY_CHUNK; }
        else { copy16(g.src + offset, g.dest + offset, g.size); g.size = 0; }
      }
      gfxCursor = (gfxCursor + 1) % GFX_QUEUE;
    }
  }
  // sub_8004010: a rectangle of a layer's map filled with one entry, [first column, first row, last column, last
  // row]; a last column of 0xFF fills whole rows up to the last row, not including it (on a text layer, 32 entries
  // a row, or 64 on a layer two blocks tall), a last row of 0xFF does the same on a rotating layer
  function fillMaps() {
    const vram16 = new Uint16Array(video.vram.buffer);
    for (let bg = 0; bg < 4; bg++) {
      const { value, rect } = e.mapFill[bg];
      if (rect[1] === rect[3] && rect[0] === rect[2]) continue;
      const cnt = e.bgCnt[bg], base = (cnt & 0x1F00) << 3;
      if (bg > 1 && (e.dispCnt & 3)) {
        const rowBytes = (0x100000 << (cnt >> 14)) >>> 16, at = base + rect[0];
        const fill = (to, halfwords) => { for (let i = 0; i < halfwords; i++) vram16[((to >> 1) + i) & 0xFFFF] = value | (value << 8); };
        if (rect[3] === 0xFF) fill(at + rowBytes * rect[1], Math.trunc((rect[3] - rect[1]) * rowBytes / 2));
        else for (let r = rect[1]; r <= rect[3]; r++) fill(at + rowBytes * r, ((rect[2] - rect[0] + 1) >> 1) >> 1);
      } else {
        const at = base + rect[0] * 2, tile = (((cnt >> 14) - 2) & 0xFF) <= 1 ? 64 : 32;
        const fill = (to, halfwords) => { for (let i = 0; i < halfwords; i++) vram16[((to >> 1) + i) & 0xFFFF] = value; };
        if (rect[2] === 0xFF) fill(at + tile * 2 * rect[1], (rect[3] - rect[1]) * tile);
        else for (let r = rect[1]; r <= rect[3]; r++) fill(at + tile * 2 * r, rect[2] - rect[0] + 1);
      }
      rect.fill(0);
    }
  }
  // sub_8002B20, for the backgrounds that aren't a stage's map: each row of the map's rectangle at (unk1E, unk20),
  // targetTilesX by targetTilesY, to the layer's map at (unk22, unk24), flipped if the flags say so; on a text
  // layer two blocks wide the part of a row past column 32 goes to the next block
  function copyBackgrounds() {
    const vram = video.vram;
    while (bgCursor !== bgIndex) {
      const bg = bgQueue[bgCursor];
      bgCursor = (bgCursor + 1) % BG_QUEUE;
      if (bg.flags & 0x20) throw new Error('Scrolled background copies are not ported.');
      if (bg.flags & 0x40) throw new Error('Stage map copies are not ported.');
      const id = bg.flags & 3, size = e.bgCnt[id] >> 14;
      const affine = id >= 2 && (e.dispCnt & 3) !== 0;
      const bytes = affine ? 1 : 2, stride = (affine ? 0x10 << size : 32) * bytes;
      const nextBlock = !affine && (size === 1 || size === 3) ? 0x800 : 0;
      const rowSrc = bg.xTiles * bytes, w = bg.targetTilesX;
      let dest = bg.layoutVram + bg.unk24 * stride + bg.unk22 * bytes;
      const entry = at => rom.u16(at), put = (at, v) => { vram[at] = v & 0xFF; vram[at + 1] = v >> 8; };
      if (bg.flags & 0x180) {
        // flipped: entries read from the row's end (0x100), rows from the bottom (0x80)
        const flipRows = bg.flags & 0x80, mirror = bg.flags & 0x100;
        const xor = (mirror ? 0x400 : 0) | (flipRows ? 0x800 : 0);
        let src = bg.layout + ((flipRows ? bg.unk20 + bg.targetTilesY - 1 : bg.unk20) * bg.xTiles) * bytes
          + (mirror ? bg.unk1E + w - 1 : bg.unk1E) * bytes;
        for (let r = 0; r < bg.targetTilesY; r++) {
          for (let k = 0; k < w; k++) put(dest + k * 2, entry(mirror ? src - k * 2 : src + k * 2) ^ xor);
          dest += stride;
          src += flipRows ? -rowSrc : rowSrc;
        }
      } else {
        let src = bg.layout + bg.unk20 * bg.xTiles * bytes + bg.unk1E * bytes;
        const left = 32 - bg.unk22, right = w + bg.unk22 - 32;
        for (let r = 0; r < bg.targetTilesY; r++) {
          if ((size & 1) && bytes === 2 && left > 0 && right > 0) {
            copy16(src, dest, left * 2);
            copy16(src + left * 2, dest + nextBlock, right * 2);
          } else copy16(src, dest, w * bytes);
          dest += stride;
          src += rowSrc;
        }
      }
      bg.prevScrollX = bg.scrollX; bg.prevScrollY = bg.scrollY;
    }
  }

  // --- OAM (sprite.c: OamMalloc, ProcessOamBuffers) ---------------------------------------------------------------
  // each entry's three attributes, and in its fourth half-word the next entry of the same order (0xFF: the last)
  const oamMalloc = new Uint16Array(OAM_ENTRIES * 4).fill(0x200);
  const orderStart = new Uint8Array(OAM_ORDERS).fill(0xFF), orderEnd = new Uint8Array(OAM_ORDERS).fill(0xFF);
  e.oamFreeIndex = 0;
  e.oamMalloc = oamMalloc;
  /** OamMalloc: the index of a new entry of `order` (0 in front, 31 at the back) in oamMalloc, or -1 if OAM is full. */
  e.allocOam = order => {
    if (order > 31) order = 31;
    if (e.oamFreeIndex > OAM_ENTRIES - 1) return -1;
    const i = e.oamFreeIndex;
    oamMalloc[i * 4 + 3] = 0xFF;
    if (orderStart[order] === 0xFF) orderStart[order] = i;
    else oamMalloc[orderEnd[order] * 4 + 3] = i;
    orderEnd[order] = i;
    e.oamFreeIndex++;
    return i;
  };
  function processOam() {
    let dst = 0;
    for (let order = 0; order < OAM_ORDERS; order++) {
      for (let i = s8(orderStart[order]); i !== -1; i = s8(oamMalloc[i * 4 + 3])) {
        e.oamBuffer[dst * 4] = oamMalloc[i * 4]; e.oamBuffer[dst * 4 + 1] = oamMalloc[i * 4 + 1]; e.oamBuffer[dst * 4 + 2] = oamMalloc[i * 4 + 2];
        dst++;
      }
    }
    e.oamFreeIndex = 0;
    orderStart.fill(0xFF); orderEnd.fill(0xFF);
  }

  // --- the H-blank DMA ------------------------------------------------------------------------------------------
  /** Where the tasks write this frame's line-by-line values (gBgOffsetsHBlankPrimary), as a byte offset in e.hblank. */
  e.setHBlankCopy = (target, size) => { e.flags |= FLAGS.HBLANK_COPY; e.hblankTarget = target; e.hblankSize = size; };
  function copyHBlankLine(target, at, size) {
    for (let k = 0; k < size; k += 2) video.write(target + k, e.hblank[at + k] | (e.hblank[at + k + 1] << 8), e.hblankTrue[(at + k) >> 1]);
  }
  const copyHBlankEntry = at => copyHBlankLine(e.hblankTarget, at, e.hblankSize);
  let hdma = null;   // this frame's H-blank DMA: where it starts reading
  let wide = { layers: e.wideLayers, sprites: [], windows: null, bars: false };   // what the widescreen view draws this frame by

  // --- keys (core.c: GetInput) ---------------------------------------------------------------------------------
  function readKeys() {
    e.input = e.keys & 0x3FF;
    e.pressed = (e.input ^ e.prevInput) & e.input;
    e.released = (e.input ^ e.prevInput) & e.prevInput;
    e.prevInput = e.input;
    e.repeated = e.pressed;
    for (let i = 0; i < 10; i++) {
      if (!(e.input & (1 << i))) e.repeatCounters[i] = e.firstRepeat[i];
      else if (e.repeatCounters[i] > 0) e.repeatCounters[i]--;
      else { e.repeated |= 1 << i; e.repeatCounters[i] = e.nextRepeat[i]; }
    }
  }

  // --- the V-blank (VBlankIntr, UpdateScreenDma, ClearOamBufferDma) ---------------------------------------------
  function vblank() {
    hdma = null;
    if (e.flagsPreVBlank & FLAGS.HBLANK_COPY) {
      copyHBlankEntry(e.primary);
      hdma = { at: e.primary + e.hblankSize, target: e.hblankTarget, size: e.hblankSize };
    } else e.hblankTarget = null;
    e.frameCount++;

    video.write(REG.DISPCNT, e.dispCnt);
    for (let i = 0; i < 4; i++) video.write(REG.BG0CNT + i * 2, e.bgCnt[i]);
    if (e.flags & FLAGS.UPDATE_BG_PALETTES) { video.pal.set(e.bgPalette, 0); e.flags ^= FLAGS.UPDATE_BG_PALETTES; }
    if (e.flags & FLAGS.UPDATE_OBJ_PALETTES) { video.pal.set(e.objPalette, 256); e.flags ^= FLAGS.UPDATE_OBJ_PALETTES; }
    for (let i = 0; i < 6; i++) video.write(REG.WIN0H + i * 2, e.winRegs[i]);
    video.write(REG.BLDCNT, e.bldCnt); video.write(REG.BLDALPHA, e.bldAlpha); video.write(REG.BLDY, e.bldY);
    for (let i = 0; i < 8; i++) video.write(REG.BG0HOFS + i * 2, e.bgScroll[i]);
    e.bgAffine.forEach((a, i) => {
      const at = REG.BG2PA + i * 0x10;
      video.write(at, a.pa & 0xFFFF); video.write(at + 2, a.pb & 0xFFFF); video.write(at + 4, a.pc & 0xFFFF); video.write(at + 6, a.pd & 0xFFFF);
      video.write(at + 8, a.x & 0xFFFF); video.write(at + 10, (a.x >> 16) & 0xFFFF);
      video.write(at + 12, a.y & 0xFFFF); video.write(at + 14, (a.y >> 16) & 0xFFFF);
    });
    if (e.flags & FLAGS.HBLANK_COPY) copyHBlankEntry(e.primary);
    processOam();
    video.oam.set(e.oamBuffer);
    const shapes = e.wideWindows[e.primary ? 1 : 0], target = hdma?.target;
    wide = {
      layers: e.wideLayers.slice(),
      sprites: e.wideOam.sort((p, q) => p.order - q.order),   // as processOam orders them
      windows: target === REG.WIN0H ? [shapes[0], hdma.size === 4 ? shapes[1] : null] : target === REG.WIN1H ? [null, shapes[1]] : null,
      bars: e.wideBars,
    };
    e.wideOam = [];
    copyGraphics();
    fillMaps();
    copyBackgrounds();

    if (!(e.flags & FLAGS.KEEP_HBLANK_BUFFER)) e.primary = e.primary ? 0 : HBLANK_BUFFER;
    e.flags &= ~FLAGS.HBLANK_COPY;
    e.oamBuffer.fill(0x200);
  }

  /** One frame: the keys, the tasks and the V-blank. Then draw() shows it. */
  e.run = () => {
    readKeys();
    runTasks();
    e.flagsPreVBlank = e.flags;
    vblank();
  };
  /** Draws the frame into `out` (240 × 160 RGBA words), with the H-blank DMA between its lines; `probe(y)`, if
   *  given, sees the registers as each line is drawn. With `view` ({ w, h }), the widescreen view instead,
   *  w × h words (video.js drawFrame), or the original screen in its middle with black around it (wideBars). */
  e.draw = (out, probe, view) => {
    probe?.(0);
    let at = hdma?.at;
    const bars = view && wide.bars;
    video.drawFrame(bars ? screen : out, (hdma || probe) && (y => {
      if (hdma) {
        copyHBlankLine(hdma.target, at, hdma.size);
        at += hdma.size;
      }
      if (probe && y < 159) probe(y + 1);
    }), view && !bars && wideView(view));
    if (bars) letterbox(out, view);
  };

  // the original screen as drawn, put in the middle of a view of w × h with black around it
  const screen = new Uint32Array(SCREEN_W * SCREEN_H);
  function letterbox(out, { w, h }) {
    const ox = (w - SCREEN_W) >> 1, oy = (h - SCREEN_H) >> 1;
    out.fill(0xFF000000);
    for (let y = 0; y < SCREEN_H; y++) out.set(screen.subarray(y * SCREEN_W, (y + 1) * SCREEN_W), (y + oy) * w + ox);
  }

  // the widescreen view of this frame. A sprite that slides in from past the screen's right edge (its wideFrom
  // is its x on the first frame it shows) slides in from past the view's edge instead: faster across the
  // margin, so it reaches the screen's edge when it would, and on from there as it is.
  function wideView({ w, h }) {
    const ox = (w - SCREEN_W) >> 1, groups = new Map();
    for (const p of wide.sprites) {
      const from = p.sprite.wideFrom, g = groups.get(p.sprite);
      if (from !== undefined && (!g || p.trueX < g.left)) groups.set(p.sprite, { left: p.trueX, first: from + p.trueX - p.x });
    }
    const sprites = wide.sprites.map(({ a, b, c, trueX, trueY, sprite }) => {
      const g = groups.get(sprite);
      if (g && g.left > SCREEN_W && g.first > SCREEN_W) trueX += Math.round((g.left - SCREEN_W) * ox / (g.first - SCREEN_W));
      return { a, b, c, trueX, trueY };
    });
    return { w, h, layers: wide.layers, sprites, windows: wide.windows };
  }
  return e;
}
