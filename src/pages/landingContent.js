// Landing page content. Copy only — no markup, no logic, no styling.
//
// This module is the single source of truth for every string on the marketing
// page. Landing.jsx renders it; it must not define copy of its own. The intent
// is that positioning can change without touching components, and that no claim
// reaches the page without someone checking it's true.
//
// ⚠️ BILLING IS OFF. This page must not describe a trial, a price you charge
// today, or a card requirement.
//
// `BILLING_ENABLED = false` (src/App.jsx) — committed in b451ce6, "turn off the
// coach paywall (pre-public)". CoachPaywall is the ONLY path a coach has to
// create-checkout-session, and it never renders. So today a coach signs up, walks
// straight into the app, and is never asked for a card or charged anything.
//
// An earlier draft of this file described a "$19/month, 30-day trial, card
// required" flow, inferred from create-checkout-session without checking whether
// the paywall that calls it was reachable. It wasn't. That copy invented a price
// and a credit-card wall that do not exist — the most expensive possible error
// for a product whose only constraint is distribution.
//
// 🔒 If you flip BILLING_ENABLED back to true, the pricing, trial, hero and FAQ
// copy below all become lies in the other direction. Change them in the SAME PR.
//
// Claims here, and how each was verified:
//   - "free, no card"        → BILLING_ENABLED === false, so CoachPaywall (the
//                              only coach checkout entry point) never mounts.
//   - "every client included"→ create-checkout-session hardcodes line_items
//                              quantity to 1; nothing multiplies by roster size.
//                              No client cap exists in the schema.
//   - "$19/month planned"    → the configured Stripe price. Stated as INTENT,
//                              never as a charge that happens today.
//   - "clients can delete"   → account erasure ships (delete-account fn).
//                              NOTE: data *export* does NOT ship — do not claim it.

export const meta = {
  title: 'Gardnr — Nutrition coaching software',
  // Kept under ~160 chars so it isn't truncated in search results.
  description:
    'Nutrition coaching software for online coaches: client logging, 7-day compliance, and weekly reports drafted from real data. Free while in early access.',
  ogDescription:
    'Client logging, compliance, and weekly reports in one place. Free while we’re in early access.',
}

export const nav = {
  links: [
    ['#how', 'Workflow'],
    ['#pricing', 'Pricing'],
    ['#faq', 'FAQ'],
  ],
  signIn: 'Sign in',
  cta: 'Start free',
}

export const hero = {
  // "For nutrition coaches" over the old "Nutrition coaching intelligence":
  // names the reader instead of the category. A stranger should know in one
  // glance whether this page is for them.
  eyebrow: 'For nutrition coaches',
  h1: "Stop guessing how your clients' week actually went.",
  subhead:
    'You coach nutrition on food screenshots and rebuilt spreadsheets. Gardnr puts client logging, compliance, and weekly reports in one place — so you walk into every check-in already knowing how the week went.',
  cta: 'Start free',
  secondaryCta: 'See the workflow',
  trust: [
    'Free while we’re in early access',
    'Every client included — no per-seat fee',
    'Installs like an app — no App Store',
  ],
  // "No card" is the single strongest thing this page can say to a stranger who
  // has never heard of Gardnr and has no reason to trust it yet. It is also, for
  // once, simply true. Say it directly under the CTA where the hesitation lives.
  ctaNote: 'No card, no trial clock. Gardnr is free while we’re in early access.',
}

