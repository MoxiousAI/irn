const { loadRoom, publicState } = require("../lib/rooms");
const { assertStoreReady } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    assertStoreReady();

    const { code } = req.query || {};
    // playerId acts as a bearer token (it authorizes host actions on the
    // other endpoints), so it travels in a header instead of the query
    // string — keeps it out of access logs / browser history.
    const playerId = req.headers && req.headers["x-player-id"];
    if (!code) {
      res.status(400).json({ error: "missing_code" });
      return;
    }
    const room = await loadRoom(String(code).toUpperCase());
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(200).json({ state: publicState(room, playerId) });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
