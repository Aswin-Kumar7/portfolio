export interface AuroraPreset {
  colors: {
    zenith: string
    zenith2: string
    sky: string
    haze: string
    shade: string
    lit: string
    hi: string
    base: string
    sun: string
  }
  /** Vanishing point / horizon in scene uv (0,0 = bottom-left). */
  vanish: [number, number]
  stretch: number
  angle: number
  scale: number
  coverage: number
  softness: number
  opacity: number
  speed: number
  puff: number
  warp: number
  /** 0..1 — confine clouds to a luminous band above the horizon. */
  band: number
  /** Bottom fade to `base`, as [from, to] in uv.y. */
  fade: [number, number]
  /** Top fade to `base`, as [from, to] in uv.y. */
  fadeTop: [number, number]
  stars: number
  /** x, y, intensity */
  sun: [number, number, number]
  vignette: number
  /** Luminous haze at the vanishing point. */
  glow: number
  /** Bends streaks into arcs around the vanishing point. */
  curve: number
  /** Pushes the band just above the horizon toward the `lit` colour. */
  pink: number
  /** How much the clouds thin out toward the zenith (with `band`). */
  topDim: number
  /** Render resolution relative to CSS pixels (before DPR). */
  renderScale: number
  fps: number
  /** CSS stand-in shown before WebGL paints (or when it is unavailable). */
  fallback: string
}

/** Deep-space palette: every sky on the site is a nebula lit in these blues. */
const nebula: AuroraPreset['colors'] = {
  zenith: '#030a22',
  zenith2: '#08163a',
  sky: '#0c2459',
  haze: '#0a1b44',
  shade: '#123a86',
  lit: '#2c7bff',
  hi: '#9adcff',
  base: '#02040b',
  sun: '#1a4cc0',
}

/** The long-exposure streak look (hero and footer). */
const streaks = {
  curve: 0.5,
  angle: -0.08,
  scale: 2.6,
  stretch: 6,
  warp: 0.7,
  coverage: 0.5,
  softness: 0.16,
  band: 0.8,
  topDim: 0.75,
  pink: 0.45,
  glow: 0.3,
  speed: 0.018,
} satisfies Partial<AuroraPreset>

/** Cards and tiles read as soft nebula clouds rather than streaks. */
const NEBULA = { puff: 0.7, stars: 1.2, coverage: 0.54, softness: 0.24, band: 0, speed: 0.012 } satisfies Partial<AuroraPreset>

/** Project covers: a nebula core instead of a horizon. */
const COVER = {
  ...NEBULA,
  fade: [0, 0],
  sun: [0.55, 0.5, 0.55],
  stars: 1.4,
} satisfies Partial<AuroraPreset>

const base: Omit<AuroraPreset, 'colors' | 'fallback'> = {
  vanish: [0.5, 0.3],
  stretch: 5,
  angle: 0,
  scale: 0.55,
  coverage: 0.5,
  softness: 0.22,
  opacity: 0.95,
  speed: 0.02,
  puff: 0,
  warp: 0.9,
  band: 1,
  fade: [0, 0],
  fadeTop: [2, 3],
  stars: 0,
  sun: [0.5, 0.3, 0],
  vignette: 0.25,
  glow: 0,
  curve: 0,
  pink: 0,
  topDim: 0.45,
  renderScale: 1,
  fps: 30,
}

const define = (p: Partial<AuroraPreset> & Pick<AuroraPreset, 'colors' | 'fallback'>): AuroraPreset => ({
  ...base,
  ...p,
})

