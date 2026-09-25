import { useRef } from 'react'
import { ArrowUpRight, Award, Medal, Trophy } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { BrandIcon } from '../components/BrandIcon'
import { LogoMark } from '../components/LogoMark'
import { Notes } from '../components/Notes'
import { SectionHeader } from '../components/SectionHeader'
import { EASE, MQ, ScrollTrigger, gsap, useLazyGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { achievements, highlights } from '../data/resume'
import type { Achievement, Highlight } from '../data/types'
import { cn } from '../lib/cn'

const rankIcon = { first: Trophy, second: Medal, finalist: Award }

/** Split the detail sentence so the project's name can be emphasised inside it. */
function Detail({ text, project }: { text: string; project: string }) {
  const at = text.indexOf(project)
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold text-fg">{project}</strong>
      {text.slice(at + project.length)}
    </>
  )
}

function AchievementCard({ item }: { item: Achievement }) {
  const Icon = rankIcon[item.rank]
  return (
    <article data-ach className="card flex min-h-[260px] flex-col p-6 lg:col-span-5 lg:min-h-[clamp(200px,27svh,280px)] short:p-5">
      <div className="flex items-center gap-3.5">
        <LogoMark logo={item.logo} monogram={item.monogram} />
        <div className="min-w-0">
          <p className="text-[13.5px] leading-snug font-medium text-fg">{item.org}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">{item.year}</p>
        </div>
      </div>
      <p className="mt-5 flex items-center gap-2 text-[13px] font-semibold tracking-[0.02em] text-ice short:mt-4">
        <Icon size={15} strokeWidth={2} aria-hidden />
        {item.result}
      </p>
      <h3 className="mt-1.5 font-serif text-[1.45rem] leading-[1.15] text-fg short:text-[1.3rem]">{item.event}</h3>
      <p className="mt-3 text-[14.5px] leading-[1.6] text-soft short:mt-2 short:text-[13.5px] short:leading-[1.5]">
        <Detail text={item.detail} project={item.project} />
      </p>
    </article>
  )
}

function HighlightTile({ item, seed, className }: { item: Highlight; seed: number; className?: string }) {
  const Tag = item.href ? 'a' : 'div'
  return (
    <div data-ach className={cn('lg:col-span-4', className)}>
      <Tag
        {...(item.href ? { href: item.href, target: '_blank', rel: 'noreferrer' } : {})}
        className="group relative flex h-full min-h-[260px] flex-col justify-between overflow-hidden rounded-[8px] p-6 ring-1 ring-white/10 lg:min-h-[clamp(190px,25svh,280px)] short:p-5"
      >
        <div data-tile-art className="absolute -inset-y-[12%] inset-x-0">
          <Aurora preset={item.preset} seed={seed} />
        </div>
        {/* a deep shade under the type: the sky stays visible, the words stay readable */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/80" />
        <div className="relative flex items-center gap-3">
          {item.logo && <LogoMark logo={item.logo} monogram="" className="size-11" />}
          <span className="text-[13px] leading-snug font-medium text-balance text-white">{item.kicker}</span>
        </div>
        <div className="relative">
          <p className="text-lift font-serif text-[1.6rem] leading-[1.1] text-balance text-white short:text-[1.4rem]">{item.title}</p>
          {item.body && <p className="mt-2.5 text-[13.5px] leading-snug text-white/85">{item.body}</p>}
          {item.cta && (
            // reads as what it is: a link out to the post
            <span className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-black/60 py-1.5 pr-3 pl-2 text-[13px] font-medium whitespace-nowrap lg:gap-1.5 lg:text-[12.5px] xl:gap-2 xl:text-[13px] text-white ring-1 ring-white/20 transition-colors duration-500 group-hover:bg-black/75">
              {item.cta.brand && (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-black text-white ring-1 ring-white/25">
                  <BrandIcon slug={item.cta.brand} className="size-3" />
                </span>
              )}
              {item.cta.label}
              <ArrowUpRight size={14} className="shrink-0 transition-transform duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          )}
        </div>
      </Tag>
    </div>
  )
}

export function Achievements() {
  const root = useRef<HTMLElement>(null)
  const [first, second, third, fourth] = achievements

  useLazyGSAP(
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
      className="relative border-b border-line px-4 py-24 sm:px-8 md:py-32 lg:flex lg:min-h-[100svh] lg:flex-col lg:justify-center lg:px-12 lg:pt-[max(4.5rem,6svh)] lg:pb-[clamp(1.5rem,5svh,6rem)]"
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
        // two lines ("Wins & recognition / earned along the way"); one on short screens
        titleClassName="mx-auto max-w-[8em] short:max-w-none"
        className="tight:[zoom:0.9] tighter:[zoom:0.82]"
        title="Wins & recognition earned along the way"
      />
      <div className="mx-auto mt-14 grid w-full max-w-[1020px] gap-3 md:grid-cols-2 lg:mt-[clamp(1.25rem,3.5svh,3.5rem)] lg:grid-cols-14 xl:max-w-[1180px] 3xl:max-w-[1240px] tight:[zoom:0.9] tighter:[zoom:0.82]">
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
