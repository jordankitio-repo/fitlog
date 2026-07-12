// Landing page content. Copy only — no markup, no logic, no styling.
//
// This module is the single source of truth for every string on the marketing
// page. Landing.jsx renders it; it must not define copy of its own. The intent
// is that positioning can change without touching components, and that no claim
// reaches the page without someone checking it's true.
//
// Claims on this page are load-bearing and were verified against the code:
//   - "flat, no per-client fee"  → create-checkout-session sets line_items
//     quantity to 1; nothing multiplies by roster size.
//   - "card required"            → Checkout runs in subscription mode without a
//     payment_method_collection override, so Stripe collects a card up front.
//   - "clients can delete"       → account erasure ships (delete-account fn).
//     NOTE: data *export* does NOT ship yet — do not claim it here.
// If you change billing or privacy behavior, change this file in the same PR.

export const meta = {
  title: 'Gardnr — Nutrition coaching software',
  // Kept under ~160 chars so it isn't truncated in search results.
  description:
    'Nutrition coaching software for online coaches: client logging, 7-day compliance, and weekly reports drafted from real data. Flat $19/mo. 30-day free trial.',
  ogDescription:
    'Client logging, compliance, and weekly reports in one place. Flat $19/month, every client included.',
}

export const nav = {
  links: [
    ['#how', 'Workflow'],
    ['#pricing', 'Pricing'],
    ['#faq', 'FAQ'],
  ],
  signIn: 'Sign in',
  cta: 'Start free trial',
}

export const hero = {
  // "For nutrition coaches" over the old "Nutrition coaching intelligence":
  // names the reader instead of the category. A stranger should know in one
  // glance whether this page is for them.
  eyebrow: 'For nutrition coaches',
  h1: "Stop guessing how your clients' week actually went.",
  subhead:
    'You coach nutrition on food screenshots and rebuilt spreadsheets. Gardnr puts client logging, compliance, and weekly reports in one place — so you walk into every check-in already knowing how the week went.',
  cta: 'Start 30-day free trial',
  secondaryCta: 'See the workflow',
  // Positive, checkmarked. The card disclosure is deliberately NOT one of these
  // — a checkmark implies a benefit, and "card required" isn't one.
  trust: [
    '30 days free, then $19/month',
    'Flat rate — no per-client fees',
    'Installs like an app — no App Store',
  ],
  // Sits directly under the CTA, unchecked and plain. Saying this out loud
  // converts better than hiding it until Stripe, and it's the honest posture
  // under ROSCA (material terms disclosed before billing info is collected).
  ctaNote:
    "Card required to start. You're not charged until day 31, and you can cancel any time before then.",
}

export const tagline = {
  accent: "Coaches don't build physiques.",
  rest: 'They create conditions for growth.',
}

export const pain = {
  eyebrow: 'The problem',
  h2: 'Nutrition coaching still loses the signal.',
  items: [
    { icon: '📲', text: 'Food screenshots buried in three different message threads' },
    { icon: '📊', text: 'Rebuilding the same compliance spreadsheet every week' },
    { icon: '🤔', text: 'Starting every check-in by asking "how did your week go?"' },
  ],
}

export const contrast = {
  eyebrow: 'What changes',
  h2: 'Replace scattered proof with one coaching record.',
  headBefore: 'Without Gardnr',
  headAfter: 'With Gardnr',
  rows: [
    {
      before: 'Screenshots and text threads',
      after: 'Daily nutrition, weight, cardio, and steps — all tied to the client',
    },
    {
      before: 'The scale as the only progress signal',
      after: 'Weight plus body measurements — neck to thigh — with per-site trends and change since day one',
    },
    {
      before: 'Manual weekly averages',
      after: '7-day compliance across calories, protein, cardio, and steps',
    },
    {
      before: 'Generic check-in questions',
      after: 'Check-ins you design — your cadence, your questions, answered against real data',
    },
    {
      before: 'Guessing who needs attention',
      after: 'Dashboard sorted by compliance and last log',
    },
  ],
}

// Cut from twelve equally-weighted cards to three. Twelve features with equal
// visual weight means none of them lands; a visitor takes one idea off a page,
// not twelve. These three are the ones a spreadsheet cannot do. Everything else
// moved to `alsoIncluded` below — still visible, so the product reads as deep,
// but no longer competing with the argument.
export const instruments = {
  eyebrow: 'The layer between tracking and coaching',
  h2: 'Three things a spreadsheet will never do for you.',
  items: [
    {
      title: 'Attention triage',
      copy: "Your dashboard ranks who needs you first — by compliance and last log. Ready, watch, or nudge. Your limited hours go to the client who's actually slipping, not the one who emailed most recently.",
    },
    {
      title: 'Weekly reports, already drafted',
      copy: "Each week's report is drafted from that client's real data, in your voice. Review it, edit it, send it — in about a minute, instead of an evening.",
    },
    {
      title: 'Their real maintenance, not a formula',
      copy: 'Empirical maintenance calories and weight trajectory, read from what your client actually ate and actually weighed — not a calculator that assumes an average human.',
    },
  ],
}

