import { useEffect, useState } from 'react'

// Content under a chevron, sliding open and shut instead of appearing and
// vanishing. The same motion SectionHeader gives a whole section (a grid row
// animating 0fr to 1fr), for the rows inside one: a past check-in, a report,
// a trend's chart.
//
// It stays mounted through the closing slide, then unmounts, so a closed row
// costs nothing (a chart is not drawn for every row in a list). Reduced motion
// is honoured by the global rule, which zeroes transitions.
const MS = 260

export default function Reveal({ open, children, id, style }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const [wasOpen, setWasOpen] = useState(open)
  // Opening: mount now (adjusting state during render), expand next frame.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setMounted(true)
    else setShown(false)
  }
  useEffect(() => {
    if (open) {
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(f)
    }
    const t = setTimeout(() => setMounted(false), MS)
    return () => clearTimeout(t)
  }, [open])

  if (!mounted) return null
  return (
    <div id={id} className="reveal" style={{ gridTemplateRows: shown ? '1fr' : '0fr', ...style }}>
      <div className="reveal-inner" style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(-6px)' }}>
        {children}
      </div>
    </div>
  )
}
