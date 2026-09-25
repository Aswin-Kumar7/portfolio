import type { AuroraEngine } from './engine'

let pending: Promise<AuroraEngine | null> | null = null

/** three.js is code-split: the CSS fallback paints first, WebGL fades in once loaded. */
export function loadAurora(): Promise<AuroraEngine | null> {
  pending ??= import('./engine').then((m) => m.getEngine()).catch(() => null)
  return pending
}
