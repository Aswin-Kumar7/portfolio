import { useRef } from 'react'
import { ArrowRightToLine } from 'lucide-react'
import { siTypescript } from 'simple-icons'
import { ButtonLink, ButtonPair, IconLink } from '../components/Button'
import { Notes } from '../components/Notes'
import { ScriptLabel } from '../components/SplitHeading'
import { MQ, gsap, useGSAP } from '../lib/gsap'
import { pinStops } from '../lib/stepper'
import { Toolbelt } from './Toolbelt'
import { about, profile } from '../data/resume'

function Chip({ kind }: { kind: 'code' | 'avatar' }) {
  const base =
    'mx-[0.12em] inline-block size-[1.08em] -translate-y-[0.08em] overflow-hidden rounded-[0.26em] align-middle shadow-[0_6px_18px_-6px_rgba(0,0,0,0.8)] ring-1 ring-white/15'
  const rot = kind === 'avatar' ? -4 : 4
  if (kind === 'avatar') {
    return <img data-token="chip" data-rot={rot} src={profile.avatar} alt="" className={`${base} object-cover`} />
  }
  return (
    <span data-token="chip" data-rot={rot} className={`${base} bg-white p-[0.14em]`}>
      <svg viewBox="0 0 24 24" className="size-full" aria-hidden>
        <path d={siTypescript.path} fill={`#${siTypescript.hex}`} />
      </svg>
    </span>
  )
}

export function About() {
  const root = useRef<HTMLElement>(null)
  const parts = about.text.split(/\s+/)

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const tokens = q('[data-token]')
      const css = getComputedStyle(document.documentElement)
      const DIM = css.getPropertyValue('--dim-word').trim()
      const INK = css.getPropertyValue('--color-fg').trim()
      const mm = gsap.matchMedia()

      const build = (pinned: boolean) => {
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: pinned
            ? { trigger: root.current, start: 'top top', end: '+=160%', pin: true, scrub: 1.2 }
            : { trigger: q('[data-about-text]')[0], start: 'top 82%', end: 'bottom 45%', scrub: 1 },
        })
        tokens.forEach((el, i) => {
          const at = i * 0.3
          if (el.dataset.token === 'chip') {
            tl.fromTo(
              el,
              { autoAlpha: 0, rotate: -22, yPercent: 40 },
              { autoAlpha: 1, rotate: Number(el.dataset.rot ?? 0), yPercent: 0, duration: 1.6, ease: 'power2.out' },
              at,
            )
          } else {
            tl.fromTo(el, { color: DIM }, { color: INK, duration: 1 }, at)
          }
        })
        tl.fromTo(q('[data-about-cta]'), { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 2, ease: 'power2.out' })
        if (pinned) tl.to({}, { duration: 2.5 }) // hold the finished paragraph a moment before releasing
        return tl
      }

      // two resting points: the paragraph waiting in ash, then lit
      mm.add(MQ.desktop, () => pinStops(build(true).scrollTrigger))
      mm.add(MQ.compact, () => build(false))
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section
      id="about"
      ref={root}
      aria-labelledby="about-title"
      className="relative flex min-h-[100svh] flex-col border-b border-line"
    >
      <Notes
        items={[
          { text: 'fig. 01 — about', className: 'left-[5%] top-[14%]', speed: 0.2 },
          { text: '// ship it, then make it better', className: 'right-[6%] top-[22%]', speed: -0.35 },
          { text: '200 OK', className: 'left-[9%] bottom-[20%]', speed: 0.45, accent: true },
          { text: 'O(log n)', className: 'right-[12%] bottom-[14%]', speed: 0.25 },
        ]}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-24 sm:px-8 md:py-[clamp(4.5rem,10svh,8rem)]">
        <div className="text-center">
          <h2 id="about-title" className="sr-only">
            About me
          </h2>
          <ScriptLabel className="inline-block">About me</ScriptLabel>
        </div>
        <p
          data-about-text
          className="mx-auto mt-4 max-w-[23em] text-center font-serif text-[clamp(1.6rem,1rem+2vw,3.1rem)] leading-[1.28] tracking-[-0.01em] text-balance text-fg"
        >
          {parts.map((word, i) => {
            const sep = i < parts.length - 1 ? ' ' : ''
            if (word === '{code}')
              return (
                <span key={i}>
                  <Chip kind="code" />
                  {sep}
                </span>
              )
            if (word === '{avatar}')
              return (
                <span key={i}>
                  <Chip kind="avatar" />
                  {sep}
                </span>
              )
            return (
              <span key={i}>
                <span data-token="word">{word}</span>
                {sep}
              </span>
            )
          })}
        </p>
        <div data-about-cta className="mt-10 flex justify-center">
          <ButtonPair>
            <ButtonLink href="#journey">More about my journey</ButtonLink>
            <IconLink href="#journey" label="Jump to my journey">
              <ArrowRightToLine size={16} strokeWidth={1.8} />
            </IconLink>
          </ButtonPair>
        </div>
      </div>

      <Toolbelt />
    </section>
  )
}
