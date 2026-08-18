const { loadRoom, saveRoom, startRound, publicState } = require("../lib/rooms");
const { assertStoreReady } = require("../lib/store");

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
    if (room.status === "playing" && (!room.round || room.round.revealed)) {
      startRound(room);
      await saveRoom(room);
    }
    res.status(200).json({ state: publicState(room, playerId) });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
