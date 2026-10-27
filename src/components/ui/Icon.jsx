// The app's icon set — ONE source, so icons stop being a mix of text glyphs
// (✓ ✕ ✎ ↻ ⠿ ← →) and emoji rendering in whatever the OS font happens to be.
//
// Style matches the SVGs already hand-written in the app: feather-style line
// art, stroke="currentColor" so an icon takes the colour of whatever it sits
// in, strokeWidth 1.75, round caps and joins. Size defaults to 1em so an icon
// inline with text scales with that text.
const PATHS = {
  check:    <polyline points="20 6 9 17 4 12" />,
  plus:     <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  flag:     <><path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" /></>,
  lock:     <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  x:        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  pencil:   <><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>,
  repeat:   <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  // There was an `archive` glyph here, drawn for one caller: the control that
  // filed a coach's report away. That feature was deleted in September 2026 as
  // a filing chore, and `reports.archived` with it — so the glyph outlived the
  // only action it named, carrying five lines explaining a verb the app no
  // longer has. An icon set is a set of MEANINGS, and a meaning nothing means
  // any more is not one. `repeat` stays: it still un-does things on the Log.
  //
  // Delete — destroying a row, not dismissing a view. It was borrowed `x`, the
  // DISMISS mark, one verb along: the Log's entry, meal, saved
  // meal and cardio rows all hard-DELETE, and all four wore the mark that means
  // "close this". A red `x` beside a pencil reads as "cancel the edit", which is
  // the one thing it does not do. Feather's simple can, without the inner
  // strokes — at 1em those two extra lines turn the glyph to mush.
  trash:    <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  // "Open this bigger." Feather's maximize-2 — two corner arrows pointing
  // out. D4 is one glyph per meaning, and this is the only control in the app
  // that moves a thing from inline to a dialog, so it gets its own mark rather
  // than borrowing `right` (which means "go to this thing", a navigation, not
  // a change of depth).
  expand:   <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  grip:     <><circle cx="9" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
  // Three dots ACROSS, where `grip` is six dots in two columns. Not the same
  // mark twice: grip is a thing you take hold of and drag, `more` is a thing
  // you press to be shown the rest. The orientation is what separates them at
  // a glance, which is why this is horizontal and grip stays vertical.
  more:     <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  // `right` is THE forward glyph — navigation, CTAs, "go to this thing". There
  // is deliberately no second arrow style: one action, one mark.
  left:     <polyline points="15 18 9 12 15 6" />,
  up:       <polyline points="18 15 12 9 6 15" />,
  down:     <polyline points="6 9 12 15 18 9" />,
  right:    <polyline points="9 18 15 12 9 6" />,
  // The third trend direction. `up` and `down` already carry the other two —
  // a trend mark is a chevron in a circle, which is what Apple's Trends rows
  // use and what the design review compared this page against — so holding
  // steady needed a mark and nothing else did. D4 is one glyph per MEANING,
  // and "no material change" is a meaning the set had no way to say: the
  // alternative was rendering no mark, which reads as missing data rather than
  // as a flat line. Not reachable as a navigation glyph; it has no direction.
  flat:     <line x1="5" y1="12" x2="19" y2="12" />,
  info:     <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  leaf:     <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></>,
  // The other end of the growth motif from `leaf`. A leaf is what is growing
  // now; a tree is what the growing came to. Paired deliberately on the streak
  // strip -- current run gets the leaf, the longest run gets this -- so the two
  // cells read as a progression rather than the same fact twice.
  // A BROADLEAF, not a conifer: the leaf above is all curves, and a conifer's
  // angles put the pair in two different drawing styles -- a leaf is also what
  // a broadleaf is made of, which is the progression the pairing is for.
  // The canopy is three lobes rather than a circle. The first attempt was a
  // circle on a trunk with two branch strokes and it rendered as the Venus
  // symbol: the branches made a crossbar. Render any new glyph at 34px and
  // LOOK at it before shipping it.
  // Sized by MEASUREMENT, not by eye. The set's glyphs sit in a ~20-unit ink
  // box at 21-23% coverage (leaf 20.7/21.5, trash 19.7/23.2, repeat 19.7/21.0).
  // The first broadleaf drew a 16.5-unit box at 15.1% and read weedy and pale
  // beside the leaf it is meant to pair with -- 20% narrower and 30% less ink.
  // This one measures 21.9 x 21.3 at 18.9%: in the family. Coverage stays a
  // little under because an open canopy is less ink than a closed shape, which
  // is the glyph's nature rather than a defect.
  tree:     <><path d="M12 21.5v-6" /><path d="M7 15.5a5 5 0 0 1-1.8-9.7A5.2 5.2 0 0 1 12 2.2a5.2 5.2 0 0 1 6.8 3.6A5 5 0 0 1 17 15.5Z" /></>,
  // The three Body and activity metrics, for the tinted mark that starts each
  // row on the Log. Sized by MEASUREMENT against the set, like `tree`: the set
  // sits in a ~20-22 unit ink box at ~23-31% coverage (leaf 20.8/28.2, trash
  // 19.8 x 21.8/30.8, repeat 19.8 x 23.8/25.5 by the same render).
  // `heart` is the rail's cardio glyph at 92%: at full size it was the widest
  // mark in the set (22.6) and the heart rows read heavier than the others.
  // Now 20.8 x 18.4 at 24.3%.
  // `footprints` for steps, not the staircase it replaced: a staircase is
  // what Apple Health draws for FLIGHTS CLIMBED, and at 17.8 x 16.8 and 19%
  // it was the smallest, palest mark of the three. 19.8 x 21.8 at 33.2%.
  // `weight` for a weigh-in, not the bathroom scale it replaced: a scale is a
  // closed square, which put it at 37.5% (the heaviest in the set) and left a
  // dial too small to read at 16px. The weight shape says the same thing
  // lighter: 20.0 x 19.6 at 29.8%. (Not the rail's weightChart either: a
  // falling trend line beside a reading would claim a direction.)
  heart:      <path transform="translate(12 12) scale(0.92) translate(-12 -12)" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  footprints: <><path d="M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0z" /><path d="M20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0z" /><path d="M16 17h4" /><path d="M4 13h4" /></>,
  weight:     <><circle cx="12" cy="5.5" r="2.75" /><path d="M6.8 8.25h10.4a1.6 1.6 0 0 1 1.55 1.2l2.3 9.2a1.6 1.6 0 0 1-1.55 2H4.5a1.6 1.6 0 0 1-1.55-2l2.3-9.2a1.6 1.6 0 0 1 1.55-1.2z" /></>,
  // Marks a saved meal — a group of entries logged together. Replaces a 🍽
  // emoji, which rendered in the OS font and was the app's last emoji-as-icon.
  message:  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  search:   <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  utensils: <><path d="M7 2v8a2 2 0 0 0 2 2v10" /><path d="M4 2v5" /><path d="M10 2v5" /><path d="M18 2c-1.7 1.5-2.5 3.7-2.5 6 0 1.7.6 2.7 1.8 3.1V22" /></>,
}

export default function Icon({ name, size = '1em', strokeWidth = 1.75, style, ...rest }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: '-0.125em', ...style }}
      {...rest}
    >
      {path}
    </svg>
  )
}
