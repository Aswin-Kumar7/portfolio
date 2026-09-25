import { TURNSTILE, passCookies, ticketFor, verifyTurnstile } from '../server/shield.js'
import { count, tag } from '../server/store.js'
import { notePass, who } from '../server/visits.js'

/*
 * Trades a Cloudflare Turnstile token for what it was solved for: a ticket for one résumé
 * download (the check has to be passed again for the next), or, during a flood, a pass cookie
 * for this network's page views. The token comes from the check page (server/shield.js) or the
 * in-page check (src/components/ResumeGate.tsx).
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
  /** @type {Record<string, unknown>} */
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return empty(400)
  }
  if (!body || typeof body !== 'object') return empty(400)
  const purpose = body.for === 'resume' ? 'resume' : 'page'

  const ok = await verifyTurnstile(body.token, w.ip, purpose)
  notePass(request, ok)
  if (!ok) return empty(403)
  if (purpose === 'resume') return Response.json({ ticket: ticketFor(w.ip) }, { headers: { 'cache-control': 'no-store' } })
  const response = empty(204)
  for (const cookie of passCookies(w.ip)) response.headers.append('set-cookie', cookie)
  return response
}
