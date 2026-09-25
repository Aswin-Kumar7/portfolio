import { createHmac } from 'node:crypto'

/*
 * Shared state for the server side (visit alerts, flood protection, download limits): Upstash
 * Redis when it's connected, so every running copy of the code sees the same counts, this copy's
 * memory otherwise, or for a moment when Redis doesn't answer. Plus the keyed hashing that lets
 * IPs and browsers be counted without being stored.
 */

const [REDIS_URL, REDIS_TOKEN] = redisEnv().map((v) => v.trim().replace(/\/+$/, ''))
const REDIS = /^https:\/\/[\w.-]+\.upstash\.io$/.test(REDIS_URL) && REDIS_TOKEN ? REDIS_URL : ''

/** Upstash's own names, or Vercel's (<prefix>_REST_API_URL / _TOKEN, whatever prefix the store was connected with). */
function redisEnv() {
  const env = process.env
  if (env.UPSTASH_REDIS_REST_URL) return [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN ?? '']
  for (const [key, url] of Object.entries(env)) {
    const prefix = key.match(/^(\w+)_REST_API_URL$/)?.[1]
    const secret = prefix && env[`${prefix}_REST_API_TOKEN`]
    if (url && secret) return [url, secret]
  }
  return ['', '']
}

// ------------------------------------------------------------------ hashing
// keyed with a server secret, so a hash can't be turned back into an IP by trying them all
const SECRET = (process.env.DISCORD_WEBHOOK_URL ?? '').trim() || REDIS_TOKEN || (process.env.TURNSTILE_SECRET_KEY ?? '').trim() || 'visit-alerts'
/** @param {string} purpose @param {string} value @param {number} length */
export const hmac = (purpose, value, length) => createHmac('sha256', SECRET).update(`${purpose}:${value}`).digest('base64url').slice(0, length)
/** A keyed hash: lets IPs and browsers be counted without being stored. @param {string} s */
export const tag = (s) => hmac('tag', s, 22)

// ------------------------------------------------------------------ commands
/** @typedef {(string | number)[]} Command */
/** @type {Map<string, { value: string, hash?: Map<string, number>, expires: number }>} */
const memory = new Map()

/** @param {Command[]} commands @returns {Promise<unknown[]>} */
export async function run(commands) {
  if (REDIS) {
    const res = await fetch(`${REDIS}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2500),
    }).catch(() => null)
    const out = res?.ok ? await res.json().catch(() => null) : null
    if (Array.isArray(out) && out.length === commands.length && out.every((r) => r && !r.error)) return out.map((r) => r.result ?? null)
    console.warn('[store] Redis unavailable, using memory')
  }
  return commands.map(local)
}

/** The same few commands, in this instance's memory. @param {Command} command */
function local([op, key, ...args]) {
  const now = Date.now()
  if (memory.size > 20_000) {
    for (const [k, v] of memory) if (v.expires <= now) memory.delete(k)
    if (memory.size > 20_000) memory.clear()
  }
  const k = String(key)
  const found = memory.get(k)
  const entry = found && found.expires > now ? found : undefined
  if (op === 'GET') return entry?.value ?? null
  if (op === 'INCR') {
    const value = String(Number(entry?.value ?? 0) + 1)
    memory.set(k, { value, expires: entry?.expires ?? now + 3_600_000 })
    return Number(value)
  }
  if (op === 'EXPIRE') {
    if (entry) entry.expires = now + Number(args[0]) * 1000
    return entry ? 1 : 0
  }
  if (op === 'SET') {
    if (args.includes('NX') && entry) return null
    const px = args.indexOf('PX')
    const ms = px >= 0 ? Number(args[px + 1]) : Number(args[args.indexOf('EX') + 1]) * 1000
    memory.set(k, { value: String(args[0]), expires: now + ms })
    return 'OK'
  }
  if (op === 'HINCRBY') {
    const hash = entry?.hash ?? new Map()
    const n = (hash.get(String(args[0])) ?? 0) + Number(args[1])
    hash.set(String(args[0]), n)
    memory.set(k, { value: '', hash, expires: entry?.expires ?? now + 3_600_000 })
    return n
  }
  if (op === 'HGETALL') return entry?.hash ? [...entry.hash].flatMap(([f, n]) => [f, String(n)]) : []
  if (op === 'HLEN') return entry?.hash?.size ?? 0
  if (op === 'HEXISTS') return entry?.hash?.has(String(args[0])) ? 1 : 0
  return null
}

/** @param {string} key @param {number} ttl seconds */
export const count = async (key, ttl) => Number((await run([['INCR', key], ['EXPIRE', key, ttl]]))[0]) || 0
/** @param {string} key */
export const read = async (key) => {
  const [value] = await run([['GET', key]])
  return typeof value === 'string' ? value : null
}
/** @param {string} key @param {string} value @param {number} ttl seconds */
export const put = (key, value, ttl) => run([['SET', key, value, 'EX', ttl]])
/** Only the first caller in `ms` gets true. @param {string} key @param {number} ms */
export const claim = async (key, ms) => (await run([['SET', key, '1', 'PX', Math.max(1, Math.round(ms)), 'NX']]))[0] === 'OK'
