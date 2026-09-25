import { cn } from '../lib/cn'

interface Note {
  text: string
  /** Position inside the parent section, e.g. `left-[6%] top-[18%]`. */
  className: string
  /** Parallax speed; negative drifts the other way. */
  speed?: number
  accent?: boolean
}

/**
 * Margin annotations — the reference site scatters chess notation around its
 * grid; here they are small developer notations drifting at their own speeds.
 */
export function Notes({ items }: { items: Note[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
      {items.map((n) => (
        // the text is generated content (see [data-note] in index.css): ornament, not page copy
        <span
          key={n.text}
          data-speed={n.speed ?? 0.3}
          data-note={n.text}
          className={cn(
            'absolute font-mono text-[10.5px] tracking-[0.04em] whitespace-nowrap',
            n.accent ? 'text-ice/60' : 'text-white/[0.22]',
            n.className,
          )}
        />
      ))}
    </div>
  )
}
