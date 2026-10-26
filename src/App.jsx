import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { supabase } from './supabase'
import { useSessionPolicy } from './hooks/useSessionPolicy'
import Landing from './pages/Landing'
import NavBar from './components/NavBar'
import LoadingScreen from './components/LoadingScreen'
import { useMediaQuery } from './hooks/useMediaQuery'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import CoachPaywall from './components/CoachPaywall'
import CoachOnWeb from './components/CoachOnWeb'
import { isNativeApp, isCoachOnNative } from './utils/platform'
import { syncAppleHealth } from './utils/healthSync'
import { resolveLockState } from './utils/lockState'
import { TabActiveContext } from './hooks/useTabReturn'
import { QUICK_ACTION_EVENT, quickActionRoute, takeLaunchQuickAction } from './utils/quickActions'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Log = lazy(() => import('./pages/Log'))
const Profile = lazy(() => import('./pages/Profile'))
const Login = lazy(() => import('./pages/Login'))
const CoachDashboard = lazy(() => import('./pages/CoachDashboard'))
const Join = lazy(() => import('./pages/Join'))
const ClientView = lazy(() => import('./pages/ClientView'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const RolePicker = lazy(() => import('./pages/RolePicker'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const BillingSuccess = lazy(() => import('./pages/BillingSuccess'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const ConsumerHealthData = lazy(() => import('./pages/ConsumerHealthData'))
// Reading a coach report is its own page, not a section that expands inside the
// dashboard — see pages/Reports.jsx.
const Coach = lazy(() => import('./pages/Coach'))
const CheckinQueue = lazy(() => import('./pages/CheckinQueue'))

// Coach paywall is OFF for now — coaches use the app free while we're
// pre-public. Flip back to `true` to re-enable the paywall + trial gating when
// it's time to go public and charge. (Subscriptions are still fetched/shown;
// they just no longer gate access to the dashboard.)
export const BILLING_ENABLED = false
// Solo is free: the paid Solo tier is retired so all self-serve analytics are
// free (Solo is the funnel, coaches are the business). Flipping this back to
// true re-enables solo billing and the upgrade prompts. `hasSoloPremium`
// becomes always-true while this is false (see below).
//
// ⚠️ This flag has a TWIN on the server: SOLO_BILLING_ENABLED in the
// nutrition-coach edge function's env. They must agree. They didn't, once: this
// side said Solo was free and showed every solo user the "Get AI feedback"
// button, while the server still demanded a paid subscription and 403'd them all
// with "Solo Premium required". If you flip this to true, set the function's env
// var to 'true' in the same breath — otherwise the paywall here is cosmetic and
// the server keeps serving for free.
export const SOLO_BILLING_ENABLED = false
const PUBLIC_ROUTES = ['/billing/success', '/terms', '/privacy', '/health-data-privacy']
// The tab bar's data pages, kept mounted once visited (see KeptTabs below).
const KEPT_TABS = ['/', '/log', '/coach']
// The home screen Quick Action that launched the app, if any, taken ONCE when
// this module loads (the iOS shell injects it before the page starts). Not in
// render, where a double render could take it and drop it.
const LAUNCH_QUICK_ACTION = takeLaunchQuickAction()

// Where should a client land when they open the app? They get dropped straight
// onto the Log page so they can log right away — unless their progress view is
// locked, in which case they land on the Dashboard, where the "paused" notice
// lives. Mirrors Dashboard's own lock check (resolveLockState). Any failure
// falls back to the Dashboard (the safe, full view).
async function resolveClientLanding() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return 'dashboard'
    const { data: connection } = await supabase
      .from('coach_clients')
      .select('created_at, lock_cleared_at')
      .eq('client_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!connection) return 'log' // no active coach — the lock never applies
    const { data: lastLog } = await supabase
      .from('nutrition_log')
      .select('logged_date')
      .eq('user_id', session.user.id)
      .order('logged_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lock = resolveLockState({
      lastNutritionDate: lastLog?.logged_date || null,
      connectionCreatedAt: connection.created_at.split('T')[0],
      lockClearedAt: connection.lock_cleared_at || null,
    })
    return lock.locked ? 'dashboard' : 'log'
  } catch {
    return 'dashboard'
  }
}

// Home (`/`) for the tracked roles — solo + client. On the first entry of a
// session it decides Log vs Dashboard (see resolveClientLanding: solo/no-coach
// and un-locked clients → Log; a locked client → Dashboard where the paused
// notice lives) and, once decided, renders the Dashboard normally — so the
// Dashboard tab keeps working for the rest of the session. The decision is
// per-launch (sessionStorage), so reopening the PWA lands them back on Log.
function HomeLanding({ profile, hasSoloPremium }) {
  const LANDED_KEY = 'gardnr:home-landed'
  const [decision, setDecision] = useState(() =>
    sessionStorage.getItem(LANDED_KEY) ? 'dashboard' : 'pending'
  )

  const navigate = useNavigate()
  useEffect(() => {
    if (decision !== 'pending') return
    let active = true
    resolveClientLanding().then((target) => {
      if (!active) return
      sessionStorage.setItem(LANDED_KEY, '1')
      // Redirect as an ACTION, then settle on the dashboard. This page is
      // kept alive (KeptTabs), so rendering <Navigate> here would leave My
      // Progress a blank <Navigate> the next time its tab was opened.
      if (target === 'log') navigate('/log', { replace: true })
      setDecision('dashboard')
    })
    return () => { active = false }
  }, [decision, navigate])

  if (decision === 'pending') return <LoadingScreen />
  return <Dashboard profile={profile} hasSoloPremium={hasSoloPremium} />
}

function AppRoutes({ session, profile, subscription, soloSubscription, hasSoloPremium, onProfileUpdate }) {
  const location = useLocation()
  const path = location.pathname

  // Home screen Quick Actions (iOS). One that launched the app is waiting on
  // window from before the page loaded; it is held until there is a session
  // to act in (a signed-out launch goes to sign-in first, then on). One that
  // arrives while the app is open comes as an event.
  const navigate = useNavigate()
  const pendingQuickAction = useRef(LAUNCH_QUICK_ACTION)
  useEffect(() => {
    if (!session) return
    const go = (type) => { const to = quickActionRoute(type); if (to) navigate(to) }
    if (pendingQuickAction.current) { go(pendingQuickAction.current); pendingQuickAction.current = null }
    const onAction = (e) => go(e.detail)
    window.addEventListener(QUICK_ACTION_EVENT, onAction)
    return () => window.removeEventListener(QUICK_ACTION_EVENT, onAction)
  }, [session, navigate])

  // KEPT TABS. The tab bar's data pages stay mounted once visited and are
  // hidden, not unmounted, while another tab is up -- the way a native tab bar
  // keeps its view controllers. A switch back is then instant, with its scroll
  // position and anything half-typed intact, and the page refreshes itself
  // quietly (useTabReturn). Before, every switch rebuilt the page and waited on
  // the network again. Profile is not kept: it is addressed by section in the
  // URL and loads near-instantly. Kept per signed-in user, so signing out or
  // in as someone else starts clean.
  const userId = session?.user?.id || null
  const [kept, setKept] = useState({ userId: null, paths: [] })
  const keptPaths = kept.userId === userId ? kept.paths : []
  const keepThis = Boolean(userId) && KEPT_TABS.includes(path)
  if (kept.userId !== userId || (keepThis && !keptPaths.includes(path))) {
    setKept({ userId, paths: keepThis && !keptPaths.includes(path) ? [...keptPaths, path] : keptPaths })
  }
  const keptElement = (p) => {
    if (p === '/') {
      return profile?.role === 'coach'
        ? <CoachDashboard profile={profile} />
        : <HomeLanding profile={profile} hasSoloPremium={hasSoloPremium} />
    }
    if (p === '/log') return <Log session={session} profile={profile} hasSoloPremium={hasSoloPremium} />
    return <Coach profile={profile} />
  }

  // The kept tabs share one scroller (the body, or #root in the native shell),
  // so each tab's scroll position is remembered and put back when it returns;
  // otherwise coming back to the Log would land wherever My Progress was left.
  const scrollTops = useRef({})
  const scrollPath = useRef(path)
  useEffect(() => {
    const native = document.documentElement.classList.contains('native-app')
    const target = native ? document.getElementById('root') : window
    const read = () => (native ? document.getElementById('root').scrollTop : window.scrollY)
    const onScroll = () => { scrollTops.current[scrollPath.current] = read() }
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [])
  useLayoutEffect(() => {
    scrollPath.current = path
    if (!KEPT_TABS.includes(path)) return
    const top = scrollTops.current[path] ?? 0
    const root = document.getElementById('root')
    if (document.documentElement.classList.contains('native-app') && root) root.scrollTop = top
    else window.scrollTo(0, top)
  }, [path])
  // A PWA launched from the home screen opens at `/` and wants the sign-in form.
  // A stranger who tapped a link in a browser — at any width — wants the landing.
  //
  // The iOS app counts too, and for a stronger reason than screen shape: its
  // only way in is being someone's client, so the marketing landing is never
  // what it should boot to. Nobody downloads it to be sold coaching software.
  const isStandaloneDisplay = useMediaQuery('(display-mode: standalone)')
  const isStandalone =
    isStandaloneDisplay || window.navigator.standalone === true || isNativeApp()

  // Warm the tab bar's destinations so changing tabs never suspends.
  //
  // Every page is a lazy() chunk, so the FIRST visit to each tab falls through
  // to the Suspense fallback while its chunk loads. On the web an HTTP cache
  // makes that invisible after the first time; in the native shell it was
  // landing on every tab, and the fallback used to black out the whole screen,
  // so it read as the app relaunching on every tap.
  //
  // Fetched once, on the way in, while the reader is still looking at their
  // first screen. Failures are ignored on purpose: this is a cache warm, and
  // the real navigation will surface any genuine load error.
  useEffect(() => {
    if (!session) return
    Promise.all([
      import('./pages/Dashboard'),
      import('./pages/Log'),
      import('./pages/Coach'),
      import('./pages/Profile'),
    ]).catch(() => {})
  }, [session])
  const showLoginAsHome = !session && path === '/' && isStandalone
  const isLanding = !session && path === '/' && !isStandalone

  // App screens (every role's dashboard at `/`, the daily log at /log, the
  // profile, and a client's full record at /client/:id) get the full width so
  // they're visually consistent. Only the auth/standalone pages stay narrow.
  const isWideScreen =
    path === '/' || path === '/log' || path.startsWith('/profile') || path.startsWith('/client/')
  // The rail + content pages (a client's full record and the coach/settings
  // Profile) OWN THEIR LAYOUT. They render a full-height sidebar flush to the
  // viewport edge, which a centred max-width <main> makes impossible — the rail
  // ends up marooned mid-page with a band of empty background to its left, and
  // reads as a floating card rather than navigation. So <main> gets out of the
  // way entirely and .cv-shell / .cv-main supply their own padding.
  // /coach joins them: its archive rail is flush to the window edge, which a
  // centred max-width <main> makes impossible. /coach/reports renders the same
  // page with the archive modal up, so it wants the same layout.
  const ownsLayout = path.startsWith('/client/') || path.startsWith('/profile') || path.startsWith('/coach') || path.startsWith('/reports/')

  // Clients USED to carry a floating chat bubble (FAB, bottom-right) on every
  // page, and <main> kept extra bottom clearance so content never sat under it.
  // The bubble went when the conversation moved to /coach, and the component
  // behind it has since been deleted outright. A client page now reserves only
  // the bottom-nav strip, which it needs. The coach keeps their own bubble on
  // ClientView; the clearance for it rides on ChatBubble, which sets
  // `has-chat-fab` wherever it mounts rather than being claimed from here.
  const mainStyle = (isLanding || ownsLayout)
    ? { width: '100%' }
    : { maxWidth: isWideScreen ? '1180px' : '800px', margin: '0 auto', padding: '24px 16px' }

  return (
    <>
      {/* Keyboard users had to tab the whole nav on every route (H13). Visible
          only on focus, so it costs sighted users nothing. */}
      {session && <a href="#main" className="skip-link">Skip to main content</a>}
      {session && <NavBar profile={profile} />}
      <main id="main" style={mainStyle}>
        <Suspense fallback={<LoadingScreen inline />}>
          <Routes>
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
            {/* Signed in, `/`, /log and /coach render nothing here: they are
                KeptTabs, mounted below and shown or hidden by path. */}
            <Route path="/" element={session ? null : (showLoginAsHome ? <Login /> : <Landing />)} />
            <Route path="/log" element={session ? null : <Navigate to="/login" />} />
            <Route path="/profile" element={session ? <Profile session={session} profile={profile} subscription={subscription} soloSubscription={soloSubscription} hasSoloPremium={hasSoloPremium} onProfileUpdate={onProfileUpdate} /> : <Navigate to="/login" />} />
            {/* Each settings section is its own route, the same shape the
                coach's client record uses (/client/:id/:section). The rail
                navigates rather than scrolling, which is what keeps a screen
                short enough to read. `/profile` with no section is the index:
                the first section on a desktop, a list of destinations on a
                phone. See Profile.jsx. */}
            <Route path="/profile/:section" element={session ? <Profile session={session} profile={profile} subscription={subscription} soloSubscription={soloSubscription} hasSoloPremium={hasSoloPremium} onProfileUpdate={onProfileUpdate} /> : <Navigate to="/login" />} />
            <Route path="/coach" element={session ? null : <Navigate to="/login" />} />
            {/* The review queue, and the same queue with one check-in open over
                it. URL-addressed like /coach/reports, so a coach can be sent
                straight to a check-in and still land on the list on closing. */}
            <Route path="/check-ins" element={session ? <CheckinQueue profile={profile} /> : <Navigate to="/login" />} />
            <Route path="/check-ins/:clientId" element={session ? <CheckinQueue profile={profile} /> : <Navigate to="/login" />} />
            {/* The archive is a modal over the thread, not a page of its own.
                The URL still addresses it, so a link opens the thread with it up. */}
            <Route path="/coach/reports" element={session ? <Coach profile={profile} archiveOpen /> : <Navigate to="/login" />} />
            {/* The archive lived at its own route before the coach surface
                existed. Kept as a redirect so old links and notifications
                still land somewhere real. */}
            <Route path="/reports" element={<Navigate to="/coach/reports" replace />} />
            {/* The reader is the detail half of the coach surface: same page,
                same rail, the report in place of the thread. Alone on a phone. */}
            <Route path="/reports/:id" element={session ? <Coach profile={profile} /> : <Navigate to="/login" />} />
            <Route path="/join" element={<Join />} />
            <Route path="/client/:clientId" element={session ? <ClientView profile={profile} /> : <Navigate to="/login" />} />
            {/* The same record, addressed at one section. A phone renders that
                section alone; a desktop has the rail on screen already, so it
                renders everything and simply scrolls there. */}
            <Route path="/client/:clientId/:section" element={session ? <ClientView profile={profile} /> : <Navigate to="/login" />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/health-data-privacy" element={<ConsumerHealthData />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {/* The kept tabs. The one on screen is display: contents, so its
              wrapper adds no box and the page lays out exactly as it did as a
              route; the rest are display: none. */}
          {keptPaths.map(p => (
            <div key={`${userId}:${p}`} style={{ display: p === path ? 'contents' : 'none' }}>
              <TabActiveContext.Provider value={p === path}>
                {keptElement(p)}
              </TabActiveContext.Provider>
            </div>
          ))}
        </Suspense>
      </main>
      {/* Client chat bubble — mounted at the layout level so it's available on
          every authenticated page, not just the dashboard. */}
      {/* The floating chat bubble is gone for clients: the conversation lives
          on /coach now, beside the reports, under one unread count. A bubble
          pinned to every page was the second of two coach channels, and the
          one that made "what did my coach say?" a question with two answers.
          The coach keeps their own bubble on ClientView, where it is the only
          channel for that one client. */}
      {/* In-app "new version available" prompt for PWA users. */}
      <PWAUpdatePrompt />
    </>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)
  const [subLoading, setSubLoading] = useState(false)
  const [soloSubscription, setSoloSubscription] = useState(null)
  const [, setSoloSubLoading] = useState(false)

  // Coach-tier session caps; clients are covered by the project-wide Supabase
  // time-box and deliberately have no idle timeout.
  useSessionPolicy(session, profile)

  // Whose profile is loaded, so a session event for the same person can be
  // told apart from a sign-in by someone new (onAuthStateChange, below).
  const loadedUserId = useRef(null)

  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      setLoading(false)
      return
    }

    setProfile(data)
    loadedUserId.current = userId
    setLoading(false)
  }, [])

  const handleSignOut = useCallback(async () => {
    loadedUserId.current = null
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setSubscription(null)
    setSoloSubscription(null)
    setLoading(false)
    setSubLoading(false)
    setSoloSubLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        setLoading(true)
        fetchProfile(session.user.id)
      }
      else setLoading(false)
    }).catch(() => {
      supabase.auth.signOut()
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return

      setSession(session)
      if (session) {
        // Only a NEW person gets the full loading screen. Supabase also fires
        // here for the same person -- a token refresh, and a re-sign-in when
        // the app returns from the background -- and blanking for those tore
        // down the whole page tree on every resume: kept tabs were lost, and
        // whatever was half-done (a form a home screen shortcut had just
        // opened) was wiped. The same person's profile refreshes quietly.
        if (session.user.id !== loadedUserId.current) setLoading(true)
        fetchProfile(session.user.id)
      }
      else {
        loadedUserId.current = null
        setProfile(null)
        setSubscription(null)
        setSoloSubscription(null)
        setLoading(false)
        setSubLoading(false)
        setSoloSubLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // Apple Health syncs whenever the app is opened or brought back, for anyone
  // who has connected it. No background delivery: the phone reads Health only
  // while Gardnr is on screen, which is also when someone is looking at the
  // numbers. syncAppleHealth does nothing off the native app, without a
  // connection, or within ten minutes of the last run.
  useEffect(() => {
    const userId = profile?.role && profile.role !== 'coach' ? profile.id : null
    if (!userId || !isNativeApp()) return
    const run = () => {
      if (document.visibilityState !== 'visible') return
      syncAppleHealth(userId).catch(err => console.error('Apple Health sync failed:', err))
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [profile?.id, profile?.role])

  // Dismiss the cold-start splash (index.html) once the app shell is ready.
  useEffect(() => {
    if (!loading) window.hideSplash?.()
  }, [loading])

  useEffect(() => {
    if (profile?.role !== 'coach') {
      setSubscription(null)
      setSubLoading(false)
      return
    }

    let active = true

    async function fetchSubscription() {
      setSubLoading(true)
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, trial_end, current_period_end, stripe_price_id, billing_interval, cancel_at_period_end, paused_until, last_paused_at')
        .eq('coach_id', profile.id)
        .maybeSingle()

      if (!active) return

      if (error) console.error('Error fetching subscription:', error)
      setSubscription(data || null)
      setSubLoading(false)
    }

    fetchSubscription()

    return () => {
      active = false
    }
  }, [profile])

  useEffect(() => {
    if (profile?.role !== 'solo') {
      setSoloSubscription(null)
      setSoloSubLoading(false)
      return
    }

    let active = true

    async function fetchSoloSubscription() {
      setSoloSubLoading(true)
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, trial_end, current_period_end, stripe_price_id, billing_interval, paused_for_coaching, cancel_at_period_end')
        .eq('solo_id', profile.id)
        .maybeSingle()

      if (!active) return
      if (error) console.error('Error fetching solo subscription:', error)
      setSoloSubscription(data || null)
      setSoloSubLoading(false)
    }

    fetchSoloSubscription()

    return () => {
      active = false
    }
  }, [profile])

  const PAID_STATUSES = ['trialing', 'active', 'past_due']

  const hasSoloPremium =
    !SOLO_BILLING_ENABLED ||
    (profile?.role === 'solo' &&
      PAID_STATUSES.includes(soloSubscription?.status) &&
      !soloSubscription?.paused_for_coaching)

  if (PUBLIC_ROUTES.includes(window.location.pathname)) {
    return (
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/health-data-privacy" element={<ConsumerHealthData />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    )
  }

  if (loading) return <LoadingScreen />

  if (session && profile && !profile.role) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <main>
          <RolePicker
            session={session}
            onComplete={() => fetchProfile(session.user.id)}
            onCancel={handleSignOut}
          />
        </main>
      </Suspense>
    )
  }

  // Brand-new tracked users (solo + clients who weren't already solo) do a quick
  // biometrics setup once. The single `!onboarded_at` gate handles every entry
  // path: a solo→client carries their already-set onboarded_at, so they skip it.
  // Coaches are never tracked, so they never see it.
  if (session && profile && (profile.role === 'solo' || profile.role === 'client') && !profile.onboarded_at) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <main>
          <Onboarding
            session={session}
            profile={profile}
            onComplete={() => fetchProfile(session.user.id)}
          />
        </main>
      </Suspense>
    )
  }

  // A coach signed into the iOS app. Checked BEFORE the paywall, and not gated
  // on BILLING_ENABLED, because the paywall is the screen that must never
  // render here: a Stripe checkout inside an App Store build is what gives
  // Apple a cut of coach revenue. Refusing the role closes it, every other
  // coach screen, and every coach screen not yet written.
  if (isCoachOnNative(profile?.role)) {
    return <CoachOnWeb profile={profile} onSignOut={handleSignOut} />
  }

  if (BILLING_ENABLED && profile?.role === 'coach' && subLoading) {
    return <LoadingScreen />
  }

  if (BILLING_ENABLED && profile?.role === 'coach') {
    const status = subscription?.status

    if (!status || !PAID_STATUSES.includes(status)) {
      return <CoachPaywall subscription={subscription} profile={profile} onSignOut={handleSignOut} />
    }
  }

  return (
    <BrowserRouter>
      <AppRoutes
        session={session}
        profile={profile}
        subscription={subscription}
        soloSubscription={soloSubscription}
        hasSoloPremium={hasSoloPremium}
        onProfileUpdate={() => fetchProfile(session.user.id)}
      />
    </BrowserRouter>
  )
}

export default App
