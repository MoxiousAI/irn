const { getTop } = require("../lib/leaderboard");
const { assertStoreReady } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    assertStoreReady();
    const top = await getTop();
    res.status(200).json({ leaderboard: top });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: (err && err.code) || "server_error", message: String((err && err.message) || err) });
  }
};
