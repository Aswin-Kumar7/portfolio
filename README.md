# Aswin Kumar B S | Portfolio

**Live:** [aswinkumar.dev](https://aswinkumar.dev)

A resume-first portfolio set in deep space: dark blues, nebula skies, and a ray-traced black hole
in the hero and above the footer.

## Stack

| Layer      | Choice |
| ---------- | ------ |
| Build      | **Vite 8** (Rolldown), single page |
| UI         | **React 19** + **TypeScript** (strict, `noUncheckedIndexedAccess`) |
| Styling    | **Tailwind CSS v4**; theme tokens (`ink`, `accent`, `ice`, …) in `src/styles/index.css` |
| Motion     | **GSAP 3** (ScrollTrigger, SplitText, `useGSAP`) + **Lenis** smooth scroll |
| WebGL      | Plain **WebGL2** (`src/scene/gl.ts`, no three.js): the black hole plus a shared nebula-sky engine, both code-split |
| Fonts      | Self-hosted via Fontsource: Instrument Serif, Geist Mono, Inter, Birthstone (upright Instrument Serif is served from `public/fonts/` and preloaded in `index.html`) |

## Scripts

Node 22.12+ (see `engines` in `package.json`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build + prerender → dist/
npm run ci         # what CI runs: type-check, build, site checks
npm run preview    # serve dist/ on http://localhost:4173
```

QA helper: `?skipintro` skips the loader and the opening sequence.

## Editing content

Everything lives in **`src/data/resume.ts`** (profile, rotating roles, projects, skills,
achievements, journey, "Open to work").

- **Resume PDF:** `public/Aswin-Kumar-BS-Resume.pdf`.
- **Project photos:** `python scripts/project-image.py <original> <name>` writes the sizes and a blur
  copy to `public/assets/projects/` (scrambled, see Security) and prints the entry to add:
  `image: { name, widths, aspect, alt }`. The cover frames the picture in its own shape, so nothing
  is cropped. A project without an image shows its nebula sky (`cover`).
  Originals stay in `design/source-images/` (git-ignored, never published).
- **Logos:** `public/assets/`. Each achievement's `logo` sets its round crop (`bg`, `scale`, and
  `focus`, the artwork's measured centre) because logos arrive with different padding and backgrounds.

## Analytics

**Vercel Web Analytics** (page views, visitors, referrers, countries, devices) runs via
`@vercel/analytics` in `src/lib/analytics.ts`, in production builds only. Setup: Vercel → the
project → **Analytics** → Enable, then redeploy. No env var is needed; the script is served
first-party from `/_vercel/insights`. The events below are also sent as Vercel custom events,
which the dashboard shows on the Pro plan.

**Microsoft Clarity** (heatmaps, session recordings, scroll depth, rage/dead clicks) runs via
`@microsoft/clarity` in `src/lib/analytics.ts`. It starts only in production builds with
`VITE_CLARITY_PROJECT_ID` set, loads once the page is idle, and receives the CTA clicks below as
custom events (`contact_click:hero`, `resume_download:open-to-work`, …).

Setup: create a project at [clarity.microsoft.com](https://clarity.microsoft.com), copy its
Project ID, and add `VITE_CLARITY_PROJECT_ID` in Vercel → Settings → Environment Variables for
**Production** only (see `.env.example`), then redeploy.


| Event | When |
| ----- | ---- |
| `contact_click` / `copy_email` | hero "Let's talk", copy-email button, nav, contact |
| `mail_compose` | which way they chose to write: `gmail`, `outlook` or `app` |
| `resume_download` · `offer_cta` · `project_open` · `projects_view_all` · `contact_link` · `footer_link` | CTA clicks |
| `scroll_depth` | 25 / 50 / 75 / 100 % |
| `engaged_time` | seconds on page, sent when the tab is hidden |

## Loader

Five small dev icons (code, terminal, git, database, cloud) with a light wave running across them,
and a progress bar right beneath, all inline in `index.html`, so it paints before any JavaScript.
Everything that moves is a transform or an opacity, so it keeps moving while the app parses and the
shaders compile. Its counter follows real work (`src/lib/boot.ts`): the app starting, the fonts,
and the black hole compiling, baking its textures and drawing a first frame. It's kept short (at
least 0.8 s on a first visit, 0.3 s after that, 6 s at most); then a slit of light draws across and
the hero's letterbox opens from it. A reload always starts at the top: nav clicks don't write
`#section` into the URL, and any hash is dropped before the page can jump to it.

## The black hole

`src/scene/blackhole.ts` ray-traces each pixel's light through Schwarzschild gravity. The thin,
finely striated accretion disk is Keplerian and Doppler-beamed, and it is lensed over the shadow
along with a dark starfield and a faint galaxy band (kept low so the headline stays readable).
It stays crisp at native resolution:

- The disk texture is filtered anisotropically, and its footprint accounts for lensing.
- The shadow edge and photon ring get extra rays across the ring.
- Distant rays use the analytic deflection instead of marching.
- A vsync-aware scaler only drops resolution when frames actually miss.

It runs in the hero (the camera dollies in on the intro and dives on scroll) and again in the
footer, where the black hole dawns under your name. The two never share the screen, so one canvas
moves between them: the shaders compile once (off the main thread where the browser supports
`KHR_parallel_shader_compile`) and the textures bake once.

`src/webgl/` is the nebula engine for everything else: one shared WebGL context renders every
visible sky (cards, tiles, project covers) into its own canvas. Presets live in
`src/webgl/presets.ts`.

## Motion

Cinematic, slow, editorial, with no springs and no overshoot (eases in `src/lib/gsap.ts`).

| Section      | Choreography |
| ------------ | ------------ |
| Intro        | The loader's disk flattens into a slit; the letterbox opens from it (`clip-path`), headline lines rise from masks, the black hole dawns |
| Hero         | **Scroll-driven**: recedes into a rounded card while the camera dives toward the black hole |
| About        | **Scroll-driven**: words light from ash to white as you scroll; the tools marquee runs along the foot |
| Projects     | **Scroll-driven horizontal gallery** with `clip-path` cover reveals (vertical on phones/tablets) |
| Skills       | Hexagon draws, circles glide out from the avatar — plays on arrival |
| Achievements | Cards rise from a mask, tilting from `rotationX` 14° to flat |
| Journey      | The timeline spine draws down and entries settle in, on arrival |
| Open to work | The invitation panel opens onto the nebula; the openings slide in |
| Contact      | Outlined headline fills word by word, then the contact directory rises |
| Footer       | Columns rise; the black hole dawns and the name climbs in letter by letter |

`prefers-reduced-motion` gets the finished layout: no Lenis, pins, scrubs or intro.

### Section stepper

On mouse / trackpad desktops (`src/lib/stepper.ts`) the page moves between two kinds of places:

- **Stops** — a section's screen. One wheel flick or key press (↑ ↓, PgUp/PgDn, Space, Home/End)
  glides there unhurriedly (~1.5s a screen), and the rest of that flick's momentum is swallowed,
  so a flick is always one step. Arrival animations run in real time, so they're seen in full.
- **Free ranges** — the scroll-driven stories (hero dive, About, the projects gallery). Inside one
  the wheel scrolls normally and drives the animation; the page snaps only at its ends, and
  leaving takes a fresh flick.

Sections register with `sectionStops(el)`, `pinRange(scrollTrigger)` or `addStops(() => [...])`.
Nav links land on a section's first stop, and scrollbar drags pass straight through. Touch devices
scroll natively.

Every section fits one screen from 1280×720 up (a `short:` Tailwind variant compacts layouts on
desktops under 800px tall).

On mouse and trackpad devices the page scrollbar is a themed, draggable rail
(`src/components/ScrollBar.tsx`); touch devices keep their native overlay bars.

## Email links

Every email link stays a plain `mailto:` (it works without JavaScript and crawlers read the
address), but a click opens a small menu (`src/components/MailComposer.tsx`): Gmail, Outlook on the
web, or the device's mail app, with the link's subject and a greeting already filled in.

On a computer, Gmail and Outlook open their compose page in a new tab. On a phone or tablet they
open the app instead: `googlegmail://co` / `ms-outlook://compose` on iOS, and on Android an intent
aimed at the app's package (Chrome falls back to the web compose page if the app isn't installed).
iOS can't tell a page whether an app is installed, so if nothing takes over within 1.5 s it goes to
the web compose page. Cmd/Ctrl-click keeps the browser's default.

## Security

The site is static: no server code, no API, no forms, no cookies of its own. What's in place:

- **Content-Security-Policy**, generated per build by `scripts/prerender.mjs` as a `<meta>` tag:
  only this site's scripts run (the one inline script, the loader, is allowed by its SHA-256
  hash), plus Microsoft Clarity's documented hosts. No `eval`, no inline event handlers, no
  plugins, no `<base>` or form hijacking; mixed content is upgraded.
