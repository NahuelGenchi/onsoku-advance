// Chao Hunt, the multiplayer mode of the first multiplayer stage, for one GBA of the link (SAT-R
// decompilation: the multiplayer parts of src/game/shared/stage/stage.c (the stage's init and Task_GameStage),
// player.c (sub_8024B10's packet and Task_PlayerHandleDeath), src/game/sa1/stage/stage_ui_z.c (the title
// card's end) and src/game/shared/stage/mp_event_mgr.c and mp_event_recv_mgr.c (the room events)). Three
// minutes on a clock running down; one Chao sits somewhere in the stage, goes to the first player to touch
// it, and passes to whoever knocks its holder with an attack. When the time is up the one with the Chao wins
// and the others lose; nobody holding it is a draw. The stage's mystery item boxes (mysterybox.js) give
// confusion and darkness to the others, or invisibility.
//
// Every GBA runs the whole stage for itself and sees the others only through the link (link.js): each frame
// it sends where its Sonic is and how he looks, and its tasks for the players (mpplayer.js) show what the
// others sent. Things that happen to one player and matter to the others go as room events, one at a time
// in the packets, each held until every other GBA has acknowledged it. The stage's own data (its start
// places, the Chao's places, its music) comes with the stage (`stage`), so the other multiplayer stages can
// use this mode as they are added.

import { createMultiplayerPlayer, animationIds, FLAG } from './mpplayer.js';
import { createChao } from './chao.js';
import { hudTask, indicatorTask, confusionTask, darknessTask, finishTask } from './mphud.js';
import { SONG } from '../sound/songs.js';

export const ROUND_TIME = 3 * 3600;    // TIME(3, 0)
const KIND_STAGE = 0x1000;              // a packet's kind in a stage
const EVENT_SIZE = 6;                   // the bytes of a room event a packet carries
const QUEUE = 16;                       // gRoomEventQueue's slots, of 8 bytes
const CONFUSION_TIME = 600, CARD_INVULNERABLE = 120;
const ITEM_TURN = 0x1FF, ITEM_GENERATION = 0xFFF;
const PLAYERS_PRIORITY = 0x2000, INDICATOR_PRIORITY = 0x2001, CONFUSION_PRIORITY = 0x4001;
const RECEIVE_PRIORITY = 1, SEND_PRIORITY = 0xFFFE;
// the items' bits in itemEffect, as the packets carry them
const SHIELD = 1, INVINCIBLE = 2, SPEED_UP = 4, MAGNETIC = 8, INVISIBLE = 0x20, CONFUSED = 0x40, TELEPORT = 0x80;
const ROOM_EVENT = { PLATFORM: 1, MYSTERY_BOX: 5, ITEM: 6, CHAO: 9 };

/**
 * The mode for GBA `id` of the `count` on `link`. `seed` is the shared random number the link hands every
 * GBA as the stage starts (gMultiplayerPseudoRandom), and `chaoPlace` the Chao's place among the stage's
 * (what gChaoTasks holds before the stage makes the Chao). `onResults` is called as the round ends.
 */
