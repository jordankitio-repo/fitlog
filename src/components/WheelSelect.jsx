import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { Icon } from './ui'
import { useMediaQuery } from '../hooks/useMediaQuery'

// A <select> that, on a phone, is the iOS scroll wheel.
//
// iOS decides how a web <select> opens and, on current iPhones, that is a
// pop-up menu: a website cannot ask for the wheel. So on a touch screen this
// renders a field that opens a bottom sheet with a wheel of its own (rows
// snapping to a centre band, the ones above and below fading off, Done to
// confirm), and on a computer it is the plain native select, which is the
// right control there.
//
// A drop-in: same props as <select> (value, onChange, disabled, style,
// className, aria-label, <option> / <optgroup> children). onChange receives
// { target: { value } }, so `e.target.value` callers need no change.

const ROW = 40          // px per row
const VISIBLE = 5       // rows in view; the middle one is the choice

function readOptions(children) {
  const out = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === 'option') {
      out.push({ value: String(child.props.value ?? child.props.children), label: textOf(child.props.children), disabled: Boolean(child.props.disabled) })
    } else if (child.type === 'optgroup' || child.props?.children) {
      out.push(...readOptions(child.props.children))
    }
  })
  return out
}
function textOf(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf(node.props.children)
  return ''
}

// The wheel itself, for a sheet that shows wheels inline (several side by
// side, like an iOS picker with columns). `options`: [{ value, label, disabled }].
// `band={false}` leaves the highlight to the caller, which draws one band
// across several wheels, the way iOS does.
export function Wheel({ options, index, onIndex, label, band = true }) {
  const ref = useRef(null)
  const settle = useRef(null)
  const [live, setLive] = useState(index)
  // Start on the current choice, before the sheet paints.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ROW
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(settle.current), [])
  const nearest = (top) => Math.max(0, Math.min(options.length - 1, Math.round(top / ROW)))
  const onScroll = () => {
    const i = nearest(ref.current.scrollTop)
    setLive(i)
    clearTimeout(settle.current)
    // Disabled rows cannot be the choice: settle on the nearest enabled one.
    settle.current = setTimeout(() => {
      let j = nearest(ref.current.scrollTop)
      if (options[j]?.disabled) {
        const up = options.slice(0, j).map((o, k) => k).reverse().find(k => !options[k].disabled)
        const down = options.slice(j + 1).findIndex(o => !o.disabled)
        j = down >= 0 ? j + 1 + down : up ?? j
        ref.current.scrollTo({ top: j * ROW, behavior: 'smooth' })
      }
      onIndex(j)
    }, 90)
  }
  return (
    <div className="wheel" style={{ height: ROW * VISIBLE }} aria-label={label}>
      {band && <div className="wheel-band" aria-hidden="true" style={{ top: ROW * 2, height: ROW }} />}
      <div ref={ref} className="wheel-scroll" onScroll={onScroll} role="listbox" aria-activedescendant={`wheel-opt-${live}`}
        style={{ paddingTop: ROW * 2, paddingBottom: ROW * 2 }}>
        {options.map((o, i) => {
          const d = Math.abs(i - live)
          return (
            <div key={o.value + i} id={`wheel-opt-${i}`} role="option" aria-selected={i === live} aria-disabled={o.disabled || undefined}
              className="wheel-row" style={{ height: ROW, opacity: o.disabled ? 0.3 : d === 0 ? 1 : d === 1 ? 0.55 : 0.28 }}
              onClick={() => { if (!o.disabled) ref.current.scrollTo({ top: i * ROW, behavior: 'smooth' }) }}>
              {o.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function WheelSelect({ value, onChange, disabled, style, className, children, 'aria-label': ariaLabel, label, id, ...rest }) {
  const touch = useMediaQuery('(pointer: coarse)')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  if (!touch) {
    return <select id={id} value={value} onChange={onChange} disabled={disabled} style={style} className={className} aria-label={ariaLabel} {...rest}>{children}</select>
  }
  const options = readOptions(children)
  const current = Math.max(0, options.findIndex(o => o.value === String(value ?? '')))
  const title = label || ariaLabel || 'Choose'
  return (
    <>
      <button type="button" id={id} disabled={disabled} className={`wheel-field ds-control${className ? ' ' + className : ''}`}
        style={style} aria-haspopup="dialog" aria-label={`${title}: ${options[current]?.label ?? ''}`}
        onClick={() => { setPending(current); setOpen(true) }}>
        <span className="wheel-field-text">{options[current]?.label ?? ''}</span>
        <Icon name="down" size={14} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
      </button>
      <Modal open={open} title={title} onClose={() => setOpen(false)} maxWidth={420} sheet>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
          {open && <Wheel options={options} index={current} onIndex={setPending} />}
          <Button variant="primary" style={{ width: '100%' }} onClick={() => {
            setOpen(false)
            const v = options[pending]?.value
            if (v != null && v !== String(value ?? '')) onChange?.({ target: { value: v }, currentTarget: { value: v } })
          }}>Done</Button>
        </div>
      </Modal>
    </>
  )
}
