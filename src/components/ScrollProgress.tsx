import { useRef } from 'react'
import { ScrollTrigger, gsap, useGSAP } from '../lib/gsap'

const sections = [
  { id: 'home', label: 'Intro' },
  { id: 'about', label: 'About' },
  { id: 'projects', label: 'Work' },
  { id: 'skills', label: 'Skills' },
  { id: 'achievements', label: 'Wins' },
  { id: 'journey', label: 'Journey' },
  { id: 'open-to-work', label: 'Hire' },
  { id: 'contact', label: 'Contact' },
]

/** A thin editorial rail on the right edge: overall progress + current chapter. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const fill = ref.current!.querySelector('[data-fill]')
      const index = ref.current!.querySelector('[data-index]')!
      const label = ref.current!.querySelector('[data-label]')!

      gsap.fromTo(
        fill,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          // Created before the pinned sections, so refresh after them to include pin spacing.
          scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.8, refreshPriority: -1 },
        },
      )

      const show = (i: number) => {
        const s = sections[i]
        if (!s) return
        gsap
          .timeline()
          .to([index, label], { yPercent: -100, autoAlpha: 0, duration: 0.45, ease: 'power2.in' })
          .call(() => {
            index.textContent = String(i + 1).padStart(2, '0')
            label.textContent = s.label
          })
          .fromTo([index, label], { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out' })
      }

      sections.forEach((s, i) => {
        const el = document.getElementById(s.id)
        if (!el) return
        ScrollTrigger.create({
          trigger: el,
          start: 'top 50%',
          // the last chapter stays active through the footer
          end: i === sections.length - 1 ? 'max' : 'bottom 50%',
          refreshPriority: -1,
          onToggle: (self) => self.isActive && show(i),
        })
      })
    },
    { scope: ref },
  )

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-1/2 right-8 z-40 hidden -translate-y-1/2 flex-col items-center gap-3 lg:flex"
    >
      <span className="overflow-hidden font-mono text-[10px] text-ice">
        <span data-index className="block">
          01
        </span>
      </span>
      <span className="relative h-28 w-px bg-white/10">
        <span data-fill className="absolute inset-0 origin-top bg-gradient-to-b from-ice to-accent" />
      </span>
      <span className="overflow-hidden font-mono text-[9.5px] tracking-[0.12em] text-muted uppercase [writing-mode:vertical-rl]">
        <span data-label className="block">
          Intro
        </span>
      </span>
    </div>
  )
}
