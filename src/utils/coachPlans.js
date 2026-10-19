// The coach billing ladder, as the screens say it.
//
// Two surfaces price this plan: CoachPaywall, where a coach first picks a
// cadence, and the Billing card, where they can now change it. The list lived
// inside the paywall, so adding the second surface would have made two copies
// of three prices — and a price that disagrees with itself across two screens
// is worse than one that is simply wrong, because the reader cannot tell which
// to believe.
//
// The KEY is the only thing either screen sends to the server. The Stripe Price
// is resolved there from that label (supabase/functions/_shared/coachPricing.ts)
// and never from the browser: VITE_* ships in the JS bundle, so a price ID that
// travelled from here could be swapped for the cheapest one. The amounts below
// are display text, and the server does not read them.
export const COACH_PLANS = [
  {
    key: 'monthly',
    name: 'Monthly',
    amount: '$49',
    period: 'per month',
    permo: '',
    badge: null,
    // How the Billing card names what you are paying, as a sentence fragment.
    summary: '$49/month',
    // Commitment rank. Higher is longer, which is what makes a change an
    // UPGRADE or a DOWNGRADE rather than just a change — the confirm step says
    // different things about money in each direction.
    rank: 0,
  },
  {
    key: '6mo',
    name: '6 months',
    amount: '$264',
    period: 'per 6 months',
    permo: '$44/mo',
    badge: { text: 'Save 10%', tone: 'soft' },
    summary: '$264 every 6 months',
    rank: 1,
  },
  {
    key: 'annual',
    name: 'Annual',
    amount: '$490',
    period: 'per year',
    permo: '$41/mo',
    badge: { text: '2 months free', tone: 'solid' },
    summary: '$490/year',
    rank: 2,
  },
]

export function planFor(key) {
  return COACH_PLANS.find((p) => p.key === key) ?? null
}

// Longer commitment = upgrade. Used only to choose the wording on the confirm
// step: an upgrade takes money today, a downgrade hands back time as credit,
// and telling someone the wrong one is how a billing screen loses trust.
export function isUpgrade(fromKey, toKey) {
  const from = planFor(fromKey)
  const to = planFor(toKey)
  if (!from || !to) return null
  return to.rank > from.rank
}
