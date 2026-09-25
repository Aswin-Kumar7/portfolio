import { TURNSTILE, passCookies, verifyTurnstile } from '../server/shield.js'
import { count, tag } from '../server/store.js'
import { notePass, who } from '../server/visits.js'

/*
 * Trades a Cloudflare Turnstile token for a pass: a signed cookie that lets this browser, on
 * this network, download the résumé (and get past flood checks) for 30 minutes. The token comes
 * from the check page (server/shield.js) or the in-page check (src/components/ResumeGate.tsx).
 */

const SITE = /^https:\/\/(www\.)?aswinkumar\.dev$/
/** checks one IP may attempt an hour: plenty for a person, too few to grind at */
const PER_IP_HOUR = 30

/** @param {number} status */
const empty = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } })

/** @param {Request} request */
export async function POST(request) {
  if (!TURNSTILE) return empty(503)
  const headers = request.headers
  if (!SITE.test(headers.get('origin') ?? '')) return empty(403)
  const fetchSite = headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return empty(403)
  if (!/^text\/plain\b/.test(headers.get('content-type') ?? '')) return empty(415)
  if (Number(headers.get('content-length')) > 4096) return empty(413)

  const w = who(request)
  if ((await count(`sh:verify:${tag(w.ip)}:${Math.floor(Date.now() / 3_600_000)}`, 3700)) > PER_IP_HOUR) return empty(429)

  const text = await request.text()
  if (text.length > 4096) return empty(413)
  /** @type {unknown} */
  let token
  try {
    token = JSON.parse(text)?.token
  } catch {
    return empty(400)
  }

  const ok = await verifyTurnstile(token, w.ip)
  notePass(request, ok)
  if (!ok) return empty(403)
  const response = empty(204)
  for (const cookie of passCookies(w.ip)) response.headers.append('set-cookie', cookie)
  return response
}