export const alsoIncluded = {
  label: 'Also included',
  items: [
    'Body composition — neck to thigh, with per-site trends',
    '90-day adherence map',
    'Custom check-in questions',
    'Per-client check-in cadence',
    'Meeting-prep briefs',
    'One-tap contextual nudges',
    'Private coach notes',
    'Weekday vs weekend compliance breakdown',
    'Re-engagement pause when a client goes quiet',
  ],
}

export const workflow = {
  eyebrow: 'Workflow',
  h2: 'Invite, log, coach.',
  steps: [
    {
      n: '01',
      kind: 'targets',
      title: 'Set the targets',
      copy: 'Invite a client — Gardnr suggests starting macros from their stats, then you set calories, macros, cardio, steps, and weight goals.',
    },
    {
      n: '02',
      kind: 'log',
      title: 'Clients log from their phone',
      copy: 'Installs like an app from any browser — no App Store. It opens straight to logging, so they actually keep it up.',
    },
    {
      n: '03',
      kind: 'chart',
      title: 'Coach from the evidence',
      copy: 'One view for compliance, messages, check-ins, notes, reports, and trends.',
    },
  ],
}

// New section. Flat pricing is the sharpest commercial argument Gardnr has and
// it appeared nowhere on the old page — every competitor charges per client.
// It gets its own anchor.
export const pricing = {
  eyebrow: 'Pricing',
  h2: 'One price. Every client included.',
  lede: "$19 a month, flat. Not per client, not per seat. Coach three people or thirty — the price doesn't move.",
  amount: '$19',
  period: '/month',
  trialLine: '30 days free, then $19/month',
  includes: [
    'Every client on your roster — no per-seat fee',
    'Clients use Gardnr free — they never pay anything',
    'Compliance, reports, check-ins, messaging, and nudges',
    'Cancel any time from your profile',
  ],
  cta: 'Start 30-day free trial',
  note: "Card required to start. You're not charged until day 31.",
  // The free solo product was a 12px footer link — the lowest-commitment door
  // Gardnr owns, hidden below the fold. It gets a real line here.
  soloLine: 'Not coaching anyone? Gardnr is free for tracking your own nutrition.',
  soloCta: 'Start free',
}

export const trial = {
  eyebrow: 'The proof plan',
  h2: 'Use the trial to run one real check-in.',
  copy: '30 days to run a real coaching cycle. See compliance, send reports, message clients — everything in one place from day one.',
  steps: [
    'Invite one client and set their targets',
    'Have them log a normal week from their phone',
    'Review their compliance before the check-in',
    'Generate, edit, and send the weekly report',
  ],
  cta: 'Start your 30-day trial',
  note: "$19/month after the trial. Card required to start; you're not charged until day 31. Cancel any time.",
}

// New section. Every objection below is one a coach will actually have, and an
// unanswered objection resolves as "no". Answers are deliberately plain — each
// one is checkable against the code, and none of them oversells.
export const faq = {
  eyebrow: 'Before you ask',
  h2: 'The questions coaches actually ask.',
  items: [
    {
      q: 'Do my clients pay anything?',
      a: 'No. Clients use Gardnr free, forever. You pay $19/month; they pay nothing.',
    },
    {
      q: 'How many clients can I coach on $19/month?',
      a: "Every client on your roster is included. The price is flat — it doesn't scale with the size of your book.",
    },
    {
      q: 'Do I need a card to start the free trial?',
      a: "Yes. We take your card at signup so your account keeps running on day 31. You aren't charged during the 30 days, and cancelling before then costs you nothing.",
    },
    {
      q: 'Do my clients need to download an app?',
      a: 'No App Store, no download. Gardnr installs to their home screen straight from the browser, and opens to a logging screen.',
    },
    {
      q: "What happens to my clients' health data?",
      a: "It's theirs. We don't sell it, and we don't share it with advertisers. Clients can permanently delete their account and data at any time. The details are in our Consumer Health Data Policy.",
    },
    {
      q: 'Can I cancel?',
      a: 'Any time, from your profile. Cancel during the trial and you are never charged.',
    },
  ],
}

// DEFERRED — founder note.
//
// This page currently carries zero trust signals: no testimonials, no coach
// count, no logos, no founder. That is the largest remaining gap in it, and it
// is not fixable with better copy — it needs either real users to quote or a
// real person to stand behind it.
//
// At zero users the honest substitute is a founder note: who built this, and
// what coaching problem they actually had. Deliberately not written yet, because
// inventing one converts worse than saying nothing and detonates later. When the
// raw material exists, add a `founder` export here and a section between
// `pricing` and `trial`.

export const finalCta = {
  h2: 'Start your next check-in from Gardnr.',
  copy: 'Everything your coaching workflow needs, in one place. 30 days free, $19/month after — every client included.',
  cta: 'Start 30-day free trial',
  signIn: 'Sign in',
}

export const footer = {
  tagline: 'Create conditions for growth.',
  links: [
    ['Sign in', '/login'],
    ['Terms', '/terms'],
    ['Privacy', '/privacy'],
    ['Health Data', '/health-data-privacy'],
  ],
  solo: 'Training solo? Start free →',
}
