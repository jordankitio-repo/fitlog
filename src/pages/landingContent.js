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
  // No "Pricing" link — there is no pricing section to point it at. See the
  // note where that section used to live, further down this file.
  links: [
    ['#how', 'Workflow'],
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
  // The entire treatment money gets on this page: three words in a checklist.
  // "while we're in early access" is what makes charging later fair — everyone
  // understands a beta ends — and it costs three words to say, not a section.
  //
  // "No client caps" replaced "no per-seat fee". The competitors don't charge
  // per seat either (TrueCoach, Practice Better and Healthie all bill a flat fee
  // inside a client-count band), so "no per-seat fee" was differentiating against
  // nobody. Caps are the thing they all have and we don't — Healthie's entry tier
  // stops at 10 clients. That's the true claim, and it's the sharper one.
  trust: [
    'Free while we’re in early access',
    'No client caps — coach as many as you like',
    'Installs like an app — no App Store',
  ],
  // "No card" is the single strongest thing this page can say to a stranger who
  // has never heard of Gardnr and has no reason to trust it yet. Say it directly
  // under the CTA, where the hesitation actually lives. Then stop talking.
  ctaNote: 'No card required.',
}

// The hero is an interactive tour of three REAL screens, captured from the
// running app against a seeded roster (scripts/seed-hero-roster.mjs and
// scripts/shoot-hero.mjs). It replaces a hand-drawn mock of a dashboard that did
// not exist, with a "Review and send" button that did nothing.
//
// Interactivity sells. FAKE interactivity is worse than a static image, because
// it invites a stranger to touch your product and then lies to them. So: real
// tabs, real screens, and the default frame carries the argument on its own for
// the majority of visitors who will never click anything.
//
// Every `alt` has to convey what a sighted visitor TAKES from the frame (WCAG
// 1.1.1) — the story, not an inventory of widgets. "Screenshot of dashboard" is
// not alt text. The captions do the same job for anyone on a phone, where a
// screenshot of a dense app is decorative no matter how well it's cropped.
// `hotspots` are the callouts you get when you hover (or tap) a region of a
// frame. The REGIONS live in public/hero/hotspots.json and are measured off the
// live DOM at capture time, so they can't drift from the picture; the WORDS live
// here, because they're copy.
//
// Hovering lifts the region and explains the signal, the way the real app
// responds to a hover — but a click does nothing, deliberately. This is a
// photograph you can point at, not a puppet show pretending to be an app. The
// difference between the two is the whole reason the last hero got deleted.
export const heroTour = {
  label: 'A tour of Gardnr',
  frames: [
    {
      id: 'triage',
      tab: 'Who needs you first',
      caption:
        'Your roster, ranked by who is slipping. Sam stopped logging five days ago. Marcus’s cardio has quietly gone to one session in seven. Maya is fine — leave her alone.',
      alt: 'The Gardnr coach dashboard, sorted by attention. Sam Rivera is flagged red for five days without a log. Marcus Webb is amber, with cardio at one session out of seven. Maya Chen is on track. A banner across the top reads one at risk, one needs review, one on track, with two check-ins waiting to be reviewed.',
      hotspots: {
        sam: 'Sam went quiet five days ago. Gardnr put him at the top of the list and offered the nudge — you didn’t have to notice.',
        marcus: 'Marcus is still logging, so nothing looks wrong. But his cardio has fallen to one session in seven. That’s the drift a spreadsheet hides.',
        maya: 'Maya is on target and logged today. The most valuable thing a dashboard can tell you is who you can safely ignore.',
      },
    },
    {
      id: 'evidence',
      tab: 'The whole week, in evidence',
      caption:
        'Ninety days of adherence, every day coloured against target. Fifty of fifty-six days logged, 94% of target on average — and you can see exactly which days went over.',
      alt: 'A client record showing logging consistency: a twelve-day streak, seven of the last seven days logged, and a ninety-day calorie-compliance heatmap where every day is coloured against target — green on target, amber under, orange over. Fifty of fifty-six days logged, at 94% of target on average.',
      hotspots: {
        heatmap: 'Ninety days at a glance. On-target is a band, not a line — so a day spent 400 calories over never gets to hide behind the word “logged”.',
        streak: 'Twelve days running, and seven of the last seven. You walk into the check-in already knowing whether the plan was even followed.',
      },
    },
    {
      id: 'composition',
      tab: 'What the scale hides',
      caption:
        'Waist down 5.2cm. Arm up 1.1cm. The weight barely moved — this is the recomp a scale on its own would never have shown you.',
      alt: 'Body measurements for a client: neck, chest, waist, hips, arm and thigh, each showing its current value, the change since the first recording, and a trend line over eight weeks. The waist is down 5.2 centimetres while the arm is up 1.1 centimetres.',
      hotspots: {
        waist: 'Waist down 5.2cm over eight weeks — while the scale barely moved. This is the number that keeps a client from quitting.',
        arm: 'And the arm is UP. Losing fat while gaining size is the whole point, and it is invisible to a weigh-in.',
      },
    },
    // The sharpest thing Gardnr does, and until now it was one line of prose
    // buried in a list. Every competitor draws you a weight chart. This one reads
    // the chart back to you as a number you can actually coach from — and says
    // out loud how sure it is, which is rarer than it should be.
    {
      id: 'maintenance',
      tab: 'What they can actually eat',
      caption:
        'Her real maintenance — about 2,150–2,250 calories — read from what she actually ate and actually weighed. Not a formula that assumes an average human. The range is the honest width of the estimate, and it narrows as she logs.',
      alt: 'A coach-only energy balance read for a client. Estimated maintenance is 2,150 to 2,250 calories, her weight trend is down 0.9 pounds a week, and she logged 1,746 calories against an 1,850 target. Above it, a chart overlays her weight line on daily calorie and cardio compliance bars.',
      hotspots: {
        read: 'No calculator asked her height and guessed. This is fitted from eight weeks of her own intake against her own weigh-ins — and the width of the range is the fit’s real error, so it tells you when it doesn’t know.',
      },
    },
  ],
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
// not twelve. These three are the ones a spreadsheet cannot do — the rest of the
// product's depth is carried by the interactive hero tour and the contrast table,
// not spelled out in a feature list that competes with the argument.
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

// ── No pricing section, deliberately ────────────────────────────────────────
//
// There used to be one here: a price card, a paragraph explaining our future
// monetisation, a promise to give notice, a "what's the catch" FAQ. All of it
// is gone, and the section in Landing.jsx with it.
//
// A pricing section exists to answer a price objection. Gardnr has no price, so
// there is no objection — and the only thing such a section can do is make the
// page talk anxiously about our business model on real estate that belongs to
// the coach's problem. Naming a future number was worse still: it anchors us to
// a price the market says is far too low (Healthie charges $129/mo for the
// unlimited-client tier we were about to price at $19), and it manufactures the
// pricing objection at the exact moment the honest answer is "it's free".
//
// Free is a fact we state once — in `hero.trust`, and once more in the FAQ.
// It is not a topic. Bring a pricing section back the day there's a number to
// put in it, and see the BILLING_ENABLED warning at the top of this file.

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
  note: 'Free while we’re in early access. No card required.',
}

