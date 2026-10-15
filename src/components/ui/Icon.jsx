// The app's icon set — ONE source, so icons stop being a mix of text glyphs
// (✓ ✕ ✎ ↻ ⠿ ← →) and emoji rendering in whatever the OS font happens to be.
//
// Style matches the SVGs already hand-written in the app: feather-style line
// art, stroke="currentColor" so an icon takes the colour of whatever it sits
// in, strokeWidth 1.75, round caps and joins. Size defaults to 1em so an icon
// inline with text scales with that text.
const PATHS = {
  check:    <polyline points="20 6 9 17 4 12" />,
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
  grip:     <><circle cx="9" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
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
  // Marks a saved meal — a group of entries logged together. Replaces a 🍽
  // emoji, which rendered in the OS font and was the app's last emoji-as-icon.
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
