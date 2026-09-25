// Runs after `vite build`: renders the app to static HTML inside dist/index.html, adds the
// schema.org structured data and the Content-Security-Policy, and writes dist/sitemap.xml (dated
// this build) and dist/llms.txt, all from the same sources, so none of it can drift.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const SITE = 'https://aswinkumar.dev'
const dist = new URL('../dist/', import.meta.url)

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { render, data } = await vite.ssrLoadModule('/src/entry-server.tsx')
  // brand-logo outlines are a third of the markup and mean nothing to a crawler; the app redraws them
  const markup = render().replace(/ d="[^"]{120,}"/g, '')

  const today = new Date().toISOString().slice(0, 10)
  const indexUrl = new URL('index.html', dist)
  const html = await readFile(indexUrl, 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error('prerender: empty #root not found in dist/index.html')
  const marker = /\s*<!-- structured data .*?-->/
  if (!marker.test(html)) throw new Error('prerender: structured-data marker not found in dist/index.html')
  // '<' written as its JSON escape, so no string in the data can close the script tag
  const jsonLd = JSON.stringify(structuredData(data, today)).replace(/</g, '\\u003c')
  const page = html
    .replace(marker, `\n    <script type="application/ld+json">${jsonLd}</script>`)
    // for crawlers only: not laid out or painted in the browser, where the app replaces it
    .replace('<div id="root"></div>', `<div id="root" data-prerendered>${markup}</div>`)
  await writeFile(indexUrl, withCsp(page))

  await writeFile(
    new URL('sitemap.xml', dist),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
  )

  await writeFile(new URL('llms.txt', dist), llms(data))
  const words = markup.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  console.log(`prerendered ${Math.round(markup.length / 1024)} kB of HTML (${words} words), sitemap.xml, llms.txt`)
} finally {
  await vite.close()
}

/**
 * Content-Security-Policy as a <meta> tag, so its hashes always match this build's one inline
 * script (the loader). Only this site's own files run, plus Microsoft Clarity's documented hosts;
 * no inline event handlers, no eval, no plugins, no <base> or form hijacking.
 * frame-ancestors can't be set from a <meta>: vercel.json sends it as a header.
 */
function withCsp(html) {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
  if (!inline.length) throw new Error("prerender: expected the loader's inline script")
  if (/\son[a-z]+="/i.test(html.slice(0, html.indexOf('<div id="root"')))) throw new Error('prerender: inline event handler in index.html (the CSP would block it)')
  const clarity = 'https://*.clarity.ms https://c.bing.com'
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inline.join(' ')} ${clarity}`,
    "style-src 'self' 'unsafe-inline'",
    // blob: for the project photos, unscrambled in the page (src/components/VeiledImage.tsx)
    `img-src 'self' data: blob: https://avatars.githubusercontent.com ${clarity}`,
    "font-src 'self' data:",
    `connect-src 'self' ${clarity}`,
    // 'self': Vercel BotID's deeper check frames its own first-party path (vercel.json)
    "frame-src 'self' https://*.clarity.ms",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
  return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
}

/** schema.org: the site, the profile page, and the person it's about (ProfilePage → Person). */
function structuredData({ profile, about, skills, languages, achievements, milestones }, today) {
  const person = `${SITE}/#person`
  const schools = milestones.filter((m) => m.kind === 'education').map((m) => m.org)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: `${SITE}/`,
        name: profile.name,
        inLanguage: 'en',
        publisher: { '@id': person },
      },
      {
        '@type': 'ProfilePage',
        '@id': `${SITE}/#profile`,
        url: `${SITE}/`,
        name: `${profile.name} | ${profile.roles.join(' & ')}`,
        isPartOf: { '@id': `${SITE}/#website` },
        dateModified: today,
        mainEntity: { '@id': person },
      },
      {
        '@type': 'Person',
        '@id': person,
        name: profile.name,
        alternateName: ['Aswin Kumar B S', 'Aswin Kumar BS'],
        url: `${SITE}/`,
        image: profile.avatar,
        email: `mailto:${profile.email}`,
        jobTitle: profile.roles.join(' & '),
        description: about.text.replace(/\s*\{\w+\}\s*/g, ' ').replace(/\s+/g, ' ').trim(),
        address: { '@type': 'PostalAddress', addressLocality: 'Coimbatore', addressRegion: 'Tamil Nadu', addressCountry: 'IN' },
        alumniOf: schools.map((name) => ({ '@type': 'EducationalOrganization', name })),
        knowsAbout: [...new Set([...skills.flatMap((s) => s.tools), ...languages])],
        award: achievements.map((a) => `${a.result}, ${a.event} (${a.org.split(' · ')[0]}, ${a.year})`),
        sameAs: [profile.github, profile.linkedin],
      },
    ],
  }
}

/** A plain-text summary for AI answer engines (the /llms.txt convention). */
function llms({ profile, about, projects, skills, languages, achievements, highlights, milestones, openToWork }) {
  const plain = (s) => s.replace(/\s*\{\w+\}\s*/g, ' ').replace(/\s+/g, ' ').trim()
  const lines = [
    `# ${profile.name}`,
    '',
    `> ${profile.roles.join(' and ')}. ${plain(about.text)}`,
    '',
    `- Website: ${SITE}`,
    `- Email: ${profile.email}`,
    `- GitHub: ${profile.github}`,
    `- LinkedIn: ${profile.linkedin}`,
    `- Resume (PDF): ${SITE}${profile.resume}`,
    '',
    '## Open to work',
    '',
    `${openToWork.pitch} Roles: ${openToWork.roles.join(', ')}. ${openToWork.note}.`,
    '',
    '## Projects',
    '',
    ...projects.map((p) => `- [${p.title}](${p.href}) (${p.year}${p.badge ? `, ${p.badge}` : ''}): ${p.summary}`),
    '',
    '## Achievements',
    '',
    ...achievements.map((a) => `- ${a.result}, ${a.event} (${a.org}, ${a.year}): ${a.detail}`),
    ...highlights.map((h) => `- ${h.title} (${h.kicker})${h.body ? `: ${h.body}` : ''}${h.href ? ` ${h.href}` : ''}`),
    '',
    '## Experience and education',
    '',
    ...milestones.map((m) => `- ${m.title}, ${m.org} (${m.when}): ${m.body}`),
    '',
    '## Skills',
    '',
    ...skills.map((s) => `- ${s.title}: ${s.tools.join(', ')}`),
    `- Languages: ${languages.join(', ')}`,
    '',
  ]
  return lines.join('\n')
}