export const presets = {
  hero: define({
    ...streaks,
    colors: nebula,
    vanish: [0.5, 0.5],
    coverage: 0.55,
    opacity: 0.8,
    pink: 0.3,
    glow: 0.22,
    fade: [0.02, 0.4],
    vignette: 0.45,
    renderScale: 0.62,
    fps: 60,
    fallback:
      'radial-gradient(80% 40% at 50% 55%, #1d4fb8 0%, #0c2459 40%, transparent 75%), linear-gradient(180deg, #030a22 0%, #08163a 40%, #0a1b44 62%, #02040b 92%)',
  }),

  /** "Featured" offer card: sky at the top, dissolving into the card. */
  card: define({
    ...streaks,
    ...NEBULA,
    colors: { ...nebula, base: '#070c17' },
    vanish: [0.62, 0.62],
    curve: 0.8,
    scale: 2.2,
    pink: 0.35,
    fade: [0.3, 0.92],
    vignette: 0.15,
    renderScale: 0.9,
    fps: 30,
    fallback: 'linear-gradient(180deg, #123a86 0%, #0c2459 35%, #0a1b44 60%, #070c17 90%)',
  }),

  /** Timeline highlight card: puffy clouds with stars. */
  clouds: define({
    colors: { ...nebula, zenith: '#0a1a4a', zenith2: '#16357f', sky: '#123070', haze: '#2b64c9', shade: '#1b3b8c', lit: '#3a86ff', hi: '#bde6ff', base: '#070c17' },
    vanish: [0.5, 0.0],
    scale: 1.2,
    stretch: 1.6,
    puff: 0.85,
    coverage: 0.52,
    softness: 0.2,
    band: 0,
    speed: 0.05,
    stars: 1.2,
    vignette: 0.1,
    renderScale: 0.9,
    fallback: 'linear-gradient(100deg, #0a1a4a 0%, #16357f 45%, #2b64c9 80%, #3a86ff 100%)',
  }),

  /** Achievement tiles. */
  tileViolet: define({
    ...streaks,
    ...NEBULA,
    colors: { ...nebula, zenith: '#061437', zenith2: '#0d2358', sky: '#153d8e', haze: '#1f5fc2', lit: '#3c8cff', hi: '#aee0ff' },
    vanish: [0.35, 0.3],
    curve: 0.35,
    angle: 0.12,
    scale: 2.2,
    fade: [-0.3, 0.1],
    vignette: 0.15,
    renderScale: 0.9,
    fps: 30,
    fallback: 'linear-gradient(160deg, #061437 0%, #153d8e 45%, #1f5fc2 80%, #0d2358 100%)',
  }),

  tileRose: define({
    ...streaks,
    ...NEBULA,
    colors: { ...nebula, zenith: '#0b0f3d', zenith2: '#1a1f6b', sky: '#2a3b9c', haze: '#3f7fe0', lit: '#5ec8ff', hi: '#d8f3ff' },
    vanish: [0.65, 0.32],
    curve: 0.35,
    angle: -0.12,
    scale: 2.2,
    pink: 0.6,
    fade: [-0.3, 0.1],
    vignette: 0.15,
    renderScale: 0.9,
    fps: 30,
    fallback: 'linear-gradient(200deg, #0b0f3d 0%, #2a3b9c 45%, #3f7fe0 80%, #1a1f6b 100%)',
  }),

  // ---- project covers: nebula cores in different blues ---------------------
  coverSunset: define({
    ...COVER,
    colors: { zenith: '#0a1e4f', zenith2: '#12306e', sky: '#2f63c8', haze: '#7cc6ff', shade: '#2b58b0', lit: '#6fb4ff', hi: '#dff3ff', base: '#040a1a', sun: '#bfeaff' },
    vanish: [0.5, 0.45],
    stretch: 3,
    scale: 0.7,
    vignette: 0.3,
    fallback: 'linear-gradient(180deg, #0a1e4f 0%, #2f63c8 35%, #7cc6ff 48%, #2f55c4 52%, #040a1a 100%)',
  }),
  coverDusk: define({
    ...COVER,
    colors: { zenith: '#1a2f6e', zenith2: '#2b4a94', sky: '#6f97dc', haze: '#b9dcff', shade: '#5f84cc', lit: '#a9cfff', hi: '#f0f8ff', base: '#08112a', sun: '#e6f6ff' },
    vanish: [0.42, 0.4],
    stretch: 2.4,
    scale: 0.8,
    vignette: 0.3,
    fallback: 'linear-gradient(180deg, #1a2f6e 0%, #6f97dc 38%, #b9dcff 48%, #4a6fd0 55%, #08112a 100%)',
  }),
  coverTwilight: define({
    ...COVER,
    colors: { zenith: '#050b2c', zenith2: '#0e1a55', sky: '#1d3a94', haze: '#3b7ee8', shade: '#1a3589', lit: '#3f86ff', hi: '#a8d8ff', base: '#030616', sun: '#5aa8ff' },
    vanish: [0.6, 0.42],
    stretch: 4,
    scale: 0.6,
    vignette: 0.35,
    fallback: 'linear-gradient(180deg, #050b2c 0%, #1d3a94 35%, #3b7ee8 48%, #1c3a9a 55%, #030616 100%)',
  }),
  coverEmber: define({
    ...COVER,
    colors: { zenith: '#04142e', zenith2: '#08284f', sky: '#0f4d8f', haze: '#26b7ff', shade: '#0f4388', lit: '#2fa8ff', hi: '#b8f0ff', base: '#020a14', sun: '#5fe0ff' },
    vanish: [0.55, 0.42],
    stretch: 3.5,
    scale: 0.65,
    vignette: 0.4,
    fallback: 'linear-gradient(180deg, #04142e 0%, #0f4d8f 35%, #26b7ff 47%, #1a4f9a 55%, #020a14 100%)',
  }),
  coverDawn: define({
    ...COVER,
    colors: { zenith: '#243e7c', zenith2: '#3a5ea8', sky: '#8fb2e6', haze: '#e0efff', shade: '#7a9ad6', lit: '#c9e2ff', hi: '#ffffff', base: '#0d1733', sun: '#f4fbff' },
    vanish: [0.3, 0.44],
    stretch: 2.8,
    scale: 0.75,
    vignette: 0.25,
    fallback: 'linear-gradient(180deg, #243e7c 0%, #8fb2e6 38%, #e0efff 48%, #5b7fd6 55%, #0d1733 100%)',
  }),
  coverNight: define({
    ...COVER,
    colors: { zenith: '#01030f', zenith2: '#050b26', sky: '#0b1a4a', haze: '#1b3f99', shade: '#0e2468', lit: '#2458d6', hi: '#8ab8ff', base: '#010208', sun: '#3a74e0' },
    vanish: [0.5, 0.4],
    stretch: 5,
    scale: 0.5,
    vignette: 0.35,
    fallback: 'linear-gradient(180deg, #01030f 0%, #0b1a4a 38%, #1b3f99 48%, #122f7a 55%, #010208 100%)',
  }),

  /** Footer horizon glow. */
  footer: define({
    ...streaks,
    colors: nebula,
    vanish: [0.5, 0.12],
    curve: -0.35,
    band: 0,
    fadeTop: [0.45, 1.0],
    stars: 0.7,
    vignette: 0.3,
    renderScale: 0.7,
    fallback: 'linear-gradient(0deg, #1d4fb8 0%, #0c2459 35%, #030a22 70%, #02040b 100%)',
  }),
} satisfies Record<string, AuroraPreset>

export type AuroraPresetName = keyof typeof presets
