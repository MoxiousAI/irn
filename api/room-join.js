const { joinRoom, publicState } = require("../lib/rooms");
const { assertStoreReady } = require("../lib/store");
const { checkRateLimit, clientIp } = require("../lib/ratelimit");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    assertStoreReady();

    const ip = clientIp(req);
    const rl = await checkRateLimit("room-join", ip, 10, 60);
    if (!rl.allowed) {
      res.status(429).json({ error: "rate_limited", message: "Demasiadas tentativas. Espera um pouco e tenta de novo." });
      return;
    }

    const { code, name } = req.body || {};
    if (!code) {
      res.status(400).json({ error: "missing_code" });
      return;
    }
    const result = await joinRoom(String(code).toUpperCase(), name);
    if (result.error === "not_found") {
      res.status(404).json({ error: "not_found", message: "Essa sala não existe." });
      return;
    }
    if (result.error === "already_started") {
      res.status(409).json({ error: "already_started", message: "Esse jogo já começou." });
      return;
    }
    if (result.error === "full") {
      res.status(409).json({ error: "full", message: "Essa sala já está cheia (8 jogadores)." });
      return;
    }
    res.status(200).json({ playerId: result.playerId, state: publicState(result.room, result.playerId) });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
