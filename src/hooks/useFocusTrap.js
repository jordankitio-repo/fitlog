import { useEffect, useRef } from 'react'

// Accessibility for modal dialogs. When `active`, focus moves into the dialog,
// Tab / Shift+Tab cycle within it (never escaping to the page behind), Esc
// closes it, and focus returns to whatever was focused before it opened.
// Attach the returned ref to the dialog container element.
//
// Safe to call unconditionally (e.g. before an early `return null`): when
// `active` is false it does nothing.
export function useFocusTrap(active, onClose) {
  const ref = useRef(null)
  useEffect(() => {
    if (!active || !ref.current) return
    const node = ref.current
    const prevFocused = document.activeElement

    const focusable = () =>
      Array.from(
        node.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

    // Move focus into the dialog: first focusable, else the container itself.
    const first = focusable()[0]
    if (first) first.focus()
    else {
      node.setAttribute('tabindex', '-1')
      node.focus()
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        e.preventDefault()
        return
      }
      const idx = items.indexOf(document.activeElement)
      if (e.shiftKey && idx <= 0) {
        e.preventDefault()
        items[items.length - 1].focus()
      } else if (!e.shiftKey && (idx === items.length - 1 || idx === -1)) {
        e.preventDefault()
        items[0].focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (prevFocused && typeof prevFocused.focus === 'function') prevFocused.focus()
    }
  }, [active, onClose])

  return ref
}
