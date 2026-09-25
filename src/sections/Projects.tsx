import { useRef } from 'react'
import { ArrowRightToLine, ArrowUpRight } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { ButtonLink, ButtonPair, IconLink } from '../components/Button'
import { ScriptLabel, SplitHeading } from '../components/SplitHeading'
import { MQ, gsap, useGSAP } from '../lib/gsap'
import { addStops } from '../lib/stepper'
import { profile, projects } from '../data/resume'
import type { Project } from '../data/types'

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const backdrop = useRef<HTMLCanvasElement>(null)
  const label = `${project.title} [${project.year}]`

  return (
    <article data-card className="w-full max-w-[880px] shrink-0 lg:w-[min(73.5vh,960px)] lg:max-w-none">
      <a
        href={project.href}
        target="_blank"
        rel="noreferrer"
        className="group block rounded-[8px]"
        aria-label={`${project.title} — ${project.hrefLabel}`}
        data-track="project_open"
        data-track-label={project.slug}
      >
        <div
          data-cover
          className="relative aspect-[1.45] overflow-hidden rounded-[8px] bg-panel ring-1 ring-white/[0.06] sm:aspect-[1.75]"
          style={{ clipPath: 'inset(0% 0% 0% 0% round 8px)' }}
        >
          <div data-cover-art className="absolute inset-0">
            {/* Blurred copy of the cover, painted by the WebGL engine every frame. */}
            <canvas
              ref={backdrop}
              aria-hidden
              className="absolute inset-0 h-full w-full scale-[1.3] object-cover blur-[18px] brightness-[0.85] saturate-[1.15] transition-transform duration-[1.6s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.36]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/5 to-black/25" />
            <div className="absolute top-1/2 left-1/2 h-[62%] w-[74%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[5px] shadow-[0_30px_70px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/15 transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] sm:h-[64%] sm:w-[53%]">
              <Aurora preset={project.cover} seed={index + 1} mirror={backdrop} />
              <div className="absolute inset-0 grid place-items-center px-4 text-center">
                <span className="font-serif text-[clamp(1.05rem,0.8rem+1vw,1.45rem)] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.55)]">
                  {label}
                </span>
              </div>
            </div>
          </div>

          {project.badge && (
            <span className="mono-label absolute top-3 left-3 rounded-full bg-black/30 px-3 py-1.5 text-[10px] text-white/90 ring-1 ring-white/15 backdrop-blur-md sm:top-4 sm:left-4">
              {project.badge}
            </span>
          )}
          <span className="mono-label absolute right-4 bottom-3 text-[10px] text-white/60 sm:bottom-4">
            {String(index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
          </span>
        </div>

        <div data-info className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <h3 className="font-serif text-[1.4rem] leading-none text-fg">{label}</h3>
          <p className="mono-label text-[10.5px] text-soft">[ {project.tags.join(' , ')} ]</p>
        </div>
        <p data-info className="mt-3 max-w-[64ch] text-[14px] leading-[1.65] text-muted">
          {project.summary}
        </p>
        <span
          data-info
          className="mono-label mt-3 inline-flex items-center gap-1.5 text-[10.5px] text-ice transition-colors duration-500 group-hover:text-white"
        >
          {project.hrefLabel}
          <ArrowUpRight size={13} className="transition-transform duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </a>
    </article>
  )
}

export function Projects() {
  const root = useRef<HTMLElement>(null)
  const repos = `${profile.github}?tab=repositories`

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const cards = q('[data-card]')
      const mm = gsap.matchMedia()

      const revealCover = (card: Element, trigger: ScrollTrigger.Vars) => {
        const cover = card.querySelector('[data-cover]')
        const art = card.querySelector('[data-cover-art]')
        const info = card.querySelectorAll('[data-info]')
        gsap
          .timeline({ defaults: { ease: 'none' }, scrollTrigger: { ...trigger, scrub: 1 } })
          .fromTo(cover, { clipPath: 'inset(16% 12% 16% 12% round 18px)' }, { clipPath: 'inset(0% 0% 0% 0% round 8px)' }, 0)
          .fromTo(art, { scale: 1.3, rotate: 1.6 }, { scale: 1, rotate: 0 }, 0)
          .fromTo(info, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, stagger: 0.12 }, 0.25)
      }

      // Desktop: the stage pins and the track travels sideways.
      mm.add(MQ.desktop, () => {
        const stage = q('[data-stage]')[0]!
        const track = q('[data-track]')[0]!
        const counter = q('[data-counter]')[0]
        const bar = q('[data-bar]')[0]
        const distance = () => Math.max(0, track.scrollWidth - stage.clientWidth)

        const travel = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1.2,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (bar) gsap.set(bar, { scaleX: self.progress })
              if (counter) counter.textContent = String(Math.min(cards.length, Math.floor(self.progress * cards.length) + 1)).padStart(2, '0')
            },
          },
        })

        cards.forEach((card, i) => {
          if (i === 0) revealCover(card, { trigger: root.current!, start: 'top 75%', end: 'top 5%' })
          else revealCover(card, { trigger: card, containerAnimation: travel, start: 'left 100%', end: 'left 42%' })
        })

        // one stop per project: each gesture brings the next card to where the first one sits
        return addStops(() => {
          const st = travel.scrollTrigger
          if (!st) return []
          const d = distance()
          const lead = (cards[0] as HTMLElement).offsetLeft
          return [st.start, ...cards.map((c) => st.start + Math.min(d, (c as HTMLElement).offsetLeft - lead)), st.end]
        })
      })

      // Phones & tablets: a vertical stack, each cover opening as it arrives.
      mm.add(MQ.compact, () => {
        cards.forEach((card) => revealCover(card, { trigger: card, start: 'top 92%', end: 'top 40%' }))
      })

      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="projects" ref={root} aria-labelledby="projects-title" className="relative border-b border-line">
      <div data-stage className="flex flex-col overflow-hidden py-24 md:py-32 lg:h-[100svh] lg:max-h-[1400px] lg:justify-center lg:py-0">
        <div className="flex flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12">
          <div>
            <ScriptLabel>Selected projects</ScriptLabel>
            <SplitHeading id="projects-title" className="heading mt-2 max-w-[11.5em]">
              Work that speaks louder than any words
            </SplitHeading>
          </div>
          <div className="flex items-end gap-8">
            <p className="mono-label hidden text-[10.5px] text-muted lg:block">
              <span data-counter className="text-fg">
                01
              </span>{' '}
              / {String(projects.length).padStart(2, '0')}
            </p>
            <ButtonPair>
              <ButtonLink href={repos} data-track="projects_view_all" data-track-label="header">
                View all projects
              </ButtonLink>
              <IconLink href={repos} label="All repositories on GitHub">
                <ArrowRightToLine size={16} strokeWidth={1.8} />
              </IconLink>
            </ButtonPair>
          </div>
        </div>

        <div
          data-track
          className="mt-14 flex flex-col items-center gap-16 px-5 sm:px-8 md:mt-16 lg:mt-10 lg:w-max lg:flex-row lg:items-start lg:gap-[4.5vw] lg:pr-[12vw] lg:pl-12"
        >
          {projects.map((p, i) => (
            <ProjectCard key={p.slug} project={p} index={i} />
          ))}
          <a
            href={repos}
            target="_blank"
            rel="noreferrer"
            className="group hidden aspect-[0.9] shrink-0 flex-col justify-between rounded-[8px] border border-white/10 p-7 transition-colors duration-700 hover:border-accent/50 lg:flex lg:h-[min(42vh,548px)]"
          >
            <span className="mono-label text-[10.5px] text-muted">And more on GitHub</span>
            <span className="font-serif text-[2.6rem] leading-[1.02] text-fg">
              Every repo,
              <br />
              <em className="text-ice">every experiment.</em>
            </span>
            <ArrowUpRight
              size={28}
              strokeWidth={1.2}
              className="text-ice transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
            />
          </a>
        </div>

        <div className="mx-12 mt-10 hidden h-px bg-white/[0.08] lg:block">
          <div data-bar className="h-full origin-left scale-x-0 bg-gradient-to-r from-accent to-ice" />
        </div>
      </div>
    </section>
  )
}
