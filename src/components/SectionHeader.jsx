import InfoTip from './InfoTip'
import Badge from './ui/Badge'
import Icon from './ui/Icon'

function SectionHeader({ title, collapsed, onToggle, badge, badgeColor, badgeTone = 'solid', info, action, children, animated = true }) {
  return (
    <>
      {/* No `onToggle` means this section does not collapse — so the header is
          not a button and the chevron is not drawn. A mark that points at an
          interaction the page does not offer is worse than no mark: it invites
          a tap and answers with nothing. */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: onToggle ? 'pointer' : 'default', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
          {/* A5: a panel heading is --text-body / medium, which is what ui/Panel
              renders on the roster. The bare global h2 (--text-lg) made every
              section title on ClientView and Profile a full step larger than
              every panel title on the reference screen. */}
          <h2 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 'var(--weight-medium)', letterSpacing: '-0.005em' }}>{title}</h2>
          {info && (
            // Stop the click so tapping the "i" reveals the tip instead of collapsing.
            <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
              <InfoTip text={info} />
            </span>
          )}
          {/* ui/Badge's own docs name tone="solid" as "the count badge in
              SectionHeader" — it had simply never been wired up here, so this
              was a hand-rolled copy of the primitive that described it, at 700
              where the primitive is 500. */}
          {/* `badgeTone` exists because a solid fill is not always right. Solid
              is a STATUS the reader must act on (the check-in's red "To do").
              A plain COUNT is not that, and painting one solid green put the
              app's action colour on a panel whose own rows grade the identical
              fact grey — the same "unread" reading as a call to action at panel
              level and as nothing-to-grade one line below it. B1: green must
              mean graded-and-good, never just "there are some". */}
          {badge && <Badge tone={badgeTone} color={badgeColor || 'var(--color-primary)'}>{badge}</Badge>}
          {/* Action sits in the title cluster (not the right) so it never
              collides with the absolutely-positioned drag grip. */}
          {!collapsed && action}
        </div>
        {/* Rejected pattern 4 applies to text glyphs too: ▶/▼ are geometric
            shapes from whatever the OS picks, next to an icon set that is all
            feather line art. One mark (D4), rotated — the chevron pointing down
            is the same chevron pointing right. */}
        {onToggle && (
          <Icon
            name="right"
            size="14px"
            style={{
              color: 'var(--color-muted)',
              transform: collapsed ? 'none' : 'rotate(90deg)',
              transition: 'transform 180ms ease',
            }}
          />
        )}
      </div>
      {animated ? (
        <div style={{
          display: 'grid',
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 0.25s ease',
          overflow: 'hidden',
        }}>
          {/* `minWidth: 0` matters as much as minHeight here. A grid item
              defaults to min-width:auto, so this wrapper refused to be
              narrower than its widest child — a 368px strip of chips stayed
              368px inside a 238px section, and every ancestor below it
              reported that it fit. Nothing downstream can shrink until this
              one is allowed to. */}
          <div style={{ minHeight: 0, minWidth: 0 }}>{children}</div>
        </div>
      ) : (
        !collapsed && <div style={{ paddingTop: 'var(--space-8)' }}>{children}</div>
      )}
    </>
  )
}

export default SectionHeader
