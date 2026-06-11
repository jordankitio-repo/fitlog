import React from 'react'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableCard from './SortableCard'
import { mergeOrder } from '../utils/cardOrder'

// Drag-reorders its direct children using each child's `key` as the card id.
// Keep the section JSX inline as children (each with a stable key); this wraps
// them in dnd-kit and renders them in the saved order. When `enabled` is false,
// it just renders the children in saved order with no drag affordance.
//
// Touch: drag starts from the grip handle (SortableCard) with a short press
// delay, so it never fights page scroll.
export default function Reorderable({ order, onReorder, enabled, children }) {
  const items = []
  React.Children.forEach(children, (c) => {
    if (React.isValidElement(c) && c.key != null) items.push(c)
  })
  const byKey = {}
  items.forEach((i) => { byKey[String(i.key)] = i })
  const keys = mergeOrder(order, items.map((i) => String(i.key)))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )

  const rendered = keys.map((k) => byKey[k]).filter(Boolean)

  if (!enabled) return <>{rendered}</>

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = keys.indexOf(String(active.id))
    const to = keys.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onReorder(arrayMove(keys, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {keys.map((k) => (byKey[k] ? <SortableCard key={k} id={k} enabled>{byKey[k]}</SortableCard> : null))}
      </SortableContext>
    </DndContext>
  )
}
