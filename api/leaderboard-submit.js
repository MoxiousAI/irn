const { submitScore } = require("../lib/leaderboard");
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
    // Generous: solo mode submits after every correct answer while playing,
    // this is just abuse protection, not the primary UX throttle (that's
    // client-side, see app.js).
    const rl = await checkRateLimit("leaderboard-submit", ip, 60, 60);
    if (!rl.allowed) {
      res.status(429).json({ error: "rate_limited", message: "Demasiados pedidos. Espera um pouco." });
      return;
    }

    const { name, score } = req.body || {};
    const leaderboard = await submitScore(name, score);
    res.status(200).json({ leaderboard });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
