import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Coach reports run long and drag the dashboard down. Show only the beginning
// (faded preview); tapping it opens the full report in a centered tile over a
// blurred backdrop. Tap the backdrop, the ×, or Escape to dismiss.
const PREVIEW_MAX = 140

export default function ReportBody({ content, color = 'var(--color-text)', heading }) {
  const [open, setOpen] = useState(false)

  // While the modal is open: lock body scroll and close on Escape. (No React
  // state is set in the effect body, so no set-state-in-effect lint.)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        <p style={{
          color, lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '0.875rem',
          margin: 0, maxHeight: PREVIEW_MAX, overflow: 'hidden',
        }}>
          {content}
        </p>
        <div aria-hidden="true" style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
          background: 'linear-gradient(to bottom, transparent, var(--color-bg))',
          pointerEvents: 'none',
        }} />
        <span style={{
          display: 'inline-block', marginTop: 8, color: 'var(--color-primary)',
          fontWeight: 600, fontSize: '0.8rem',
        }}>
          Read full report →
        </span>
      </div>

      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)', boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
              width: 'min(640px, 100%)', maxHeight: '85vh', overflowY: 'auto',
              padding: '22px 24px', position: 'relative',
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 12, right: 14, background: 'transparent',
                border: 'none', color: 'var(--color-muted)', cursor: 'pointer',
                fontSize: '1.4rem', lineHeight: 1,
              }}
            >
              ×
            </button>
            {heading && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: 14, paddingRight: 28 }}>
                {heading}
              </p>
            )}
            <p style={{ color: 'var(--color-text)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '0.9rem', margin: 0 }}>
              {content}
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