// Every objection below is one a coach will actually have, and an unanswered
// objection resolves as "no". Answers are deliberately plain — each one is
// checkable against the code, and none of them oversells.
export const faq = {
  eyebrow: 'Before you ask',
  h2: 'The questions coaches actually ask.',
  items: [
    // One cost question, answered in one line. No future number, no explaining,
    // and deliberately no "what's the catch?" — that question plants the doubt
    // it pretends to settle, and nobody asked it.
    {
      q: 'What does Gardnr cost?',
      a: 'Nothing right now — it’s free while we’re in early access. No card, no limits.',
    },
    {
      q: 'How many clients can I coach?',
      a: 'As many as you like. There’s no per-client fee and no cap on your roster.',
    },
    {
      q: 'Do my clients pay anything?',
      a: 'No. Clients use Gardnr free, and they always will.',
    },
    // "Do my clients need to download an app?" lived here and was cut: the hero
    // trust badge and Workflow step 02 both already say "installs like an app,
    // no App Store" — an FAQ that restates above-the-fold copy is padding. The
    // four questions that remain each answer an objection with no other home.
    {
      q: 'What happens to my clients’ health data?',
      a: 'It’s theirs. We don’t sell it, and we don’t share it with advertisers. Clients can permanently delete their account and everything in it at any time. The details are in our Consumer Health Data Policy.',
    },
  ],
}

