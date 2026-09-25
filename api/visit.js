import { createHmac, timingSafeEqual } from 'node:crypto'
import { checkBotId } from 'botid/server'

/*
 * Visit alerts. The page (src/lib/visits.ts) posts here when a visit starts and again whenever
 * the visitor hides or leaves the tab. This adds what only the server knows (the IP, and the
 * location Vercel resolves from it), then posts one message per visit to a Discord channel and
 * keeps editing it. The webhook lives in the DISCORD_WEBHOOK_URL env var, so the page never
 * holds it and nobody else can post to the channel.
 *
 * Anyone can call this endpoint, so nothing here trusts the caller:
 * - a new alert needs a browser that passed Vercel BotID's invisible challenge (scripts and
 *   automated browsers don't), coming from the site's own pages; an edit needs the signature
 *   that browser was handed for its message
 * - one alert per visitor per half hour: reloads, new tabs and coming straight back edit it
 * - budgets shared by every running copy of this function (through Upstash Redis): a few new
 *   alerts per IP an hour, and a ceiling for everyone together. Past the ceiling nothing is
 *   paused or lost: the extra visits are counted in one summary message instead
 * - a full stop whenever Discord rate-limits or rejects the webhook, so it's never hammered into a ban
 * - what the page sends is shown as inert code: it can't ping, link or format anything; the
 *   only links (map, IP lookup) are built from Vercel's own headers
 * - IPs are kept only as keyed hashes, for an hour at most; no secrets in responses or logs
 */

const WEBHOOK = (process.env.DISCORD_WEBHOOK_URL ?? '').trim().replace(/\/+$/, '')
const VALID_WEBHOOK = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/
const SITE = /^https:\/\/(www\.)?aswinkumar\.dev$/
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|python|curl|wget|axios|node-fetch|go-http/i

const MINUTE = 60_000
/** one visit: the same browser within this long (of its last sign of life) is still the same visit */
const VISIT = 30 * 60
/** a person opens the site a few times an hour, not dozens */
const PER_IP = { start: 6, update: 120 }
/** well above this site's real traffic: past it, new visits go into the summary */
const EVERYONE = { starts: 60, window: 10 * MINUTE }

