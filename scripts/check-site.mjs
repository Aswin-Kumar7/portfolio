// Post-build gate (CI runs it before anything reaches Vercel): checks dist/ for the things that
// quietly break search visibility, weaken security or bloat the page. Exits non-zero with a list of failures.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const SITE = 'https://aswinkumar.dev'
const dist = new URL('../dist/', import.meta.url)
const read = (path) => readFileSync(new URL(path, dist), 'utf8')
const failures = []
const check = (ok, message) => ok || failures.push(message)

const html = read('index.html')
const meta = (attr, key) => html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`))?.[1]

// ---- head
const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
check(title.length >= 30 && title.length <= 65, `title should be 30–65 characters (is ${title.length}): "${title}"`)
const description = meta('name', 'description') ?? ''
check(description.length >= 70 && description.length <= 165, `meta description should be 70–165 characters (is ${description.length})`)
check(/<html lang="en">/.test(html), 'html lang="en" missing')
check(html.includes(`<link rel="canonical" href="${SITE}/" />`), 'canonical link missing or wrong')
check(!/noindex|nofollow/.test(meta('name', 'robots') ?? ''), 'robots meta blocks indexing')
for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) check(meta('property', key), `${key} missing`)
check(meta('name', 'twitter:card') === 'summary_large_image', 'twitter:card should be summary_large_image')
const ogImage = meta('property', 'og:image') ?? ''
check(ogImage.startsWith(`${SITE}/`) && existsSync(new URL(ogImage.slice(SITE.length + 1), dist)), `og:image must be an absolute ${SITE} URL to a file in dist (${ogImage})`)

// ---- structured data
const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1]
let person
try {
  person = JSON.parse(ld ?? 'null')?.['@graph']?.find((n) => n['@type'] === 'Person')
} catch {
  failures.push('structured data is not valid JSON')
}
check(person?.name && person?.url === `${SITE}/` && person?.sameAs?.length >= 2, 'structured data needs a Person with name, url and sameAs')

// ---- prerendered content
const root = html.slice(html.indexOf('<div id="root"'))
const words = root.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
check(words > 600, `prerendered page text is missing or thin (${words} words); did scripts/prerender.mjs run?`)
check(html.includes('<div id="root" data-prerendered>'), 'the prerendered copy should be marked data-prerendered (kept out of rendering)')
check((root.match(/<h1[\s>]/g) ?? []).length === 1, 'the page should have exactly one <h1>')
check(!/duck\.com/.test(html) && !/duck\.com/.test(read('llms.txt')), 'the old duck.com address is still in the output')

// ---- crawl files
check(/Sitemap: https:\/\/aswinkumar\.dev\/sitemap\.xml/.test(read('robots.txt')), 'robots.txt must point at the sitemap')
check(read('sitemap.xml').includes(`<loc>${SITE}/</loc>`), 'sitemap.xml missing the home page')
check(read('llms.txt').startsWith('# '), 'llms.txt missing')
for (const file of ['favicon.svg', 'apple-touch-icon.png', 'Aswin-Kumar-BS-Resume.pdf']) check(existsSync(new URL(file, dist)), `${file} missing from dist`)

// ---- security
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ''
check(csp.includes("default-src 'self'") && csp.includes("object-src 'none'"), 'Content-Security-Policy meta missing or too loose')
check(!/unsafe-eval/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), 'CSP must not allow eval or inline scripts')
for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`
  check(csp.includes(hash), 'an inline script is not covered by the CSP hashes (rebuild, or the page will break)')
}
check(!/\son[a-z]+="/i.test(html), 'inline event handler attribute in index.html (blocked by the CSP)')
for (const [tag] of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) check(/rel="[^"]*(noreferrer|noopener)/.test(tag), `external link opens without rel="noreferrer": ${tag.slice(0, 80)}`)
check(!readdirSync(new URL('static/', dist)).some((f) => f.endsWith('.map')), 'source maps must not ship to production')
// the visit alerts' webhook is a server-side secret (api/visit.js): it must never reach the page
const shipped = [html, ...readdirSync(new URL('static/', dist)).filter((f) => /\.(js|css)$/.test(f)).map((f) => read(`static/${f}`))]
check(!shipped.some((s) => /discord(app)?\.com\/api\/webhooks|DISCORD_WEBHOOK/i.test(s)), 'a Discord webhook (or its env var) is in the shipped files')
check(!readdirSync(new URL('assets/projects/', dist)).some((f) => /\.(png|jpe?g|webp|avif)$/.test(f)), 'project photos must be published scrambled (.bin) via scripts/project-image.py')
// the request log (middleware.js) knows every root file, and the résumé it rate-limits is really there
const { KNOWN, RESUME } = await import('../server/visits.js')
check(existsSync(new URL(RESUME.slice(1), dist)), `the résumé the middleware rate-limits (${RESUME}) isn't in dist`)
for (const f of readdirSync(dist).filter((n) => statSync(new URL(n, dist)).isFile())) {
  check(KNOWN.includes(`/${f}`), `/${f} ships at the site's root but server/visits.js doesn't know it (it would be logged as a missing page)`)
}
for (const dir of ['assets/', 'assets/projects/']) {
  for (const f of readdirSync(new URL(dir, dist)).filter((n) => /\.(png|jpe?g|webp|avif|bin)$/.test(n))) {
    const kb = statSync(new URL(dir + f, dist)).size / 1024
    check(kb < 150, `${dir}${f} is ${kb.toFixed(0)} kB: publish optimised sizes, keep originals in design/source-images`)
  }
}

// ---- JavaScript budget (gzip): what loads up front, and the black hole chunk
const js = readdirSync(new URL('static/', dist)).filter((f) => f.endsWith('.js'))
const gz = (f) => gzipSync(readFileSync(new URL(`static/${f}`, dist))).length / 1024
const entry = html.match(/<script type="module" crossorigin src="\/static\/([^"]+)"/)?.[1]
const preloaded = [...html.matchAll(/<link rel="modulepreload" crossorigin href="\/static\/([^"]+)"/g)].map((m) => m[1])
const initial = [entry, ...preloaded].filter(Boolean).reduce((sum, f) => sum + gz(f), 0)
check(initial < 200, `initial JavaScript is ${initial.toFixed(0)} kB gzip (budget 200 kB)`)
const scene = js.find((f) => f.startsWith('blackhole-'))
check(scene && gz(scene) < 20, `black hole chunk is ${scene ? gz(scene).toFixed(0) : '?'} kB gzip (budget 20 kB)`)

if (failures.length) {
  console.error(`site checks failed:\n${failures.map((f) => `  ✗ ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`site checks passed: title ${title.length} chars, description ${description.length}, ${words} words prerendered, initial JS ${initial.toFixed(0)} kB gzip`)