// The hero image is a screenshot of the real coach dashboard, captured from the
// running app against a seeded demo roster. It replaces a hand-built mock of a
// UI that did not exist.
//
// This image carries meaning rather than decoration, so the alt text has to
// convey what a sighted visitor takes from it (WCAG 1.1.1) — which is the
// triage story, not a list of widgets. It is not "screenshot of dashboard".
export const heroShot = {
  alt: 'The Gardnr coach dashboard: three clients ranked by who needs attention first. Maya is on target, Jordan is drifting, and Sam has not logged in three days — each with their week of calorie, protein, cardio and step compliance beside them.',
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

// Pricing while BILLING_ENABLED is false.
//
// The job of this section is no longer to sell a price — it's to remove the
// last hesitation ("what's the catch?") while still anchoring what Gardnr is
// worth. Naming $19 now, as intent rather than a charge, is what stops the day
// we switch billing on from feeling like a bait-and-switch. Free with a named
// future price is a normal, honest early-access posture; free with no mention
// of ever charging is the one that burns your earliest supporters later.
export const pricing = {
  eyebrow: 'Pricing',
  h2: 'Free while we’re in early access.',
  lede:
    'Gardnr is free to use right now — no card, no trial clock, no cap on how many clients you coach. When we do start charging it will be $19 a month, flat, with every client included. You’ll hear it from us well before that happens.',
  amount: 'Free',
  period: 'while in early access',
  trialLine: 'Planned at launch: $19/month, flat',
  includes: [
    'Every client on your roster — no per-seat fee, ever',
    'Clients use Gardnr free — they never pay anything',
    'Compliance, reports, check-ins, messaging, and nudges',
    'Delete your account, and everything in it, whenever you like',
  ],
  cta: 'Start free',
  note: 'No card required. We’ll give you plenty of notice before Gardnr costs anything.',
  // The free solo product was a 12px footer link — the lowest-commitment door
  // Gardnr owns, hidden below the fold. It gets a real line here.
  soloLine: 'Not coaching anyone? Gardnr is free for tracking your own nutrition.',
  soloCta: 'Start free',
}

// Was "The proof plan — use the trial to run one real check-in". There is no
// trial any more, but the section is the best on the page: it tells a coach
// exactly how to evaluate Gardnr instead of asking them to browse features. The
// framing survives, the trial clock doesn't.
export const trial = {
  eyebrow: 'The proof plan',
  h2: 'Judge it on one real check-in.',
  copy:
    'Don’t take our word for any of this. Give it one client and one week, then look at the check-in that comes out the other end and decide.',
  steps: [
    'Invite one client and set their targets',
    'Have them log a normal week from their phone',
    'Review their compliance before the check-in',
    'Generate, edit, and send the weekly report',
  ],
  cta: 'Start free',
  note: 'Free while we’re in early access. No card, and nothing to cancel.',
}

// Every objection below is one a coach will actually have, and an unanswered
// objection resolves as "no". Answers are deliberately plain — each one is
// checkable against the code, and none of them oversells.
export const faq = {
  eyebrow: 'Before you ask',
  h2: 'The questions coaches actually ask.',
  items: [
    {
      q: 'What does Gardnr cost?',
      a: 'Nothing right now. Gardnr is free while we’re in early access — no card, no trial clock, no limits. When we start charging it will be $19 a month, flat, and you’ll hear it from us well before it happens.',
    },
    {
      q: 'What’s the catch?',
      a: 'There isn’t one. Gardnr is new, and we would rather have coaches using it and telling us what’s wrong with it than have a payment page nobody reaches. That’s the whole trade.',
    },
    {
      q: 'How many clients can I coach?',
      a: 'As many as you like. There is no per-client fee and no cap — and there won’t be one when we start charging either. The price is flat, so it doesn’t scale with the size of your book.',
    },
    {
      q: 'Do my clients pay anything?',
      a: 'No. Clients use Gardnr free, and they always will. Whatever a coach pays, their clients pay nothing.',
    },
    {
      q: 'Do my clients need to download an app?',
      a: 'No App Store, no download. Gardnr installs to their home screen straight from the browser, and opens to a logging screen.',
    },
    {
      q: 'What happens to my clients’ health data?',
      a: 'It’s theirs. We don’t sell it, and we don’t share it with advertisers. Clients can permanently delete their account and everything in it at any time. The details are in our Consumer Health Data Policy.',
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
  copy: 'Everything your coaching workflow needs, in one place. Free while we’re in early access — no card, every client included.',
  cta: 'Start free',
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
