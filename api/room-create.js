const { createRoom, publicState } = require("../lib/rooms");
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
    const rl = await checkRateLimit("room-create", ip, 10, 60);
    if (!rl.allowed) {
      res.status(429).json({ error: "rate_limited", message: "Demasiadas salas criadas. Espera um pouco e tenta de novo." });
      return;
    }

    const { name } = req.body || {};
    const { room, playerId } = await createRoom(name);
    res.status(200).json({ playerId, state: publicState(room, playerId) });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
