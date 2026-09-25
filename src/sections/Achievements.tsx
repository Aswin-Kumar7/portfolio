import { useRef } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { Notes } from '../components/Notes'
import { SectionHeader } from '../components/SectionHeader'
import { EASE, MQ, ScrollTrigger, gsap, useGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { achievements, highlights } from '../data/resume'
import type { Achievement, Highlight } from '../data/types'
import { cn } from '../lib/cn'

function AchievementCard({ item }: { item: Achievement }) {
  return (
    <div data-ach className="card flex min-h-[300px] flex-col p-5 sm:p-6 lg:col-span-5 lg:min-h-[clamp(200px,27svh,300px)] short:p-5">
      <span className="mono-label self-start rounded-full bg-accent px-2.5 py-[5px] text-[10px] font-medium text-[var(--on-accent)] shadow-[0_0_18px_-4px_rgb(var(--accent-rgb)/0.8)]">
        “{item.badge}”
      </span>
      <blockquote className="mt-6 font-serif text-[1.18rem] leading-[1.42] text-soft short:mt-4 short:text-[1.08rem] short:leading-[1.36]">
        “{item.lead} <em className="text-muted">{item.rest}”</em>
      </blockquote>
      <div className="mt-auto flex items-center gap-3 pt-8 short:pt-4">
        <span className="relative grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-full font-mono text-[8px] font-medium text-white ring-1 ring-white/15">
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'var(--mono-grad)' }}
          />
          <span className="relative">{item.monogram}</span>
        </span>
        <span>
          <span className="mono-label block text-[10.5px] text-fg">{item.event}</span>
          <span className="mono-label mt-1 block text-[10px] text-muted">{item.meta}</span>
        </span>
      </div>
    </div>
  )
}

function HighlightTile({ item, seed, className }: { item: Highlight; seed: number; className?: string }) {
  const Tag = item.href ? 'a' : 'div'
  return (
    <div data-ach className={cn('lg:col-span-4', className)}>
      <Tag
        {...(item.href ? { href: item.href, target: '_blank', rel: 'noreferrer' } : {})}
        className="group relative flex h-full min-h-[280px] flex-col justify-between overflow-hidden rounded-[8px] p-5 ring-1 ring-white/10 sm:p-6 lg:min-h-[clamp(190px,25svh,280px)] short:p-5"
      >
        <div data-tile-art className="absolute -inset-y-[12%] inset-x-0">
          <Aurora preset={item.preset} seed={seed} />
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
        <span className="mono-label relative self-start rounded-full bg-white/10 px-2.5 py-[5px] text-[10px] text-white ring-1 ring-white/20 backdrop-blur-md">
          {item.kicker}
        </span>
        <div className="relative">
          <p className="text-lift font-serif text-[1.65rem] leading-[1.08] text-balance text-white">{item.title}</p>
          <p className="mono-label mt-3 flex items-center gap-1.5 text-[10px] text-white/75">
            {item.body}
            {item.href && (
              <ArrowUpRight
                size={13}
                className="transition-transform duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            )}
          </p>
        </div>
      </Tag>
    </div>
  )
}

export function Achievements() {
  const root = useRef<HTMLElement>(null)
  const [first, second, third, fourth] = achievements

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const items = q('[data-ach]')
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        // Each card is laid down like a page: rising out of a mask, tilting from 3D to flat.
        gsap.set(items, {
          clipPath: 'inset(100% 0% 0% 0% round 8px)',
          y: 90,
          rotationX: 14,
          transformPerspective: 1400,
          transformOrigin: '50% 100%',
        })
        ScrollTrigger.batch(items, {
          start: 'top 90%',
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              clipPath: 'inset(0% 0% 0% 0% round 8px)',
              y: 0,
              rotationX: 0,
              duration: 2,
              ease: EASE.rise,
              stagger: 0.16,
            }),
        })
        q('[data-tile-art]').forEach((art) =>
          gsap.fromTo(
            art,
            { yPercent: -8 },
            {
              yPercent: 8,
              ease: 'none',
              scrollTrigger: { trigger: art.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          ),
        )
      })
      // desktop: this section is one screen, and a resting point for the section stepper
      mm.add(MQ.desktop, () => sectionStops(root.current!))
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section
      id="achievements"
      ref={root}
      aria-labelledby="achievements-title"
      className="relative border-b border-line px-4 py-24 sm:px-8 md:py-32 lg:flex lg:min-h-[100svh] lg:flex-col lg:justify-center lg:px-12 lg:py-[clamp(2.25rem,5svh,6rem)]"
    >
      <Notes
        items={[
          { text: 'fig. 04 — wins', className: 'left-[4%] top-[6%]', speed: 0.25 },
          { text: '1 of 21 finalists', className: 'right-[5%] top-[12%]', speed: -0.3, accent: true },
        ]}
      />
      <SectionHeader
        id="achievements-title"
        label="Achievements"
        title={
          <>
            Wins & recognition <br />
            earned along the way
          </>
        }
      />
      <div className="mx-auto mt-14 grid w-full max-w-[1020px] gap-3 md:grid-cols-2 lg:mt-[clamp(1.25rem,3.5svh,3.5rem)] lg:grid-cols-14 xl:max-w-[1180px] 3xl:max-w-[1240px]">
        <HighlightTile item={highlights[0]} seed={3} />
        {first && <AchievementCard item={first} />}
        {second && <AchievementCard item={second} />}
        {third && <AchievementCard item={third} />}
        {fourth && <AchievementCard item={fourth} />}
        <HighlightTile item={highlights[1]} seed={5} />
      </div>
    </section>
  )
}
