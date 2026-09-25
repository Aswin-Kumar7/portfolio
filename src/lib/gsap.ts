import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

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

export { gsap, ScrollTrigger, SplitText, useGSAP }