- **Headers** (`vercel.json`): HSTS (preload), `frame-ancestors 'none'` + `X-Frame-Options: DENY`
  (no clickjacking), `nosniff`, a strict referrer policy, `Cross-Origin-Opener-Policy`, a
  Permissions-Policy that turns off camera, mic, location, payment and the like, and
  `Cross-Origin-Resource-Policy: same-origin` on `/assets` so other sites can't embed the images.
- **Links out** open with `rel="noreferrer"`.
- **Images**: no context menu, drag or long-press on images and canvases. Project photos are
  published scrambled (`.bin`, `scripts/project-image.py`): the network panel shows bytes that
  don't open as images, and the page unscrambles them in memory into a `blob:` address that's
  revoked once drawn. This stops casual saving; nothing a browser displays can be fully protected
  (screenshots, dev tools), so keep anything truly private off the site.
- **Build and deploy**: no source maps in production; `npm audit` of production dependencies,
  and third-party GitHub Actions pinned to commit SHAs, the Vercel CLI to a version, the token passed
  through the environment. `npm run check:site` fails the build if the CSP stops covering the
  inline script, an inline handler appears, a new-tab link lacks `rel="noreferrer"`, a source map
  ships, or an image in `/assets` is over 150 kB.
- Recommended in the Vercel dashboard: **Deployment Protection** for preview URLs (so only you
  can open them).

