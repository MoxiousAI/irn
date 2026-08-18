// Global leaderboard: best "total names guessed correctly in one session"
// per player name, shared between solo mode and party mode. Backed by a
// single Redis sorted set (see lib/store.js: leaderboardAdd/leaderboardTop).
const { leaderboardAdd, leaderboardTop } = require("./store");

const KEY = "leaderboard:global";
const TOP_N = 20;

function sanitizeName(name) {
  const trimmed = String(name || "").trim();
  return trimmed.slice(0, 24) || "Anónimo";
}

async function submitScore(name, score) {
  const cleanName = sanitizeName(name);
  const cleanScore = Math.max(0, Math.floor(Number(score) || 0));
  if (cleanScore <= 0) return getTop();
  await leaderboardAdd(KEY, cleanName, cleanScore);
  return getTop();
}

async function getTop() {
  return leaderboardTop(KEY, TOP_N);
}

module.exports = { submitScore, getTop, sanitizeName };
