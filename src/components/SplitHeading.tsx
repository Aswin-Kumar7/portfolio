import { useRef, type ElementType, type ReactNode } from 'react'
import { EASE, MQ, SplitText, gsap, useLazyGSAP } from '../lib/gsap'

interface SplitHeadingProps {
  as?: ElementType
  id?: string
  className?: string
  children: ReactNode
  delay?: number
  /** ScrollTrigger start. Pass `false` to play immediately (hero). */
  start?: string | false
}

/**
 * Editorial line reveal: every line rises out of its own mask with a slight
 * rotation that settles to zero. Plays once, slowly, when the heading arrives.
 */
export function SplitHeading({ as: Tag = 'h2', id, className, children, delay = 0, start = 'top 86%' }: SplitHeadingProps) {
  const ref = useRef<HTMLElement>(null)

  useLazyGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          // a line split leaves words whole, so the text reads fine as is; only headings may carry the label
          aria: Tag === 'p' ? 'none' : 'auto',
          linesClass: 'split-line',
          autoSplit: true,
          onSplit(self) {
            return gsap.from(self.lines, {
              y: 0,
              // clears the widened mask window (see .split-line-mask)
              yPercent: 135,
              rotate: 2.2,
              transformOrigin: '0% 100%',
              duration: 1.7,
              stagger: 0.14,
              ease: EASE.rise,
              delay,
              scrollTrigger: start ? { trigger: el, start, once: true } : undefined,
            })
          },
        })
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <Tag ref={ref} id={id} className={className}>
      {children}
    </Tag>
  )
}

/**
 * The script labels ("About me", "Projects") are wiped in like ink. The script's
 * swashes overhang the box, so the wipe runs from -15% to 115% (the start window is empty,
 * no sliver peeks out) and the clip is dropped once it's done.
 */
export function ScriptLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useLazyGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        gsap.fromTo(
          ref.current,
          { clipPath: 'inset(-40% 115% -40% -15%)' },
          {
            clipPath: 'inset(-40% -15% -40% -15%)',
            duration: 2,
            ease: EASE.cine,
            clearProps: 'clipPath',
            scrollTrigger: { trigger: ref.current, start: 'top 88%', once: true },
          },
        )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )
  return (
    <p ref={ref} className={`label-script ${className}`}>
      {children}
    </p>
  )
}
