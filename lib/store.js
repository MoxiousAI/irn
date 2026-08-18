// Thin KV wrapper. Uses Upstash Redis (via the Vercel Marketplace "Redis"
// integration) when the project has it connected. That integration injects
// either UPSTASH_REDIS_REST_URL/TOKEN or the older KV_REST_API_URL/TOKEN
// names depending on when it was set up, so both are checked.
// Falls back to an in-memory Map so `vercel dev` / plain `node` work without
// any setup — this fallback is single-process only and is NOT safe for a
// real multi-instance deployment. In a real Vercel deployment (preview or
// production) we fail loudly instead of silently degrading — see
// assertStoreReady() below.

const crypto = require("crypto");

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

let kv = null;
if (REST_URL && REST_TOKEN) {
  try {
    const { Redis } = require("@upstash/redis");
    kv = new Redis({ url: REST_URL, token: REST_TOKEN });
  } catch (e) {
    kv = null;
  }
}

const IS_PROD_DEPLOYMENT = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

if (!kv) {
  // Server-side log only — never shown to players. Loud on purpose: this is
  // exactly the situation that made party mode fail unpredictably before.
  // eslint-disable-next-line no-console
  console.warn(
    "[warn] Sem Redis configurado (UPSTASH_REDIS_REST_URL/TOKEN em falta) — " +
      "modo festa vai falhar em produção multi-instância. A usar memória local (só serve para dev)."
  );
}

// Call at the top of every /api/room-*.js handler. Throws instead of letting
// the in-memory fallback silently produce inconsistent room state once this
// is actually deployed to Vercel (each invocation can land on a different
// instance, so "sala criada" on one instance would look "inexistente" on
// another). Local dev (`vercel dev` / plain `node`, no VERCEL_ENV/NODE_ENV=
// production) keeps working against the in-memory fallback unchanged.
function assertStoreReady() {
  if (!kv && IS_PROD_DEPLOYMENT) {
    const err = new Error("party mode requires Redis configuration in production");
    err.code = "no_redis_in_production";
    err.status = 500;
    throw err;
  }
}

const memory = new Map();
const memoryExpiry = new Map();

function memGet(key) {
  const exp = memoryExpiry.get(key);
  if (exp && Date.now() > exp) {
    memory.delete(key);
    memoryExpiry.delete(key);
    return undefined;
  }
  return memory.get(key);
}

function memSet(key, value, ttlSeconds) {
  memory.set(key, value);
  if (ttlSeconds) memoryExpiry.set(key, Date.now() + ttlSeconds * 1000);
}

async function getJSON(key) {
  if (kv) {
    const val = await kv.get(key);
    return val || null;
  }
  const val = memGet(key);
  return val === undefined ? null : val;
}

async function setJSON(key, value, ttlSeconds) {
  if (kv) {
    await kv.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
    return;
  }
  memSet(key, value, ttlSeconds);
}

async function del(key) {
  if (kv) {
    await kv.del(key);
    return;
  }
  memory.delete(key);
  memoryExpiry.delete(key);
}

// Atomic fixed-window counter, used for rate limiting. Returns the count
// *after* incrementing. TTL is only applied on the first increment of the
// window (matches Redis INCR + EXPIRE-on-first-hit), both on real Redis and
// on the in-memory fallback, so behaviour is the same on both backends.
async function incrWithTTL(key, ttlSeconds) {
  if (kv) {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, ttlSeconds);
    }
    return count;
  }
  const current = memGet(key);
  const next = (typeof current === "number" ? current : 0) + 1;
  if (next === 1) {
    memSet(key, next, ttlSeconds);
  } else {
    memory.set(key, next); // keep the existing expiry, don't reset the window
  }
  return next;
}

// ---- distributed lock, used to make room-blob read-modify-write cycles
// atomic (see lib/rooms.js: answerRound). Behaviour is equivalent on both
// backends: whoever calls withLock(key, fn) for the same key waits for any
// in-flight call on that same key to finish before its own fn() runs.
const LOCK_PREFIX = "lock:";
const memoryLockChains = new Map(); // key -> Promise (tail of the queue for that key)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UNLOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

async function withLock(key, fn, { ttlMs = 5000, maxWaitMs = 6000, retryDelayMs = 60 } = {}) {
  if (kv) {
    const lockKey = LOCK_PREFIX + key;
    const token = crypto.randomUUID();
    const deadline = Date.now() + maxWaitMs;
    let acquired = false;
    while (Date.now() < deadline) {
      const res = await kv.set(lockKey, token, { nx: true, px: ttlMs });
      if (res === "OK" || res === true) {
        acquired = true;
        break;
      }
      await sleep(retryDelayMs + Math.random() * retryDelayMs);
    }
    if (!acquired) {
      const err = new Error("lock_timeout");
      err.code = "lock_timeout";
      throw err;
    }
    try {
      return await fn();
    } finally {
      try {
        await kv.eval(UNLOCK_SCRIPT, [lockKey], [token]);
      } catch (e) {
        // Lock will simply expire via its TTL — safe to ignore.
      }
    }
  }

  // In-memory fallback: a strict FIFO queue per key, so concurrent callers
  // for the *same* room never interleave their read-modify-write, matching
  // the guarantee the Redis lock gives in production.
  const tail = memoryLockChains.get(key) || Promise.resolve();
  const turn = tail.then(() => fn());
  memoryLockChains.set(
    key,
    turn.then(
      () => undefined,
      () => undefined
    )
  );
  return turn;
}

module.exports = { getJSON, setJSON, del, incrWithTTL, withLock, assertStoreReady, usingKV: !!kv };
