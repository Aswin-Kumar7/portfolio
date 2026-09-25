import { useEffect, useRef } from 'react'
import { gsap } from '../lib/gsap'
import { followTo, scrollToTarget, setDragging } from '../lib/scroll'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * The page scrollbar on mouse/trackpad devices (the native one is hidden in CSS): a slim
 * themed pill on a hairline track. It rests quietly, brightens while the page moves or under
 * the pointer, and drags / clicks like the real thing. Wheel and keyboard scrolling are
 * untouched; touch devices keep their own overlay scrollbars.
 */
export function ScrollBar() {
  const rail = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    const railEl = rail.current!
    const trackEl = track.current!
    const thumbEl = thumb.current!

    let docH = 0
    let viewH = 0
    let trackH = 0
    let thumbH = 0
    let y = -1
    const measure = () => {
      docH = document.documentElement.scrollHeight
      viewH = window.innerHeight
      trackH = trackEl.clientHeight
      thumbH = Math.max(44, Math.round((trackH * viewH) / docH))
      thumbEl.style.height = `${thumbH}px`
      railEl.style.visibility = docH > viewH + 1 ? '' : 'hidden'
      y = -1
    }

    // light up while the page moves, settle back shortly after it stops
    let idle = 0
    const wake = () => {
      railEl.setAttribute('data-active', '')
      window.clearTimeout(idle)
      idle = window.setTimeout(() => railEl.removeAttribute('data-active'), 1100)
    }

    // follows Lenis on the same ticker, so the thumb and the page move in the same frame
    const update = () => {
      const max = docH - viewH
      const next = Math.round(clamp01(max > 0 ? window.scrollY / max : 0) * (trackH - thumbH) * 10) / 10
      if (next === y) return
      if (y !== -1) wake()
      y = next
      thumbEl.style.transform = `translate3d(0, ${y}px, 0)`
    }

    let dragFrom = 0
    let scrollFrom = 0
    let pointer = -1
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      const top = trackEl.getBoundingClientRect().top
      const onThumb = e.clientY >= top + y && e.clientY <= top + y + thumbH
      if (!onThumb) {
        // a click on the track glides there, centring the thumb under the pointer
        const p = clamp01((e.clientY - top - thumbH / 2) / (trackH - thumbH))
        scrollToTarget(p * (docH - viewH), 1.2)
        return
      }
      pointer = e.pointerId
      railEl.setPointerCapture(pointer)
      railEl.setAttribute('data-drag', '')
      setDragging(true)
      dragFrom = e.clientY
      scrollFrom = window.scrollY
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return
      const ratio = (docH - viewH) / Math.max(1, trackH - thumbH)
      followTo(Math.min(docH - viewH, Math.max(0, scrollFrom + (e.clientY - dragFrom) * ratio)))
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return
      if (railEl.hasPointerCapture(pointer)) railEl.releasePointerCapture(pointer)
      pointer = -1
      railEl.removeAttribute('data-drag')
      setDragging(false)
      wake()
    }

    measure()
    update()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    ro.observe(trackEl)
    window.addEventListener('resize', measure)
    gsap.ticker.add(update)
    railEl.addEventListener('pointerdown', onDown)
    railEl.addEventListener('pointermove', onMove)
    railEl.addEventListener('pointerup', onUp)
    railEl.addEventListener('pointercancel', onUp)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      gsap.ticker.remove(update)
      window.clearTimeout(idle)
      if (pointer !== -1) setDragging(false)
      railEl.removeEventListener('pointerdown', onDown)
      railEl.removeEventListener('pointermove', onMove)
      railEl.removeEventListener('pointerup', onUp)
      railEl.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div
      ref={rail}
      aria-hidden
      className="group fixed inset-y-0 right-0 z-[54] hidden w-4 touch-none select-none [@media(pointer:fine)]:block"
    >
      <div ref={track} className="absolute inset-y-3 right-0 left-0">
        {/* hairline track: only there when you reach for it */}
        <div className="absolute inset-y-0 right-[6.5px] w-px rounded-full bg-[rgb(var(--ice-rgb)/0.1)] opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-data-[drag]:opacity-100" />
        <div
          ref={thumb}
          className="absolute top-0 right-[5px] w-1 rounded-full opacity-40 shadow-[0_0_10px_rgb(var(--accent-rgb)/0.45)] transition-[opacity,width,right,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:right-[4px] group-hover:w-1.5 group-hover:opacity-100 group-hover:shadow-[0_0_16px_rgb(var(--accent-rgb)/0.7)] group-data-[active]:opacity-100 group-data-[drag]:right-[4px] group-data-[drag]:w-1.5 group-data-[drag]:opacity-100 motion-reduce:transition-none"
          style={{ background: 'var(--glow-grad)' }}
        >
          {/* a glassy highlight down the pill */}
          <span className="absolute inset-y-1 left-[1px] w-px rounded-full bg-gradient-to-b from-white/70 via-white/25 to-transparent" />
        </div>
      </div>
    </div>
  )
}
