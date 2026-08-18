const crypto = require("crypto");
const pool = require("../data/pool.json");
const { getJSON, setJSON, del, withLock } = require("./store");

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const CODE_LENGTH = 5;
const MAX_PLAYERS = 8; // host + 7 others
const ROOM_TTL_SECONDS = 3 * 60 * 60; // 3h
const DECK_SIZE = 300; // rounds available per room, way past a real party's length

function roomKey(code) {
  return `room:${code.toUpperCase()}`;
}

function randomCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function shuffledIndices(n, count) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

async function createRoom(hostName) {
  let code;
  for (let attempt = 0; attempt < 8; attempt++) {
    code = randomCode();
    const existing = await getJSON(roomKey(code));
    if (!existing) break;
  }
  const hostId = crypto.randomUUID();
  const room = {
    code,
    hostId,
    createdAt: Date.now(),
    status: "lobby",
    playerOrder: [hostId],
    players: {
      [hostId]: { name: (hostName || "Anfitrião").slice(0, 24), score: 0, streak: 0, best: 0, joinedAt: Date.now() },
    },
    deck: shuffledIndices(pool.length, DECK_SIZE),
    deckPos: 0,
    round: null,
  };
  await saveRoom(room);
  return { room, playerId: hostId };
}

async function loadRoom(code) {
  if (!code) return null;
  return getJSON(roomKey(code));
}

async function saveRoom(room) {
  await setJSON(roomKey(room.code), room, ROOM_TTL_SECONDS);
}

async function deleteRoom(code) {
  await del(roomKey(code));
}

function isFull(room) {
  return room.playerOrder.length >= MAX_PLAYERS;
}

async function joinRoom(code, name) {
  const room = await loadRoom(code);
  if (!room) return { error: "not_found" };
  if (room.status !== "lobby") return { error: "already_started" };
  if (isFull(room)) return { error: "full" };

  const playerId = crypto.randomUUID();
  room.players[playerId] = {
    name: (name || "Jogador").slice(0, 24),
    score: 0,
    streak: 0,
    best: 0,
    joinedAt: Date.now(),
  };
  room.playerOrder.push(playerId);
  await saveRoom(room);
  return { room, playerId };
}

function startRound(room) {
  if (room.deckPos >= room.deck.length) {
    room.deck = shuffledIndices(pool.length, DECK_SIZE);
    room.deckPos = 0;
  }
  const poolIndex = room.deck[room.deckPos];
  room.deckPos += 1;
  room.round = {
    number: room.deckPos,
    poolIndex,
    startedAt: Date.now(),
    answers: {},
    revealed: false,
  };
}

function allAnswered(room) {
  if (!room.round) return false;
  const answered = Object.keys(room.round.answers).length;
  return answered >= room.playerOrder.length;
}

function revealRound(room) {
  if (!room.round || room.round.revealed) return;
  const [, , isReal] = pool[room.round.poolIndex];
  room.round.revealed = true;
  for (const pid of room.playerOrder) {
    const ans = room.round.answers[pid];
    if (!ans) continue;
    const correct = ans.guessReal === (isReal === 1);
    ans.correct = correct;
    const p = room.players[pid];
    if (!p) continue;
    if (correct) {
      p.score += 1;
      p.streak += 1;
      if (p.streak > p.best) p.best = p.streak;
    } else {
      p.streak = 0;
    }
  }
}

function recordAnswer(room, playerId, guessReal) {
  if (!room.round || room.round.revealed) return { error: "no_active_round" };
  if (!room.players[playerId]) return { error: "unknown_player" };
  if (room.round.answers[playerId]) return { error: "already_answered" };
  room.round.answers[playerId] = { guessReal: !!guessReal, at: Date.now() };
  if (allAnswered(room)) revealRound(room);
  return { ok: true };
}

// Atomic load -> recordAnswer -> save, guarded by a per-room lock (see
// lib/store.js: withLock). This is what actually closes the race: without
// it, two players answering in the same instant both read the same room
// blob, each applies their own answer in memory, and whichever save() wins
// silently erases the other player's answer. With the lock, the whole
// read-modify-write cycle for a given room code is fully serialized —
// concurrent requests queue up and each sees the previous one's write,
// so every answer is recorded and allAnswered()/revealRound() only ever
// fire once, from a consistent view of the round.
async function answerRound(code, playerId, guessReal) {
  return withLock(roomKey(code), async () => {
    const room = await loadRoom(code);
    if (!room) return { error: "not_found" };
    const result = recordAnswer(room, playerId, guessReal);
    if (result.error) return { error: result.error };
    await saveRoom(room);
    return { ok: true, room };
  });
}

function publicState(room, viewerId) {
  const players = room.playerOrder.map((pid) => {
    const p = room.players[pid];
    return {
      id: pid,
      name: p.name,
      score: p.score,
      streak: p.streak,
      best: p.best,
      answered: !!(room.round && room.round.answers[pid]),
      isHost: pid === room.hostId,
    };
  });

  let round = null;
  if (room.round) {
    const [name, genderCode] = pool[room.round.poolIndex];
    round = {
      number: room.round.number,
      name,
      gender: genderCode === 0 ? "F" : "M",
      revealed: room.round.revealed,
      answeredCount: Object.keys(room.round.answers).length,
      totalPlayers: room.playerOrder.length,
      you: room.round.answers[viewerId]
        ? { guessReal: room.round.answers[viewerId].guessReal, correct: room.round.answers[viewerId].correct }
        : null,
    };
    if (room.round.revealed) {
      const [, , isReal] = pool[room.round.poolIndex];
      round.isReal = isReal === 1;
    }
  }

  return {
    code: room.code,
    status: room.status,
    players,
    round,
    you: { id: viewerId, isHost: viewerId === room.hostId },
    maxPlayers: MAX_PLAYERS,
  };
}

module.exports = {
  MAX_PLAYERS,
  createRoom,
  loadRoom,
  saveRoom,
  deleteRoom,
  joinRoom,
  isFull,
  startRound,
  recordAnswer,
  answerRound,
  revealRound,
  allAnswered,
  publicState,
};
