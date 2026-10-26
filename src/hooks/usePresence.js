import { useEffect, useState } from 'react'

// Keeps something on screen through its exit animation. `shown` stays true for
// `exitMs` after `open` turns false, with `closing` true for that stretch, so
// a sheet can slide back down instead of vanishing in one frame. The same
// pattern ActionSheet uses: the flip is tracked against the previous `open`
// during render (React's way to follow a prop), and only the unmount after the
// exit is left to an effect.
export function usePresence(open, exitMs = 200) {
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setShown(true); setClosing(false) } else if (shown) setClosing(true)
  }
  useEffect(() => {
    if (!closing) return undefined
    const t = setTimeout(() => { setShown(false); setClosing(false) }, exitMs)
    return () => clearTimeout(t)
  }, [closing, exitMs])
  return { shown, closing }
}
