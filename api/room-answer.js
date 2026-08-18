const { answerRound, publicState } = require("../lib/rooms");
const { assertStoreReady } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    assertStoreReady();
    const { code, playerId, guessReal } = req.body || {};
    const result = await answerRound(String(code || "").toUpperCase(), playerId, !!guessReal);
    if (result.error === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (result.error) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.status(200).json({ state: publicState(result.room, playerId) });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
