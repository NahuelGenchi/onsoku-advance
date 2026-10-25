// The link cable between the GBAs of a multiplayer game played on one page (the original's MultiSio). Each GBA
// keeps a 20-byte packet to send (gMultiSioSend), which its tasks change during its frame and which stays as
// it is between frames. At the start of a frame the library reads in what the others sent and hands its own
// packet over to the transfer, which runs during that frame, so every GBA's tasks read the packets all of
// them had at the end of the frame before last (gMultiSioRecv, its own among them). The link recordings show
// this latency (docs/ROM.md).
//
// A packet is the original's bytes: [0] u16 its kind (0x1000 in a stage), then what that kind carries; in a
// stage (MultiSioData_0_4) s16 x and y at 2 and 4, u16 animation at 6, u16 flags at 8, then four bytes and,
// from 0xE, the room event being sent (mp_event_mgr.c).

export const PACKET_SIZE = 20;
const DELAY = 2;   // frames from a packet's send to its reception

/** A packet's fields, read and written as the original lays them out. */
export function packetView(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, PACKET_SIZE);
  return {
    bytes,
    get kind() { return v.getUint16(0, true); }, set kind(n) { v.setUint16(0, n, true); },
    get x() { return v.getInt16(2, true); }, set x(n) { v.setInt16(2, n, true); },
    get y() { return v.getInt16(4, true); }, set y(n) { v.setInt16(4, n, true); },
    get anim() { return v.getUint16(6, true); }, set anim(n) { v.setUint16(6, n, true); },
    get flags() { return v.getUint16(8, true); }, set flags(n) { v.setUint16(8, n, true); },
    get itemEffect() { return bytes[0xA]; }, set itemEffect(n) { bytes[0xA] = n; },
    get variant() { return bytes[0xB]; }, set variant(n) { bytes[0xB] = n; },
    get animSpeed() { return bytes[0xC]; }, set animSpeed(n) { bytes[0xC] = n; },
    get rotation() { return bytes[0xD]; }, set rotation(n) { bytes[0xD] = n; },
    /** The room event: its type at 0xE and five bytes of what it carries. */
    get event() { return bytes.subarray(0xE, PACKET_SIZE); },
  };
}

/**
 * The link between `count` GBAs. `send(i)` is GBA i's own packet, which its tasks write; `recv(i)` the packet
 * GBA i sent DELAY frames ago, or null while the link has carried nothing yet; `endFrame()` closes a frame of
 * every GBA.
 */
export function createLink(count) {
  const send = Array.from({ length: count }, () => packetView(new Uint8Array(PACKET_SIZE)));
  const sent = [];   // the packets at the end of each of the last DELAY frames, oldest first
  return {
    count,
    send: i => send[i],
    recv: i => (sent.length === DELAY ? sent[0][i] : null),
    endFrame() {
      sent.push(send.map(p => packetView(p.bytes.slice())));
      if (sent.length > DELAY) sent.shift();
    },
  };
}