export const finalCta = {
  h2: 'Start your next check-in from Gardnr.',
  copy: 'Everything your coaching workflow needs, in one place.',
  // Small reassurance line under the copy. The "no card" half was dropped: the
  // hero note and the FAQ both say it, so a third time here just read repetitive.
  note: 'Free while we’re in early access',
  cta: 'Start free',
  signIn: 'Sign in',
  // Rehomed from the deleted pricing section. The free solo product is the
  // lowest-commitment door Gardnr owns; it shouldn't only exist in the footer.
  soloLine: 'Not coaching anyone? Gardnr is free for tracking your own nutrition.',
  soloCta: 'Start free',
}

// A fuller footer, in the mould of other early-access products (visibilityradar,
// plainwork): a brand block with a live status pill, three link columns, and a
// legal base line. Everything here points somewhere real — in-page anchors, live
// routes, or the contact address used across the legal pages. No social links,
// because there are no accounts yet; inventing them would be the one dishonest
// thing on the page. Add them here the day they exist.
//
// Link convention consumed by Landing.jsx: a target starting with '#' or
// 'mailto:' renders as a plain <a>; anything else renders as a router <Link>.
export const footer = {
  blurb: 'Nutrition-coaching software for online coaches.',
  status: 'Early access',
  // Social links. Empty until the real accounts exist — a footer icon that goes
  // nowhere is worse than no icon, and this ships to production. To turn the row
  // back on, add entries like { label: 'X', icon: 'x', href: 'https://x.com/…' };
  // supported icons: x, linkedin, instagram (see SOCIAL_PATHS in Landing.jsx).
  // The footer renders the row only when this array is non-empty.
  social: [],
  // What's inside — a full-width chip band, not links: there are no per-feature
  // pages to point at, and minting an anchor for each would be dishonest padding.
  //
  // ⚠️ Every chip below is a SHIPPED capability, verified against product code
  // (edge functions, DB tables + RLS, computed utils, coach-facing UI) — not a
  // claim borrowed from marketing copy. A 12th chip, "Re-engagement pauses", was
  // removed here: no feature pauses check-ins/cadence when a client goes quiet
  // (the nearest real things are a 48h nudge cooldown and a client-side progress
  // lock), and it doubled up on "Attention triage". Same rule if you add one:
  // point at the code that implements it, or don't ship the chip.
  features: {
    title: 'Key features',
    items: [
      'Attention triage',
      'Weekly reports, drafted',
      'Empirical maintenance',
      'Body composition — neck to thigh',
      '90-day adherence map',
      'Custom check-in questions',
      'Per-client check-in cadence',
      'Meeting-prep briefs',
      'One-tap contextual nudges',
      'Private coach notes',
      'Weekday vs weekend splits',
    ],
  },
  columns: [
    {
      title: 'Product',
      links: [
        ['Workflow', '#how'],
        ['What changes', '#contrast'],
        ['What a spreadsheet can’t do', '#instruments'],
        ['FAQ', '#faq'],
      ],
    },
    {
      title: 'Get started',
      links: [
        ['Start free', '/login?mode=signup&role=coach'],
        ['Track solo, free', '/login?mode=signup&role=solo'],
        ['Sign in', '/login'],
      ],
    },
    {
      title: 'Company',
      links: [
        ['Contact', 'mailto:digigardenllc@gmail.com'],
        ['Terms', '/terms'],
        ['Privacy', '/privacy'],
        ['Consumer Health Data', '/health-data-privacy'],
      ],
    },
  ],
  // Rendered as "© <year> Digigarden LLC" — the entity named in the Terms.
  entity: 'Digigarden LLC',
  tagline: 'Create conditions for growth.',
}