## Performance

- **Measure the production build**, not the dev server: `npm run build && npm run preview`
  (http://localhost:4173), or the live site in PageSpeed Insights. The dev server serves
  unminified modules and React's debug build (about 24 MB), so it scores around 30 by design.
- **Deferred setup.** Every section builds ScrollTriggers, splits and pins when it mounts, and
  each trigger measures the page as it's created. Sections below the fold use `useLazyGSAP`
  (`src/lib/gsap.ts`), which runs each setup as its own task after the first render, in page
  order, then refreshes once. The loader waits for it, so the intro never shares frames with it.
- Lighthouse on the production build: desktop 99, mobile about 78 (simulated slow phone),
  CLS 0, SEO 100, best practices 100.

## Responsive

Fluid from 360px phones to 2560px monitors: full-bleed hero and footer, rails that scale with the
viewport (`--gutter`), `clamp()` type with larger maxima for big screens, container queries for
the skills diagram, and a hanging-tab nav that becomes a menu on mobile.

## SEO

- **Prerendered HTML.** `npm run build` ends with `scripts/prerender.mjs`, which renders `<App />` to
  static HTML inside `dist/index.html`. Google renders JavaScript, but Bing only partly and AI
  crawlers (ChatGPT, Claude, Perplexity) not at all; they now read the full page. In the browser the
  copy is kept out of rendering (`data-prerendered` → `content-visibility: hidden`) and the app
  replaces it, so it costs no layout and causes no shift.
- **Structured data**, generated from `src/data/resume.ts` at build time: `WebSite`, `ProfilePage`
  and `Person` (name and variants, roles, location, schools, skills, awards, `sameAs` → GitHub and
  LinkedIn).
- **Head**: title, description, canonical, `robots` (large image previews), `rel="me"` profile
  links, Open Graph `profile` + `summary_large_image` card with `public/og-image.jpg` (1200×630).
- **Crawl files**: `robots.txt` welcomes search and AI answer crawlers by name; the build writes
  `sitemap.xml` (dated each build) and `llms.txt` (a plain-text summary) from the resume data;
  `public/<key>.txt` is the IndexNow key, pinged after each production deploy.

One-time setup (accounts, so only you can do these):

1. **Google Search Console** → add a **Domain** property for `aswinkumar.dev`, verify with the DNS
   TXT record at name.com, then submit `https://aswinkumar.dev/sitemap.xml`.
2. **Bing Webmaster Tools** → import the site from Search Console (Bing feeds Copilot and is a source
   for ChatGPT search). Its AI Performance report shows when AI answers cite the site.
3. **Point your profiles here**, with the same name, "Aswin Kumar B S", everywhere: GitHub profile
   website + README, LinkedIn (contact info and Featured), Devpost and hackathon pages, and any
   posts you write about your projects. Links back from these are what search engines weigh most.

## CI/CD

`.github/workflows/ci.yml` gates production:

- **Checks** (every push and pull request): type-check, build with the prerender,
  `npm run check:site` (title, description, canonical, share image, structured data, prerendered
  content, one `<h1>`, crawl files, a JavaScript size budget), `npm audit` of production
  dependencies, and Lighthouse (`lighthouserc.json`: SEO ≥ 0.95, accessibility and best practices ≥
  0.9 fail the run; performance under 0.7 only warns, since CI runners have no GPU).
- **Deploy** (pushes to `main`, only after the checks pass): builds and deploys to Vercel production
  with the Vercel CLI, then notifies IndexNow. `vercel.json` turns off Vercel's own Git deploys for
  `main`, so nothing reaches production without passing. Other branches still get preview URLs.

Run the same checks locally with `npm run ci`.

Setup: run `npx vercel link` once (it writes `.vercel/project.json` with the org and project IDs),
create a token at vercel.com/account/tokens, then add three GitHub repository secrets:
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Until they exist the deploy job fails and
production stays on its last good version.

## Deploy (Vercel + aswinkumar.dev)

Static site on Vercel: framework **Vite**, build `npm run build`, output `dist` (pinned in
`vercel.json`, which also sets long-lived caching for hashed assets and basic security headers).
Production deploys come from the CI workflow after its checks pass (see CI/CD); other branches get
preview URLs.

Domain (registered at name.com, DNS stays there):

1. Vercel → Project → Settings → Domains → add `aswinkumar.dev` and `www.aswinkumar.dev`
   (set `www` to redirect to the apex).
2. At name.com → DNS records, add the records Vercel shows for each domain — typically an
   **A** record for `@` and a **CNAME** for `www`. Use the exact values from the Vercel dashboard.
3. Wait for Vercel to show both as **Valid**; it issues the HTTPS certificate automatically
   (`.dev` is HTTPS-only, which Vercel handles).

Canonical and Open Graph URLs point at `https://aswinkumar.dev/` (see SEO).
