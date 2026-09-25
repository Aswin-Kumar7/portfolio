# Aswin Kumar B S — Portfolio

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
| WebGL      | **three.js**: the black hole plus a shared nebula-sky engine, lazy-loaded after first paint |
| Fonts      | Self-hosted via Fontsource: Instrument Serif, Geist Mono, Inter, Birthstone |

## Scripts

Node 22.12+ (see `engines` in `package.json`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve dist/ on http://localhost:4173
```

QA helper: `?skipintro` jumps past the opening sequence.

## Editing content

Everything lives in **`src/data/resume.ts`** (profile, rotating roles, projects, skills,
achievements, journey, "Open to work").

- **Resume PDF:** `public/Aswin-Kumar-BS-Resume.pdf`.
- **Hero portrait (optional):** a background-removed photo at `public/portrait.webp`, then set
  `portrait: '/portrait.webp'` in `profile`. It replaces the 3D scene in the hero.

## Analytics

`src/lib/analytics.ts` forwards events to whatever analytics snippet is on the page: Google Tag
Manager (`dataLayer`), GA4 (`gtag`), Umami or Plausible. Add the snippet to `index.html`.

| Event | When |
| ----- | ---- |
| `contact_click` / `copy_email` | hero "Let's talk", copy-email button, nav, contact |
| `resume_download` · `offer_cta` · `project_open` · `projects_view_all` · `contact_link` · `footer_link` | CTA clicks |
| `scroll_depth` | 25 / 50 / 75 / 100 % |
| `engaged_time` | seconds on page, sent when the tab is hidden |

## The black hole

`src/three/blackhole.ts` ray-traces each pixel's light through Schwarzschild gravity. The thin,
finely striated accretion disk is Keplerian and Doppler-beamed, and it is lensed over the shadow
along with a dark starfield and a faint galaxy band (kept low so the headline stays readable).
It stays crisp at native resolution:

- The disk texture is filtered anisotropically, and its footprint accounts for lensing.
- The shadow edge and photon ring get extra rays across the ring.
- Distant rays use the analytic deflection instead of marching.
- A vsync-aware scaler only drops resolution when frames actually miss.

It runs in the hero (the camera dollies in on the intro and dives on scroll) and again in the
footer, where the black hole dawns under your name.

`src/webgl/` is the nebula engine for everything else: one shared WebGL context renders every
visible sky (cards, tiles, project covers) into its own canvas. Presets live in
`src/webgl/presets.ts`.

## Motion

Cinematic, slow, editorial, with no springs and no overshoot (eases in `src/lib/gsap.ts`).

| Section      | Choreography |
| ------------ | ------------ |
| Intro        | Letterbox slit opens (`clip-path`), sky settles, headline lines rise from masks, the black hole dawns |
| Hero         | **Pinned**: recedes into a rounded card while the camera dives toward the black hole |
| About        | **Pinned**: words fill from ash to white; the tools marquee runs along the foot of the screen |
| Projects     | **Pinned horizontal gallery** with `clip-path` cover reveals (vertical on phones/tablets) |
| Skills       | **Pinned**: title and diagram share one screen; hexagon draws, circles glide out from the avatar |
| Achievements | Cards rise from a mask, tilting from `rotationX` 14° to flat |
| Journey      | **Pinned**: title left, timeline right; card, orb, ring and text move in one timeline |
| Open to work | The invitation panel opens like a window onto the nebula; the openings slide in |
| Contact      | Outlined headline fills word by word |
| Footer       | Columns rise; the black hole dawns and the name climbs in letter by letter |

`prefers-reduced-motion` gets the finished layout: no Lenis, pins, scrubs or intro.

### Section stepper

On mouse / trackpad desktops (`src/lib/stepper.ts`) the page rests on **stops**: every section is
one screen with its title, and a few pinned sections add moments inside them (About's paragraph
lit, each project card, each Journey milestone). One wheel flick or key press (↑ ↓, PgUp/PgDn,
Space, Home/End) glides to the next stop, and the rest of that flick's momentum is swallowed, so
it's always exactly one step. Sections register their own stops with `sectionStops(el)`,
`pinStops(scrollTrigger)` or `addStops(() => [...])`. Nav links land on a section's first stop,
and scrollbar drags pass straight through. Touch devices scroll natively.

Every section fits one screen from 1280×720 up (a `short:` Tailwind variant compacts layouts on
desktops under 800px tall).

On mouse and trackpad devices the page scrollbar is a themed, draggable rail
(`src/components/ScrollBar.tsx`); touch devices keep their native overlay bars.

## Responsive

Fluid from 360px phones to 2560px monitors: full-bleed hero and footer, rails that scale with the
viewport (`--gutter`), `clamp()` type with larger maxima for big screens, container queries for
the skills diagram, and a hanging-tab nav that becomes a menu on mobile.

## Deploy (Vercel + aswinkumar.dev)

Static site on Vercel: framework **Vite**, build `npm run build`, output `dist` (pinned in
`vercel.json`, which also sets long-lived caching for hashed assets and basic security headers).
Every push to `main` deploys to production; other branches get preview URLs.

Domain (registered at name.com, DNS stays there):

1. Vercel → Project → Settings → Domains → add `aswinkumar.dev` and `www.aswinkumar.dev`
   (set `www` to redirect to the apex).
2. At name.com → DNS records, add the records Vercel shows for each domain — typically an
   **A** record for `@` and a **CNAME** for `www`. Use the exact values from the Vercel dashboard.
3. Wait for Vercel to show both as **Valid**; it issues the HTTPS certificate automatically
   (`.dev` is HTTPS-only, which Vercel handles).

SEO: canonical and Open Graph URLs point at `https://aswinkumar.dev/`; `public/robots.txt` and
`public/sitemap.xml` are served from the root.
