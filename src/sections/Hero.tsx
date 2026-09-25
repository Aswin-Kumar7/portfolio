import { useEffect, useRef, useState } from 'react'
import { Mail } from 'lucide-react'
import { Starfield } from '../components/Starfield'
import { ButtonLink, ButtonPair } from '../components/Button'
import { CopyEmail } from '../components/CopyEmail'
import { EASE, MQ, gsap, prefersReducedMotion, useGSAP } from '../lib/gsap'
import { lockScroll } from '../lib/scroll'
import { booted, progress } from '../lib/boot'
import { pinRange } from '../lib/stepper'
import { heroControls, type Framing, type SceneControls } from '../scene/state'
import { presets } from '../webgl/presets'
import { profile } from '../data/resume'

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** "a Full-Stack Developer" → "an AI Engineer": masked vertical glides, width eased between roles. */
function RoleRotator({ roles }: { roles: string[] }) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const mask = ref.current!
      const items = gsap.utils.toArray<HTMLElement>('[data-role]', mask)
      gsap.set(items.slice(1), { yPercent: 135 })
      if (items.length < 2 || prefersReducedMotion()) return

      let i = 0
      const swap = () => {
        const current = items[i]!
        i = (i + 1) % items.length
        const next = items[i]!
        gsap
          .timeline({ defaults: { duration: 1.3, ease: EASE.glide } })
          .fromTo(mask, { width: current.offsetWidth }, { width: next.offsetWidth }, 0)
          .to(current, { yPercent: -135 }, 0)
          .fromTo(next, { yPercent: 135 }, { yPercent: 0 }, 0.08)
      }
      // the lead role (the first) holds the line about twice as long as the others
      const hold = (index: number) => (index === 0 ? 7.5 : 3.8)
      const loop = gsap.delayedCall(hold(0), function cycle() {
        swap()
        loop.delay(hold(i)).restart(true)
      })
      const onResize = () => gsap.set(mask, { width: items[i]!.offsetWidth })
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    },
    { scope: ref },
  )

  const [first] = roles
  return (
    // text-mask: the italic role leans past its advance width, so the clip opens beyond it
    <span ref={ref} className="text-mask relative inline-block align-bottom whitespace-nowrap">
      <span className="sr-only">
        {article(first ?? '')} {first}
      </span>
      <span aria-hidden className="invisible">
        {article(first ?? '')} <em>{first}</em>
      </span>
      {roles.map((role) => (
        <span key={role} aria-hidden data-role className="absolute top-0 left-0 inline-block whitespace-nowrap">
          {article(role)} <em className="text-ice">{role}</em>
        </span>
      ))}
    </span>
  )
}

/** A CSS stand-in painted instantly; the ray-traced black hole fades in over it. */
function SceneFallback() {
  return (
    <div aria-hidden className="absolute top-[74%] left-1/2 aspect-square w-[min(22vh,30vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black shadow-[0_0_0_2px_rgba(160,210,255,0.5),0_0_60px_12px_rgba(60,130,255,0.45)]" />
  )
}

/**
 * The black hole, lazy-loaded. The hero and the footer each render a host; one shared
 * canvas moves to whichever is on screen. `onFail` fires when WebGL2 isn't available, or the
 * GPU turns out too slow for it (a software renderer).
 */
export function HeroScene({
  framing = 'hero',
  controls = heroControls,
  onReady,
  onFail,
}: {
  framing?: Framing
  controls?: SceneControls
  onReady?: () => void
  onFail?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let detach: (() => void) | undefined
    let cancelled = false
    import('../scene/blackhole')
      .then(({ attachBlackHole }) => {
        if (cancelled || !ref.current) return
        detach = attachBlackHole(ref.current, {
          framing,
          controls,
          onReady: () => {
            setReady(true)
            onReady?.()
          },
          onFail: () => {
            setReady(false)
            onFail?.()
          },
        })
      })
      .catch((err) => {
        console.warn('[hero] 3D scene unavailable', err)
        onFail?.()
      })
    return () => {
      cancelled = true
      detach?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing, controls])

  return (
    <>
      <div className="absolute inset-0 transition-opacity duration-[1600ms]" style={{ opacity: ready ? 0 : 1 }}>
        <SceneFallback />
      </div>
      <div ref={ref} aria-hidden className="absolute inset-0 transition-opacity duration-[1600ms]" style={{ opacity: ready ? 1 : 0 }} />
    </>
  )
}

