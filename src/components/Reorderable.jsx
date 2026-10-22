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
export default function Reorderable({ order, defaultOrder, onReorder, enabled, children, gripStyle }) {
  const items = []
  React.Children.forEach(children, (c) => {
    if (React.isValidElement(c) && c.key != null) items.push(c)
  })
  const byKey = {}
  items.forEach((i) => { byKey[String(i.key)] = i })
  const present = items.map((i) => String(i.key))
  // `defaultOrder` is the caller's registry — the same constant it builds its
  // nav from. Without it the default is whatever order the JSX blocks happen
  // to be WRITTEN in, which is invisible from the constant and silently
  // disagrees with it: ClientView's rail read Progress-then-Targets off
  // REORDERABLE_KEYS while the page below it still rendered Targets first,
  // because moving a key in the registry moved the nav and nothing else.
  // Unknown keys are appended rather than dropped, so a section the registry
  // forgets still renders instead of vanishing.
  const defaults = Array.isArray(defaultOrder)
    ? [...defaultOrder.filter(k => present.includes(k)), ...present.filter(k => !defaultOrder.includes(k))]
    : present
  const keys = mergeOrder(order, defaults)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )

  const rendered = keys.map((k) => byKey[k]).filter(Boolean)

  // Fewer than three cards is not an arrangement problem.
  //
  // F6: don't add an affordance to a surface that does not need it. With two
  // cards there is exactly one alternative order, and asking a reader to learn
  // a drag mode, find a grip and complete a pointer gesture to reach it costs
  // more than the arrangement is worth — the same trade that removed the
  // phone record's reordering. Dashboard arrived here on its own: folding six
  // chart panels into one Trends card left this wrapping two children, and a
  // grip appeared beside both because nothing was watching the count.
  //
  // The rule lives HERE, not at the call site, for the reason F12 gives about
  // the InfoTip width: a threshold checked by each caller is a threshold the
  // next caller forgets. Saved orders are untouched — `mergeOrder` still runs,
  // so a layout survives dropping below the floor and coming back.
  if (!enabled || rendered.length < 3) return <>{rendered}</>

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
        {keys.map((k) => (byKey[k] ? <SortableCard key={k} id={k} enabled gripStyle={gripStyle}>{byKey[k]}</SortableCard> : null))}
      </SortableContext>
    </DndContext>
  )
}
