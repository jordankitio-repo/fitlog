// Ask the notification bell to recompute now. The bell otherwise only refreshes
// on mount and tab-refocus, so an action taken on the current page (logging
// nutrition, submitting a check-in) wouldn't clear the alert it resolves until
// you navigated away. Fire this after such actions to keep the bell honest.
export const NOTIF_REFRESH = 'gardnr-notif-refresh'

export function refreshNotifications() {
  window.dispatchEvent(new Event(NOTIF_REFRESH))
}
