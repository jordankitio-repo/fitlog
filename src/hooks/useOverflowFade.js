import { useEffect, useRef, useState } from 'react'

// A horizontal strip that can be scrolled, and that SAYS it can be scrolled.
//
// The app has three of these now — the roster's lenses, the Trends switcher
// and the check-in cadence — and all three had the same hole: they scroll, but
// nothing indicates it. A chip clipped at the container edge is the only cue,
// and at a width where the last chip happens to end flush there is no cue at
// all. The content just stops.
//
// Returns a ref and a className. The class is driven by actual measurement, so
// the fade appears only when there is something past the edge and disappears
// once you reach it — a permanent fade would dim the last chip of a strip that
// fits, which is worse than no fade.
//
// The fade is a `mask-image`, not a painted gradient. A painted one has to know
// the exact colour behind it, and this strip sits on three different surfaces
// in three different themes; the one time this codebase reached for a gradient
// over content it drew a visible band because it guessed the backdrop wrong. A
// mask takes the element's own pixels away and needs to know nothing.
export function useOverflowFade() {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      const start = el.scrollLeft > 2
      const end = max > 2 && el.scrollLeft < max - 2
      setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }))
    }

    // Deferred to a frame: measuring synchronously here would setState inside
    // the effect body, which is the cascading-render pattern the lint rule
    // exists to catch.
    const id = requestAnimationFrame(measure)
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(id)
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])

  const className = `scroll-strip${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''}`
  return [ref, className]
}
