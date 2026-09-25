import type { AuroraEngine } from './engine'
import { booted } from '../lib/boot'

let pending: Promise<AuroraEngine | null> | null = null

/**
 * The sky engine is code-split and starts once the loader has handed over: every surface
 * that uses it sits below the fold, so it never competes with the black hole's start-up.
 * Until then each surface shows its CSS gradient; the WebGL sky fades in over it.
 */
export function loadAurora(): Promise<AuroraEngine | null> {
  pending ??= booted
    .then(() => import('./engine'))
    .then((m) => m.getEngine())
    .catch(() => null)
  return pending
}