/** @param {number} status */
const empty = (status) => new Response(null, { status })
/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** A keyed hash: lets IPs be counted without being stored. @param {string} s */
const tag = (s) => createHmac('sha256', WEBHOOK).update(`tag:${s}`).digest('base64url').slice(0, 22)
/** Messages are edited only by the visit that created them: it gets this signature back. @param {string} id */
const sign = (id) => createHmac('sha256', WEBHOOK).update(id).digest('base64url').slice(0, 32)
/** @param {string} id @param {unknown} sig */
function verify(id, sig) {
  if (typeof sig !== 'string') return false
  const a = Buffer.from(sign(id))
  const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ------------------------------------------------------------------ shared state
// Upstash Redis when it's connected (one store for every copy of this function that's running),
// this copy's memory otherwise, or for a moment when Redis doesn't answer.
const [REDIS_URL, REDIS_TOKEN] = redisEnv().map((v) => v.trim().replace(/\/+$/, ''))
const REDIS = /^https:\/\/[\w.-]+\.upstash\.io$/.test(REDIS_URL) && REDIS_TOKEN ? REDIS_URL : ''

/** Upstash's own names, or Vercel's (<prefix>_REST_API_URL / _TOKEN, whatever prefix the store was connected with). */
function redisEnv() {
  const env = process.env
  if (env.UPSTASH_REDIS_REST_URL) return [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN ?? '']
  for (const [key, url] of Object.entries(env)) {
    const prefix = key.match(/^(\w+)_REST_API_URL$/)?.[1]
    const token = prefix && env[`${prefix}_REST_API_TOKEN`]
    if (url && token) return [url, token]
  }
  return ['', '']
}

/** @typedef {(string | number)[]} Command */
/** @type {Map<string, { value: string, expires: number }>} */
const memory = new Map()

/** @param {Command[]} commands @returns {Promise<unknown[]>} */
async function run(commands) {
  if (REDIS) {
    const res = await fetch(`${REDIS}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2500),
    }).catch(() => null)
    const out = res?.ok ? await res.json().catch(() => null) : null
    if (Array.isArray(out) && out.length === commands.length && out.every((r) => r && !r.error)) return out.map((r) => r.result ?? null)
    console.warn('[visit] Redis unavailable, using memory')
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
    memory.set(k, { value: String(args[0]), expires: now + Number(args[args.indexOf('EX') + 1]) * 1000 })
    return 'OK'
  }
  return null
}

/** @param {string} key @param {number} ttl seconds */
const count = async (key, ttl) => Number((await run([['INCR', key], ['EXPIRE', key, ttl]]))[0]) || 0
/** @param {string} key */
const read = async (key) => {
  const [value] = await run([['GET', key]])
  return typeof value === 'string' ? value : null
}
/** @param {string} key @param {string} value @param {number} ttl seconds */
const put = (key, value, ttl) => run([['SET', key, value, 'EX', ttl]])
/** Only the first caller in `ttl` seconds gets true. @param {string} key @param {number} ttl */
const claim = async (key, ttl) => (await run([['SET', key, '1', 'EX', ttl, 'NX']]))[0] === 'OK'

/** @param {string} ip @param {'start' | 'update'} kind */
async function withinBudget(ip, kind) {
  const hour = Math.floor(Date.now() / 3_600_000)
  return (await count(`va:ip:${tag(ip)}:${kind}:${hour}`, 3700)) <= PER_IP[kind]
}

// ------------------------------------------------------------------ handler
/** @param {Request} request */
export async function POST(request) {
  if (!VALID_WEBHOOK.test(WEBHOOK)) return empty(503)
  const headers = request.headers
  const ua = headers.get('user-agent') ?? ''
  // the site's own pages send these; other sites' pages can't fake them
  if (!SITE.test(headers.get('origin') ?? '')) return empty(403)
  const fetchSite = headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return empty(403)
  if (!/^text\/plain\b/.test(headers.get('content-type') ?? '')) return empty(415)
  if (BOTS.test(ua)) return empty(204)
  // set by Vercel's edge, not the caller
  const ip = headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const text = await request.text()
  if (text.length > 8000) return empty(413)
  /** @type {Record<string, any>} */
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return empty(400)
  }
  if (!body || typeof body !== 'object') return empty(400)

  if (body.type === 'start') return start(body, headers, ip, ua)
  if (body.type === 'update' && typeof body.id === 'string' && /^\d{5,25}$/.test(body.id) && verify(body.id, body.sig)) {
    return update(body, headers, ip, ua)
  }
  return empty(400)
}

/** @param {Record<string, any>} b @param {Headers} headers @param {string} ip @param {string} ua */
async function start(b, headers, ip, ua) {
  if (!(await human(headers))) return empty(403)
  const visitor = tag(`${ip}|${ua}`)

  // this browser is already on an alert (a reload, another tab, or it lost its storage): reuse it
  let id = await read(`va:visit:${visitor}`)
  if (!id && !(await claim(`va:opening:${visitor}`, 10))) {
    // another of its tabs is creating it right now
    for (let i = 0; i < 6 && !id; i++) {
      await sleep(400)
      id = await read(`va:visit:${visitor}`)
    }
  }
  if (id && /^\d{5,25}$/.test(id)) {
    if (!(await withinBudget(ip, 'update'))) return empty(429)
    const loads = await count(`va:loads:${id}`, 86_400)
    await put(`va:visit:${visitor}`, id, VISIT)
    await discord(`${WEBHOOK}/messages/${id}`, 'PATCH', compose({ ...b, loads }, headers, ip, ua))
    return Response.json({ id, sig: sign(id), loads }, { headers: { 'cache-control': 'no-store' } })
  }

  if (!(await withinBudget(ip, 'start'))) return empty(429)
  const slot = Math.floor(Date.now() / EVERYONE.window)
  if ((await count(`va:all:${slot}`, EVERYONE.window / 1000 + 60)) > EVERYONE.starts) {
    await summarise(slot)
    return empty(202)
  }
  const res = await discord(`${WEBHOOK}?wait=true`, 'POST', compose(b, headers, ip, ua))
  if (!res?.ok) return empty(502)
  const posted = /** @type {{ id?: unknown }} */ (await res.json().catch(() => ({}))).id
  if (typeof posted !== 'string') return empty(502)
  await run([
    ['SET', `va:visit:${visitor}`, posted, 'EX', VISIT],
    ['SET', `va:loads:${posted}`, '1', 'EX', 86_400],
  ])
  return Response.json({ id: posted, sig: sign(posted), loads: 1 }, { headers: { 'cache-control': 'no-store' } })
}

/** @param {Record<string, any>} b @param {Headers} headers @param {string} ip @param {string} ua */
async function update(b, headers, ip, ua) {
  if (!(await withinBudget(ip, 'update'))) return empty(429)
  const [loads] = await run([
    ['GET', `va:loads:${b.id}`],
    // still here: the half hour starts again
    ['SET', `va:visit:${tag(`${ip}|${ua}`)}`, b.id, 'EX', VISIT],
  ])
  const res = await discord(`${WEBHOOK}/messages/${b.id}`, 'PATCH', compose({ ...b, loads: Math.max(Number(loads) || 1, int(b.loads, 1, 1e4) ?? 1) }, headers, ip, ua))
  return empty(res?.ok ? 204 : 502)
}

/** Vercel BotID: a real browser that ran its challenge on one of the site's pages. @param {Headers} headers */
async function human(headers) {
  try {
    const verdict = await checkBotId({
      // local testing only (BotID ignores it in production)
      developmentOptions: { bypass: /** @type {any} */ (process.env.BOTID_DEV_BYPASS) || undefined },
      advancedOptions: { headers: Object.fromEntries(headers) },
    })
    return !verdict.isBot && !verdict.isVerifiedBot
  } catch (err) {
    // misconfigured (BotID needs the project's OIDC setting): stay closed, and say why once a day
    if (await claim('va:botid-broken', 86_400)) {
      await discord(WEBHOOK, 'POST', {
        content: `**Visit alerts are off**: the bot check can't run (${String(err).slice(0, 160)}). In Vercel, check the project's Settings > Security > OIDC Federation.`,
      })
    }
    return false
  }
}

/** Past the ceiling: one message per window that keeps count, instead of one per visit. @param {number} slot */
async function summarise(slot) {
  const ttl = EVERYONE.window / 1000 + 120
  const extra = await count(`va:summary:${slot}:n`, ttl)
  const message = {
    content: `**Busy spell**: ${extra} more new visits in these ${EVERYONE.window / MINUTE} minutes than the ${EVERYONE.starts} that get their own alert. A burst like this is usually fake traffic; real visits among it are counted here, not lost.`,
  }
  const id = await read(`va:summary:${slot}:id`)
  if (!id) {
    if (!(await claim(`va:summary:${slot}:lock`, ttl))) return
    const res = await discord(`${WEBHOOK}?wait=true`, 'POST', message)
    const posted = res?.ok ? /** @type {{ id?: unknown }} */ (await res.json().catch(() => ({}))).id : null
    if (typeof posted === 'string') await put(`va:summary:${slot}:id`, posted, ttl)
    return
  }
  // edits spaced out: Discord allows a webhook only a few calls a second
  if (await claim(`va:summary:${slot}:tick`, 15)) await discord(`${WEBHOOK}/messages/${id}`, 'PATCH', message)
}

// ------------------------------------------------------------------ Discord
/** Discord said stop (rate limit), or the webhook is gone: no calls before this time */
let pausedUntil = 0

/** @param {number} seconds */
async function pause(seconds) {
  pausedUntil = Date.now() + seconds * 1000
  await put('va:paused', '1', Math.max(1, Math.ceil(seconds)))
}

/** @param {string} url @param {string} method @param {object} message */
async function discord(url, method, message) {
  if (Date.now() < pausedUntil || (await read('va:paused'))) return null
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    // nothing in a message may ping anyone, whatever it contains
    body: JSON.stringify({ ...message, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  if (!res) return null
  if (res.status === 429) {
    // Discord's rate limit: wait it out (repeated 429s get the caller's IP banned)
    const retry = Number(res.headers.get('retry-after'))
    await pause(Math.min(Number.isFinite(retry) && retry > 0 ? retry : 10, 600))
  } else if (res.status === 401 || res.status === 403 || res.status === 404) {
    // the webhook was deleted or its token changed (a 404 for a deleted *message* is fine)
    const { code } = /** @type {{ code?: number }} */ (await res.clone().json().catch(() => ({})))
    if (res.status !== 404 || code === 10015) await pause(60 * 60)
  }
  if (!res.ok) console.warn(`[visit] Discord answered ${res.status} to a ${method}`)
  return res
}

// ------------------------------------------------------------------ message
/**
 * @param {Record<string, any>} b what the page sent
 * @param {Headers} headers
 * @param {string} ip
 * @param {string} ua
 */
function compose(b, headers, ip, ua) {
  const visitor = b.visitor ?? {}
  const visits = int(visitor.visits, 1, 1e6) ?? 1
  const started = int(b.started, 0, Date.now() + 60_000) ?? Date.now()

  // Vercel's IP geolocation (only on deployments; locally these are absent)
  const code = /^[A-Z]{2}$/.test(headers.get('x-vercel-ip-country') ?? '') ? headers.get('x-vercel-ip-country') : ''
  const city = decode(headers.get('x-vercel-ip-city') ?? '')
  const region = headers.get('x-vercel-ip-country-region') ?? ''
  const place = [city, region !== city && /^[\w-]{1,4}$/.test(region) ? region : '', country(code)].filter(Boolean).join(', ') || 'somewhere unknown'
  const lat = headers.get('x-vercel-ip-latitude') ?? ''
  const lon = headers.get('x-vercel-ip-longitude') ?? ''
  const map = /^-?\d+(\.\d+)?$/.test(lat) && /^-?\d+(\.\d+)?$/.test(lon) ? ` · [map](https://www.google.com/maps?q=${lat},${lon})` : ''
  const flag = code ? [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') + ' ' : ''

  /** @type {{ name: string, value: string, inline?: boolean }[]} */
  const fields = [
    { name: 'Where', value: `${flag}${place}${map}` },
    { name: 'IP', value: /^[\da-f:.]{3,45}$/i.test(ip) ? `[${ip}](https://ipinfo.io/${ip})` : 'unknown', inline: true },
    { name: 'Their time', value: localTime(started, b.tz), inline: true },
    { name: 'Device', value: device(ua, b) },
    { name: 'Browser', value: [browser(ua, b), mono(b.lang, 20)].filter(Boolean).join(' · ') },
    { name: 'Visits', value: history(visits, visitor) },
    { name: 'Came from', value: arrival(b) },
    { name: 'Session', value: session(b) },
  ]
  const clicks = Array.isArray(b.actions) ? b.actions.slice(0, 20).map((/** @type {unknown} */ a) => mono(a, 60)).filter(Boolean) : []
  if (clicks.length) fields.push({ name: 'Clicked', value: clicks.join(', ').slice(0, 1000) })

  const returning = visits > 1
  return {
    // the plain line is what a phone notification shows
    content: `**${returning ? 'Returning visitor' : 'New visitor'}** from ${flag}${place}`,
    embeds: [
      {
        color: returning ? 0x5865f2 : 0x3ba55d,
        fields,
        footer: { text: `visitor ${/^[\w-]{4,40}$/.test(visitor.id) ? visitor.id : 'unknown'}` },
        timestamp: new Date(started).toISOString(),
      },
    ],
  }
}

/** @param {Record<string, any>} b */
function session(b) {
  const seconds = int(b.seconds, 0, 86_400 * 7) ?? 0
  const depth = int(b.depth, 0, 100) ?? 0
  const loads = int(b.loads, 1, 1e4) ?? 1
  return [
    b.type === 'update' ? `${duration(seconds)} on the page` : 'on the page now',
    depth ? `scrolled ${depth}%` : '',
    loads > 1 ? `opened ${loads} times` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** @param {number} visits @param {Record<string, any>} visitor */
function history(visits, visitor) {
  if (visits === 1) return 'First visit'
  const now = Date.now()
  const parts = [`${ordinal(visits)} visit`]
  const previous = int(visitor.previous, 1, now)
  const first = int(visitor.first, 1, now)
  if (previous) parts.push(`last seen ${ago(now - previous)}`)
  if (first) parts.push(`first seen ${new Date(first).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`)
  return parts.join(' · ')
}

/** @param {Record<string, any>} b */
function arrival(b) {
  let from = 'direct'
  if (typeof b.referrer === 'string' && b.referrer) {
    try {
      const url = new URL(b.referrer)
      from = mono(url.host + (url.pathname === '/' ? '' : url.pathname), 120)
    } catch {
      from = mono(b.referrer, 120)
    }
  }
  const page = typeof b.page === 'string' && b.page !== '/' ? ` · landed on ${mono(b.page, 160)}` : ''
  return from + page
}

/** @param {string} ua @param {Record<string, any>} b */
function device(ua, b) {
  const ch = b.ch && typeof b.ch === 'object' ? b.ch : {}
  const touch = int(b.touch, 0, 100) ?? 0
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)
  const kind = ipad || (/Android/.test(ua) && !/Mobile/.test(ua)) || /Tablet/.test(ua) ? 'Tablet' : ch.mobile === true || /Mobi|iPhone|Android/.test(ua) ? 'Phone' : 'Desktop'
  const model = typeof ch.model === 'string' && ch.model.trim() ? mono(ch.model, 40) : /iPhone/.test(ua) ? 'iPhone' : ipad ? 'iPad' : ''

  const pv = typeof ch.platformVersion === 'string' ? ch.platformVersion : ''
  const major = Number.parseInt(pv, 10)
  /** @type {RegExpMatchArray | null} */
  let m
  let os = 'unknown OS'
  if ((m = ua.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/))) os = `${ipad ? 'iPadOS' : 'iOS'} ${m[1]}.${m[2]}`
  else if (ipad) os = 'iPadOS'
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = `Android ${major || m[1]}`
  else if (/Windows NT 10/.test(ua)) os = major ? (major >= 13 ? 'Windows 11' : 'Windows 10') : 'Windows 10/11'
  else if ((m = ua.match(/Windows NT (\d+\.\d+)/))) os = `Windows NT ${m[1]}`
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Macintosh|Mac OS X/.test(ua)) os = pv ? `macOS ${pv.split('.').slice(0, 2).join('.')}` : 'macOS'
  else if (/Linux/.test(ua)) os = /Ubuntu/.test(ua) ? 'Linux (Ubuntu)' : /Fedora/.test(ua) ? 'Linux (Fedora)' : 'Linux'

  const screen = Array.isArray(b.screen) ? b.screen : []
  const w = int(screen[0], 1, 20_000)
  const h = int(screen[1], 1, 20_000)
  const dpr = typeof screen[2] === 'number' && screen[2] > 0 && screen[2] < 10 ? Math.round(screen[2] * 100) / 100 : 0
  const cores = int(b.cores, 1, 1024)
  const memory = typeof b.memory === 'number' && b.memory > 0 && b.memory < 1024 ? b.memory : 0
  return [
    model ? `${kind} (${model})` : kind,
    os,
    w && h ? `${w}×${h}${dpr ? ` @${dpr}x` : ''}` : '',
    cores ? `${cores} cores` : '',
    memory ? `${memory} GB` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** @param {string} ua @param {Record<string, any>} b */
function browser(ua, b) {
  /** @type {[string, RegExp][]} */
  const known = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['Opera', /(?:OPR|OPT)\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Yandex', /YaBrowser\/(\d+)/],
    ['Vivaldi', /Vivaldi\/(\d+)/],
    ['Instagram in-app', /Instagram ([\d]+)/],
    ['Facebook in-app', /FB(?:AV|_IAB)\/(\d+)?/],
    ['LinkedIn in-app', /LinkedInApp(?:\/(\d+))?/],
    ['Chrome', /CriOS\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+(?:\.\d+)?).*Safari/],
  ]
  for (const [name, re] of known) {
    const m = ua.match(re)
    if (!m) continue
    const label = name === 'Chrome' && b.brave === true ? 'Brave' : name
    return m[1] ? `${label} ${m[1]}` : label
  }
  return 'unknown browser'
}

// ------------------------------------------------------------------ helpers
/** @param {unknown} v @param {number} min @param {number} max */
function int(v, min, max) {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined
}

/** Page-supplied text, shown as code so it can't format, link or ping. @param {unknown} v @param {number} max */
function mono(v, max) {
  if (typeof v !== 'string') return ''
  const s = v.replace(/[\u0000-\u001f\u007f`]/g, '').trim().slice(0, max)
  return s ? `\`${s}\`` : ''
}

/** @param {string} s */
function decode(s) {
  try {
    return decodeURIComponent(s).replace(/[^\p{L}\p{M}\s'.-]/gu, '').slice(0, 60)
  } catch {
    return ''
  }
}

/** @param {string | null} code */
function country(code) {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** @param {number} at @param {unknown} tz */
function localTime(at, tz) {
  if (typeof tz !== 'string' || !/^[\w+/-]{1,40}$/.test(tz)) return 'unknown'
  try {
    return `${new Date(at).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })} · ${tz}`
  } catch {
    return 'unknown'
  }
}

/** @param {number} s */
function duration(s) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/** @param {number} ms */
function ago(ms) {
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** @param {number} n */
function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}
