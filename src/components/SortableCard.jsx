import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Wraps a dashboard card so it can be drag-reordered via a grip handle.
// When `enabled` is false (free solo / clients), it renders the child untouched
// — no handle, no sortable behavior, zero layout change.
export default function SortableCard({ id, enabled, children }) {
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
        title="Drag to reorder"
        style={{
          position: 'absolute', top: 18, right: 46, zIndex: 5,
          background: 'transparent', border: 'none', padding: 4,
          color: 'var(--color-muted)', fontSize: '1.05rem', lineHeight: 1,
          cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none',
        }}
      >
        ⠿
      </button>
      {children}
    </div>
  )
}
