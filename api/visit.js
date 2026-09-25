import { checkBotId } from 'botid/server'
import { READY, clientData, notice, pageStarted, pageUpdated, readToken, who } from '../server/visits.js'

/*
 * The page's side of the visit alerts (server/visits.js has the rest). When the page runs it
 * posts here once ("start": screen, clock, and so on, plus Vercel BotID's verdict) and again
 * whenever the visitor hides or leaves the tab ("update": time, scroll depth, clicks, input),
 * with the token it got back. Nothing is dropped: bots that run the page are logged as bots.
 *
 * The filters below only turn away requests that can't have come from the site's own pages.
 */

const SITE = /^https:\/\/(www\.)?aswinkumar\.dev$/

/** @param {number} status */
const empty = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } })

/** @param {Request} request */
export async function POST(request) {
  if (!READY) return empty(503)
  const headers = request.headers
  if (!SITE.test(headers.get('origin') ?? '')) return empty(403)
  const fetchSite = headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return empty(403)
  if (!/^text\/plain\b/.test(headers.get('content-type') ?? '')) return empty(415)
  if (Number(headers.get('content-length')) > 8000) return empty(413)

  const text = await request.text()
  if (text.length > 8000) return empty(413)
  /** @type {Record<string, any>} */
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return empty(400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return empty(400)

  const w = who(request)
  if (body.type === 'start') {
    const visit = await pageStarted(w, clientData(body), await verdict(request))
    return Response.json({ token: visit }, { headers: { 'cache-control': 'no-store' } })
  }
  if (body.type === 'update') {
    const key = readToken(body.token)
    if (!key) return empty(400)
    await pageUpdated(key, w, body)
    return empty(204)
  }
  return empty(400)
}

/**
 * Vercel BotID's view of the browser: 'human', 'bot', 'verified:<name>', or 'unchecked' when it
 * can't run (then the owner hears why, once a day).
 * @param {Request} request
 */
async function verdict(request) {
  try {
    const result = await checkBotId({
      // local testing only (BotID ignores it in production)
      developmentOptions: { bypass: /** @type {any} */ (process.env.BOTID_DEV_BYPASS) || undefined },
      advancedOptions: { headers: Object.fromEntries(request.headers) },
    })
    if (result.isVerifiedBot) {
      const name = 'verifiedBotName' in result && typeof result.verifiedBotName === 'string' ? result.verifiedBotName : ''
      return `verified:${name.replace(/[^\w .-]/g, '').slice(0, 40) || 'unnamed'}`
    }
    return result.isBot ? 'bot' : 'human'
  } catch (err) {
    await notice(
      'botid',
      `**Bot check unavailable**: Vercel BotID can't run (${String(err).slice(0, 160)}), so alerts can't tell people from bots that run the page. In Vercel, check the project's Settings > Security > OIDC Federation.`,
    )
    return 'unchecked'
  }
}
