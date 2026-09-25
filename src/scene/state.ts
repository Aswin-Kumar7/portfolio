/** Where a scene is framed: the hero, or the smaller horizon above the footer wordmark. */
export type Framing = 'hero' | 'footer'

/**
 * Shared between GSAP timelines (which tween these values) and the lazily
 * loaded 3D scene (which reads them every frame).
 *  intro.v  — 0 → 1 while the opening sequence plays
 *  scroll.v — 0 → 1 across the pinned hero
 */
export interface SceneControls {
  intro: { v: number }
  scroll: { v: number }
}

export const heroControls: SceneControls = {
  intro: { v: 0 },
  scroll: { v: 0 },
}
