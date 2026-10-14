import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icon } from './ui'

// Wraps a dashboard card so it can be drag-reordered via a grip handle.
// When `enabled` is false (free solo / clients), it renders the child untouched
// — no handle, no sortable behavior, zero layout change.
export default function SortableCard({ id, enabled, children, gripStyle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled })

  if (!enabled) return children

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 20 : 'auto',
    opacity: isDragging ? 0.9 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="ds-control ds-grip"
        style={{
          // Default placement is tuned for a tall section card. A list row is
          // 56px, so a grip pinned 18px from its top sits off-centre and 46px
          // from the right lands on the chevron — `gripStyle` lets a caller
          // place it rather than forcing every sortable thing to be card-shaped.
          position: 'absolute', top: 18, right: 46, zIndex: 5,
          background: 'transparent', border: 'none', padding: 4,
          // Quieter and smaller. At --text-subhead (18px) in --color-muted it
          // was the heaviest mark in a section header, competing with the title
          // beside it — a lot of standing weight for an action taken once. It
          // is rank 4 (D3): no chrome until you touch it, --color-faint at rest,
          // and it only needs to be findable, not announced.
          color: 'var(--color-faint)', lineHeight: 1,
          transition: 'color 140ms ease',
          cursor: isDragging ? 'grabbing' : 'grab',
          // `none`, deliberately: the browser must not treat a drag on this
          // handle as a pan, or the row lifts and then refuses to follow.
          touchAction: 'none',
          // A finger is bigger than 15px of dots.
          minWidth: 28, minHeight: 28, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          ...gripStyle,
        }}
      >
        <Icon name="grip" size={15} />
      </button>
      {children}
    </div>
  )
}
