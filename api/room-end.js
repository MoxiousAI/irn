const { loadRoom, saveRoom, publicState } = require("../lib/rooms");
const { assertStoreReady } = require("../lib/store");
const { submitScore } = require("../lib/leaderboard");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    assertStoreReady();
    const { code, playerId } = req.body || {};
    const room = await loadRoom(String(code || "").toUpperCase());
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (room.hostId !== playerId) {
      res.status(403).json({ error: "not_host" });
      return;
    }
    room.status = "ended";
    await saveRoom(room);

    // Every player's total correct-in-this-session count feeds the shared
    // global leaderboard (same board solo mode submits to). Best-effort —
    // a leaderboard hiccup should never block the room from ending.
    try {
      await Promise.all(
        Object.values(room.players).map((p) => submitScore(p.name, p.score))
      );
    } catch (e) {
      // ignore — leaderboard is best-effort
    }

    res.status(200).json({ state: publicState(room, playerId) });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
