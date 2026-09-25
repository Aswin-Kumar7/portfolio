import { BrandIcon, brandTitle } from '../components/BrandIcon'
import { SplitHeading } from '../components/SplitHeading'
import { toolbelt } from '../data/resume'

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-12 pr-12 md:gap-16 md:pr-16">
      {toolbelt.map((slug) => (
        <li
          key={slug}
          className="flex items-center gap-2.5 whitespace-nowrap text-[var(--tool-gray)] transition-colors duration-300 hover:text-fg"
        >
          <BrandIcon slug={slug} className="size-[21px]" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">{brandTitle(slug)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The tools marquee — the band along the bottom of the About screen. */
export function Toolbelt() {
  return (
    <div aria-label="Tools I build with" role="region" className="w-full border-t border-line">
      <SplitHeading as="p" className="px-6 pt-6 pb-4 text-center font-serif text-[1.02rem] text-soft md:text-[1.1rem] 3xl:pt-8 3xl:pb-6">
        A few of the tools I love building and shipping with
      </SplitHeading>
      <div className="mask-fade-x group relative overflow-hidden border-t border-line py-5 3xl:py-7">
        <div className="flex w-max animate-marquee [--marquee-duration:46s] group-hover:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none motion-reduce:justify-center">
          <Row />
          <div className="motion-reduce:hidden">
            <Row hidden />
          </div>
        </div>
      </div>
    </div>
  )
}
