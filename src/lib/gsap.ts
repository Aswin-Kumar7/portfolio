import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import type { RefObject } from 'react'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

/*
 * Motion language: cinematic, slow, editorial.
 * Long durations, no overshoot, no springs. Everything either eases out of
 * darkness (power4/expo) or glides (power3.inOut / sine.inOut).
 */
gsap.defaults({ ease: 'power3.out', duration: 1.4 })
ScrollTrigger.config({ ignoreMobileResize: true })

export const EASE = {
  /** Curtains, clip-path wipes, camera moves. */
  cine: 'expo.inOut',
  /** Text rising out of a mask. */
  rise: 'power4.out',
  /** Gentle glides between states. */
  glide: 'power3.inOut',
} as const

/** Matches used with gsap.matchMedia(). */
export const MQ = {
  motion: '(prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
  desktop: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
  compact: '(max-width: 1023.98px) and (prefers-reduced-motion: no-preference)',
} as const

export const prefersReducedMotion = () => window.matchMedia(MQ.reduce).matches

// ---- deferred setup ------------------------------------------------------------------------
// Every section builds its ScrollTriggers, splits and pins on mount, and each trigger measures the
// page as it's created. Done inside React's first commit that is one long task that freezes the
// page. Sections below the fold set up one per task instead, in page order, right after it.

type Setup = () => void | (() => void)
const queue: (() => void)[] = []
let flushing: Promise<void> | null = null

const yieldToMain = () =>
  new Promise<void>((resolve) => {
    const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
    if (scheduler?.yield) void scheduler.yield().then(resolve)
    else setTimeout(resolve, 0)
  })

async function flush() {
  await yieldToMain() // everything the first commit queued is in by now
  while (queue.length) {
    queue.shift()!()
    await yieldToMain()
  }
  ScrollTrigger.refresh() // one pass over the finished page, pins included
  flushing = null
}

/** Resolves once every deferred setup has run (the loader waits for this). */
export const setupsDone = () => flushing ?? Promise.resolve()

/** `useGSAP` for below-the-fold sections: the setup runs as its own task after the first render. */
export function useLazyGSAP(setup: Setup, config?: { scope?: RefObject<Element | null> }) {
  useGSAP((context) => {
    let live = true
    queue.push(() => {
      if (live) context.add(setup)
    })
    flushing ??= flush()
    return () => {
      live = false
    }
  }, config)
}

export { gsap, ScrollTrigger, SplitText, useGSAP }
