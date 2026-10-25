import { createContext, useContext, useEffect, useRef } from 'react'

// The tab bar's pages are KEPT ALIVE (see KeptTabs in App.jsx): once visited
// they stay mounted and are hidden, not torn down, while another tab is up.
// That is what makes a tab switch instant, the way a native tab bar is --
// before, every switch rebuilt the page and refetched it from nothing, so
// every visit waited on the network.
//
// A kept page's data would go stale while it sat hidden, so it is told when
// it comes back: useTabReturn(cb) runs cb each time the page returns to view
// (never on its first mount, when its own load is already running). cb should
// refresh SILENTLY -- no placeholders -- because what the reader sees on
// return is the page they left, which is the point.
//
// Outside KeptTabs the context defaults to "active", so a page rendered
// normally (a test, or a route that is not kept) behaves as it always did.
export const TabActiveContext = createContext(true)

export function useTabReturn(cb) {
  const active = useContext(TabActiveContext)
  const wasActive = useRef(active)
  const latest = useRef(cb)
  useEffect(() => { latest.current = cb })
  useEffect(() => {
    if (active && !wasActive.current) latest.current()
    wasActive.current = active
  }, [active])
}
