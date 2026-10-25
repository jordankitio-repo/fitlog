// Home screen Quick Actions (press and hold the app icon). The iOS shell
// declares them (Info.plist UIApplicationShortcutItems) and hands the chosen
// type to this page (ios/App/App/SceneDelegate.swift); this file turns a type
// into a route the app already has. Each route carries `?action=` for the
// page to act on once: Log opens the add-food search, the scanner or the
// weight form, on TODAY; Coach focuses the message box.

export const QUICK_ACTION_EVENT = 'gardnr:quick-action'
const PREFIX = 'fit.gardnr.app.'

const ROUTES = {
  'log-food': '/log?action=add-food',
  'log-weight': '/log?action=log-weight',
  'scan-barcode': '/log?action=scan',
  'message-coach': '/coach?action=compose',
}

// The route for a shortcut type, or null for one this build does not know
// (an old shortcut left on the home screen after an update, say).
export function quickActionRoute(type) {
  if (typeof type !== 'string' || !type.startsWith(PREFIX)) return null
  return ROUTES[type.slice(PREFIX.length)] ?? null
}

// The shortcut that LAUNCHED the app, injected before the page loaded, at
// most once per launch: a reload of the web view runs the injected script
// again, so the id it carries is remembered and not acted on twice.
const SEEN_KEY = 'gardnr:quick-action-seen'
export function takeLaunchQuickAction(win = window, store = safeSession(win)) {
  const launch = win.__gardnrQuickAction
  if (!launch || typeof launch !== 'object') return null
  win.__gardnrQuickAction = null
  if (store && store.getItem(SEEN_KEY) === launch.id) return null
  store?.setItem(SEEN_KEY, launch.id)
  return launch.type
}

function safeSession(win) {
  try { return win.sessionStorage } catch { return null }
}

// Scroll a field into view and give it the cursor, once it can be done.
// A shortcut that brings the app back from the background is handled while
// the page is still HIDDEN, and WebKit holds rendering until it is shown, so
// the field a quick action just opened does not exist yet. A fixed delay
// guessed at that and lost. This waits for the page to be visible, then for
// the field to be in the document (up to ~2s), then acts.
export function revealWhenReady(getEl, block = 'center', doc = document) {
  let tries = 0
  const attempt = () => {
    const el = getEl()
    if (el && el.isConnected) {
      el.scrollIntoView({ block })
      el.focus({ preventScroll: true })
    } else if (tries++ < 20) {
      setTimeout(attempt, 100)
    }
  }
  if (doc.visibilityState === 'visible') { setTimeout(attempt, 50); return }
  const onVisible = () => {
    if (doc.visibilityState !== 'visible') return
    doc.removeEventListener('visibilitychange', onVisible)
    setTimeout(attempt, 50)
  }
  doc.addEventListener('visibilitychange', onVisible)
}