export function createChaoHunt({ link, id, count, stage, anims, seed, chaoPlace, onResults }) {
  const mp = {
    id, count, players: [], chao: [],
    charRings: [0, 0, 0, 0],    // gMultiplayerCharRings: the Chao each player holds
    ranks: [-1, -1, -1, -1],    // gMultiplayerRanks: each player's result, -1 while the round runs
    courseTime: ROUND_TIME,
    actStart: true,             // STAGE_FLAG__ACT_START: the title card, and the round's end
    itemTurn: 0,                // gRandomItemBox: which mystery item box shows, and how many times round
    random: seed >>> 0,         // gMultiplayerPseudoRandom
    invisibleTimer: 0,
    recv: i => (i < count ? link.recv(i) : null),
    sendEvent,
    queueEmpty: () => write === sent,
    confusionBubble: i => game.tasks.add(confusionTask(mp, i, anims), CONFUSION_PRIORITY),
    linkError() { mp.linkLost = true; },
    objectWindow() { game.state.effects2d = { ...game.state.effects2d, objWindow: true, objWindowLayers: 0x08 }; },
    linkLost: false,
  };
  const send = link.send(id);
  let game = null, player = null;
  // the room event queue: 16 slots of 8 bytes, never cleared, so a short event leaves the bytes of the one
  // before it in the slot
  const queue = Array.from({ length: QUEUE }, () => new Uint8Array(8));
  let write = 0, sent = 0;

  function sendEvent(e) {
    const slot = queue[write];
    slot[0] = e.type;
    if (e.type === ROOM_EVENT.PLATFORM) { slot[1] = e.x; slot[2] = e.y; slot[3] = e.id; slot[4] = e.action; }
    else if (e.type === ROOM_EVENT.MYSTERY_BOX) { slot[1] = e.x; slot[2] = e.y; slot[3] = e.id; slot[4] = e.count; }
    else if (e.type === ROOM_EVENT.ITEM) slot[1] = e.effect;
    else if (e.type === ROOM_EVENT.CHAO) { slot[1] = e.id1; slot[2] = e.id2; }
    write = (write + 1) & (QUEUE - 1);
  }

  // what another player's room event does on this GBA
  function receiveEvent(ev, from) {
    const own = mp.players[id];
    switch (ev[0]) {
      case ROOM_EVENT.PLATFORM:
        game.entities.change(ev[1], ev[2], ev[3], ev[4]);
        break;
      case ROOM_EVENT.MYSTERY_BOX: {
        const e = game.entities.interactable(ev[1], ev[2], ev[3]);
        if (e) e.d[1] = ev[4];
        break;
      }
      case ROOM_EVENT.ITEM:
        if ((own.state & 1) || player.dead || mp.ranks[id] !== -1) break;
        if (ev[1] === 0) {
          player.itemEffect |= CONFUSED;
          player.confusion = CONFUSION_TIME;
          // the bubble goes to the player numbered as this GBA's character, not to this player
          mp.confusionBubble(0);
        } else if (ev[1] === 1) {
          let rings = 0;
          for (let i = 0; i < 4 && mp.players[i]; i++) rings += mp.charRings[i];
          if ((mp.players[from].state & 0x70000) || (own.state & 0x70000) || rings === 0) {
            game.tasks.add(darknessTask(mp, game), 0x2000);
            game.state.effects2d = { ...game.state.effects2d, objWindowLayers: 0 };
          }
        }
        break;
      case ROOM_EVENT.CHAO: {
        const chao = mp.chao[ev[1]];
        if (chao) chao.playerA = ev[2];
        mp.players[from].state &= ~(0x10000 << ev[1]);
        mp.players[ev[2]].state |= 0x10000 << ev[1];
        game.world.playSound(SONG.CHAO_HUH);
        break;
      }
    }
  }

  // Task_MultiplayerEventMgr_Receive: a new event from each other player, then its acknowledgement
  const receiveTask = {
    run() {
      for (let i = 0; i < count; i++) {
        if (i === id) continue;
        const r = mp.recv(i);
        if (!r) continue;
        const bit = 0x1000 << i;
        if (r.kind === KIND_STAGE && (r.flags & bit) !== (send.flags & bit)) {
          if (r.bytes[0xE] > 0 && r.bytes[0xE] < 10) receiveEvent(r.event, i);
          send.flags ^= bit;
        }
      }
      return true;
    },
  };
  // Task_MultiplayerEventMgr_Send: once every GBA has seen the last event, the next one in the queue, or none
  const sendTask = {
    run() {
      const bit = 0x1000 << id, mine = send.flags & bit;
      for (let i = 0; i < count; i++) {
        const r = mp.recv(i);
        if (!r) return true;
        if (r.kind === KIND_STAGE && (mine === 0) !== !(r.flags & bit)) return true;
      }
      if (write === sent) send.bytes.fill(0, 0xE, 0xE + EVENT_SIZE);
      else {
        send.bytes.set(queue[sent].subarray(0, EVENT_SIZE), 0xE);
        sent = (sent + 1) & (QUEUE - 1);
        send.flags ^= bit;
      }
      return true;
    },
  };

  // sub_8024B10's packet: where this GBA's Sonic is and how he looks, with the items he has
  function writePacket() {
    const p = player, own = mp.players[id], name = p.anim.name, [anim, variant] = animationIds(name) ?? [0, 0];
    const t = p.sent ?? p;
    send.kind = KIND_STAGE;
    send.x = Math.floor(p.x);
    send.y = Math.floor(p.y);
    send.anim = anim | ((own.state & 0x70000) >> 4);
    let items = p.itemEffect & (INVISIBLE | CONFUSED | TELEPORT | 0x10);
    if (p.shield === 'normal') items |= SHIELD;
    if (p.shield === 'magnetic') items |= MAGNETIC;
    if (t.invincible > 0) items |= INVINCIBLE;
    if (t.speedUp > 0) items |= SPEED_UP;
    send.itemEffect = items;
    send.variant = (variant | (p.offsetY << 3)) & 0xFF;
    send.animSpeed = p.anim.speed & 0xFF;
    // walking and thrown up by a bounce block he goes through the rotation hardware
    const rotated = p.state === 'walk' || p.state === 'bounce';
    send.rotation = rotated ? p.rotation & 0xFF : 0;
    let f = send.flags & 0xF000;
    if (rotated) f |= FLAG.ROTATED;
    if (p.facing > 0) f |= FLAG.FACING_RIGHT;
    if (p.dead || (own.state & 1) || t.invulnerable !== 0) f |= FLAG.UNTOUCHABLE;
    if (own.state & 1) f |= FLAG.CARRIED;
    f |= (p.death || p.front ? 1 : 2) << 4;
    if (p.layer !== 0) f |= FLAG.LAYER;
    if (p.newAnim) f |= FLAG.NEW_ANIM;
    own.standsOn = id;
    if (p.onObject) for (let i = 0; i < count; i++) if (i !== id && p.onObject === mp.players[i].sprite) own.standsOn = i;
    f |= own.standsOn << 9;
    send.flags = f;
  }

  return {
    mp,
    start: stage.multiplayerSpawns[id],

    // the stage's multiplayer init: the room event managers, a task for every player (and an arrow for each
    // other one), the Chao, and Sonic waiting out the title card
    setup(g) {
      game = g; player = g.player;
      g.ctx.mp = mp;
      player.itemEffect = 0; player.confusion = 0;
      g.tasks.add(receiveTask, RECEIVE_PRIORITY);
      g.tasks.add(sendTask, SEND_PRIORITY);
      for (let i = 0; i < count; i++) {
        const m = createMultiplayerPlayer(mp, i, stage.multiplayerSpawns[id], anims);
        mp.players[i] = m;
        g.tasks.add(m.task, PLAYERS_PRIORITY);
        if (i !== id) g.tasks.add(indicatorTask(mp, i, anims), INDICATOR_PRIORITY);
      }
      const chao = createChao(mp, stage.chaoSpawns[chaoPlace], 0, anims);
      mp.chao[0] = chao;
      g.tasks.add(chao.task, PLAYERS_PRIORITY);
      player.itemEffect |= TELEPORT;
      // the link recordings show the camera starting a frame later than in a single player act (its
      // unk64 is first eased on the stage's fourth frame); the decompilation doesn't show why
      g.state.cam.hold = 1;
      g.state.effects2d = { darkness: null, fade: null, objWindow: false, objWindowLayers: 0x08 };
    },

    // the title card's end: the players can be touched, Sonic blinks for two seconds, and the HUD appears
    cardEnd() {
      for (const m of mp.players) m.state &= ~2;
      player.invulnerable = CARD_INVULNERABLE;
      mp.actStart = false;
      player.ignoreInput = false;
      player.itemEffect &= ~TELEPORT;
      game.tasks.add(hudTask(mp, anims), 0x2000);
    },

    // Task_PlayerHandleDeath: he starts again at his own start place, keeping what he holds
    lifeLost() { game.respawn(stage.multiplayerSpawns[id]); },

    // confused, the pad's directions turn round by one to three places, changing with the clock
    input(held) {
      const p = player;
      if (!(p.itemEffect & CONFUSED)) return held;
      const pad = (held.right ? 1 : 0) | (held.left ? 2 : 0) | (held.up ? 4 : 0) | (held.down ? 8 : 0);
      const r = ((game.state.tick + p.confusion) & 3) || 1;
      const turned = ((pad << r) | (pad >> (4 - r))) & 0xF;
      if (--p.confusion === 0) p.itemEffect &= ~CONFUSED;
      return { ...held, right: !!(turned & 1), left: !!(turned & 2), up: !!(turned & 4), down: !!(turned & 8) };
    },

    // Task_GameStage: the shared random numbers move on every 512 frames, and with them the mystery boxes'
    // turn (its round every 4096); the clock runs down from the title card's end, and ends the round at 0
    clock() {
      const t = game.state.tick + 1;
      if ((t & ITEM_TURN) === 0) {
        mp.random = (Math.imul(mp.random, 0x196225) + 0x3C6EF35F) >>> 0;
        if ((t & ITEM_GENERATION) === 0) mp.itemTurn = (mp.itemTurn & 0xF) | ((((mp.itemTurn >> 4) + 1) << 4) & 0xF0);
        mp.itemTurn = (mp.itemTurn & 0xF8) | (mp.random & 7);
      }
      if (mp.actStart) return;
      mp.courseTime--;
      if (mp.courseTime <= 0) {
        mp.actStart = true;
        // the results screen takes over: the stage's tasks go, the rest of this frame's with them, so the
        // packet it left zeroed is what the link carries
        game.tasks.add(finishTask(mp, game, anims, () => { game.tasks.stop(); onResults?.(mp); }), 0x2000);
      }
    },

    // the end of Sonic's frame: his packet (not while he waits to start again), then his items run out
    send() {
      const p = player;
      if (p.dead) p.itemEffect = 0;
      if (p.death !== 'gone') writePacket();
      if ((p.itemEffect & INVISIBLE) && --mp.invisibleTimer <= 0) {
        p.itemEffect &= ~INVISIBLE;
        game.state.effects2d = { ...game.state.effects2d, objWindow: false, objWindowLayers: 0 };
      }
    },

    // the camera centres on this GBA's player task (gCamera.spectatorTarget is always this GBA in SA1)
    follow() {
      const m = mp.players[id];
      return { x: m.pos.x, y: m.pos.y, offsetY: m.offsetY };
    },
  };
}