export function Hero() {
  const root = useRef<HTMLElement>(null)
  // the black hole paints its own universe. Until it's up, or if it can't run (no WebGL2, a
  // software renderer, a GPU too slow for it), the sky's CSS gradient stands in
  const [sceneReady, setSceneReady] = useState(false)
  const [sceneFailed, setSceneFailed] = useState(false)
  useEffect(() => {
    // nothing for the loader to wait on
    if (sceneFailed) progress('scene', 1)
  }, [sceneFailed])

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const nav = document.querySelector('[data-nav-tab]')
      const mm = gsap.matchMedia()

      mm.add(MQ.reduce, () => {
        heroControls.intro.v = 1
        gsap.set(q('[data-hero-mask]'), { clipPath: 'none' })
      })

      // ---- Intro: a letterbox slit opens on the sky ------------------------
      mm.add(MQ.motion, () => {
        lockScroll(true)
        heroControls.intro.v = 0
        // held until the loader hands over: its slit of light becomes this letterbox
        const tl = gsap.timeline({ paused: true, onComplete: () => lockScroll(false) })
        tl.fromTo(q('[data-hero-frame]'), { clipPath: 'inset(48% 0% 48% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 2.6, ease: EASE.cine }, 0)
          .fromTo(q('[data-hero-sky]'), { scale: 1.2 }, { scale: 1, duration: 3.4, ease: 'power3.out' }, 0)
          .fromTo(q('[data-hero-ground]'), { yPercent: 22 }, { yPercent: 0, duration: 3, ease: 'power3.out' }, 0.35)
          .fromTo(heroControls.intro, { v: 0 }, { v: 1, duration: 3.6, ease: 'power2.out' }, 0.45)
          .fromTo(
            q('[data-hero-line]'),
            { yPercent: 135, y: 0, rotate: 2.4 },
            { yPercent: 0, y: 0, rotate: 0, transformOrigin: '0% 100%', duration: 1.9, stagger: 0.17, ease: EASE.rise },
            1.2,
          )
          .fromTo(q('[data-hero-cta]'), { y: 34, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.7 }, 1.8)
          .fromTo(q('[data-hero-meta]'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 1.4, stagger: 0.12 }, 2.15)
        if (nav) tl.fromTo(nav, { yPercent: -140 }, { yPercent: 0, duration: 1.8, ease: EASE.rise }, 1.55)
        // the line masks only matter while the lines rise; afterwards they'd just crop the text shadow
        tl.set(q('[data-hero-mask]'), { clipPath: 'none' })
        tl.call(() => lockScroll(false), [], 1.65)
        // QA: /?skipintro jumps straight to the finished opening
        if (new URLSearchParams(location.search).has('skipintro')) tl.progress(1)
        else void booted.then(() => tl.play())
        return () => lockScroll(false)
      })

      // ---- Scroll: pinned, the scene recedes into a card --------------------
      // the camera dive is scroll-driven: the wheel plays it, the page snaps only once it's done
      mm.add(MQ.desktop, () => {
        const dive = gsap
          .timeline({
            scrollTrigger: { trigger: root.current, start: 'top top', end: '+=70%', pin: true, scrub: 1.2 },
          })
          .to(q('[data-hero-shell]'), { clipPath: 'inset(7% 4.5% 7% 4.5% round 28px)', ease: EASE.glide }, 0)
          .to(q('[data-hero-sky-scroll]'), { scale: 1.1, ease: 'none' }, 0)
          .to(heroControls.scroll, { v: 1, ease: 'none' }, 0)
          .to(q('[data-hero-content]'), { yPercent: -30, autoAlpha: 0, ease: 'power2.in' }, 0)
          .to(q('[data-hero-meta-row]'), { autoAlpha: 0, duration: 0.3, ease: 'none' }, 0)
        return pinRange(dive.scrollTrigger)
      })

      mm.add(MQ.compact, () => {
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 1 } })
          .to(q('[data-hero-content]'), { yPercent: -22, autoAlpha: 0.1, ease: 'none' }, 0)
          .to(q('[data-hero-sky-scroll]'), { scale: 1.08, ease: 'none' }, 0)
          .to(heroControls.scroll, { v: 0.7, ease: 'none' }, 0)
      })

      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="home" ref={root} aria-labelledby="hero-title" className="relative h-[100svh] max-h-[1400px] min-h-[640px]">
      <div data-hero-shell className="absolute inset-0 overflow-hidden" style={{ clipPath: 'inset(0% 0% 0% 0% round 0px)' }}>
        <div data-hero-frame className="absolute inset-0 overflow-hidden bg-ink">
          <div data-hero-sky className="absolute inset-0 origin-[50%_45%]">
            <div data-hero-sky-scroll className="absolute inset-0 origin-[50%_40%]">
              {(!sceneReady || sceneFailed) && <div className="absolute inset-0" style={{ background: presets.hero.fallback }} />}
            </div>
          </div>
          <Starfield maxY={0.62} sparkles={11} />

          <div data-hero-ground className="absolute inset-0">
            <HeroScene onReady={() => setSceneReady(true)} onFail={() => setSceneFailed(true)} />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-b from-transparent to-ink" />
          {/* the black hole grains its own frames; a blended overlay on top would re-composite every frame */}
          {(!sceneReady || sceneFailed) && <div aria-hidden className="grain pointer-events-none absolute inset-0" />}

          <div
            data-hero-content
            className="relative z-10 flex flex-col items-center px-5 pt-[clamp(7.5rem,19vh,15rem)] text-center"
          >
            {/* a soft pool of shade keeps the white type legible over the brightest sky */}
            <div aria-hidden className="scrim pointer-events-none absolute top-[4%] left-1/2 -z-10 h-[125%] w-[min(1250px,120%)] -translate-x-1/2" />
            <h1
              id="hero-title"
              className="text-lift font-serif text-[clamp(2.5rem,1rem+3.6vw,5.4rem)] leading-[1.06] font-normal tracking-[-0.012em] text-[var(--hero-text)]"
            >
              <span data-hero-mask className="text-mask block">
                <span data-hero-line className="block text-balance">
                  Hey There!
                </span>
              </span>
              <span data-hero-mask className="text-mask block">
                <span data-hero-line className="block text-balance">
                  I’m {profile.firstName}, <RoleRotator roles={profile.roles} />
                </span>
              </span>
              <span data-hero-mask className="text-mask block">
                <span data-hero-line className="block text-balance">
                  who ships products end to end
                </span>
              </span>
            </h1>

            <div data-hero-cta className="mt-9 2xl:mt-12">
              <ButtonPair>
                <ButtonLink
                  variant="glow"
                  href={`mailto:${profile.email}?subject=${encodeURIComponent(`Hello ${profile.firstName}, let's work together`)}`}
                  data-track="contact_click"
                  data-track-label="hero"
                >
                  <Mail size={15} strokeWidth={1.8} /> Let’s talk
                </ButtonLink>
                <CopyEmail email={profile.email} />
              </ButtonPair>
            </div>
          </div>

          <div
            data-hero-meta-row
            className="mono-label pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden items-end justify-between px-8 pb-7 text-[10px] text-white/55 md:flex 2xl:px-12"
          >
            <span data-hero-meta>Portfolio ©{new Date().getFullYear()}</span>
            <span data-hero-meta className="flex flex-col items-center gap-3">
              Scroll to explore
              <span className="relative block h-9 w-px overflow-hidden bg-white/15">
                <span className="animate-scroll-cue absolute inset-x-0 top-0 h-1/2 bg-ice" />
              </span>
            </span>
            <span data-hero-meta>Open to work</span>
          </div>
        </div>
      </div>
    </section>
  )
}
