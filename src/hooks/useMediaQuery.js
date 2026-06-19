import { useEffect, useState } from 'react'

// Subscribe to a CSS media query and re-render when it flips. SSR-safe: starts
// false when `window` is unavailable. Shared by the nav (mobile vs desktop
// chrome) and the app shell (login-as-home on phones).
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
