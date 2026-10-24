import { Capacitor } from '@capacitor/core'

// Is this the App Store build, as opposed to a browser?
//
// NOT the same question as "is this standalone". An installed PWA is also
// standalone and also full-screen, but it reaches the user through a URL and
// Apple takes no interest in it. This one is specifically "we are inside the
// native shell", which is what the App Store rules attach to.
//
// Returns false in every browser, including an installed PWA, so every call
// site below is a no-op on the web.
export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

// WHY THE COACH GATE IS A ROLE CHECK AND NOT A ROUTE LIST
//
// The obvious implementation is to block the coach's routes -- /check-ins,
// /client/:id, /coach/reports. That is wrong twice over.
//
// It is wrong because it would break a client: `/coach` is not a coach route.
// It is where a CLIENT reads their coach's thread and reports (see the comment
// on the chat bubble in App.jsx). A route list drawn from the word "coach"
// takes the client's conversation away.
//
// And it is wrong because a route list is a thing you have to remember to
// update. Add a coach screen in six months and it is reachable in the app
// until somebody notices. Refusing the ROLE closes every coach screen that
// exists and every one that ever will, including the paywall -- which is the
// screen that actually matters, because payment UI inside an iOS app is what
// hands Apple a cut of coach revenue.
export function isCoachOnNative(role) {
  return isNativeApp() && role === 'coach'
}

// Payment UI that must not render inside the app.
//
// Deliberately NOT tied to BILLING_ENABLED / SOLO_BILLING_ENABLED. Both are
// false today, so none of this renders anywhere yet -- which is exactly why the
// guard has to be independent of them. The flags flip when billing turns on,
// and on that day this must already be true, not be remembered.
export function hidesPaymentUI() {
  return isNativeApp()
}
