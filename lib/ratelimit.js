// Simple fixed-window rate limiter built on the existing KV wrapper (no new
// dependency — see lib/store.js: incrWithTTL). One counter per (bucket, ip),
// reset every windowSeconds.
const { incrWithTTL } = require("./store");

async function checkRateLimit(bucket, identifier, limit, windowSeconds) {
  const key = `ratelimit:${bucket}:${identifier || "unknown"}`;
  const count = await incrWithTTL(key, windowSeconds);
  return { allowed: count <= limit, count, limit };
}

function clientIp(req) {
  const fwd = req.headers && req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

module.exports = { checkRateLimit, clientIp };
