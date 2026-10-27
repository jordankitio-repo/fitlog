import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pill, Icon } from './ui'
import Button from './Button'
import PhotoDatePicker from './PhotoDatePicker'
import Skeleton from './Skeleton'
import ActionSheet from './ActionSheet'
import ConfirmDialog from './ConfirmDialog'
import { POSES, listPhotos, savePhoto, deletePhoto, signPhotos, datesFor, weightNear, weightsAround, photoSets } from '../utils/progressPhotos'
import { beforeAfterImage, saveBlob } from '../utils/beforeAfterImage'
import { convertWeight, unitLabel } from '../utils/weightTarget'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { parseLocalDateString, toLocalDateString, addDays } from '../utils/dateHelpers'
import Reveal from './Reveal'
import { useTabReturn } from '../hooks/useTabReturn'

// Progress photos, in the two places they are used:
//   PhotoSlots   — taking them: the day's front / side / back, on Today.
//   PhotoCompare — reading them: two dates of one pose, side by side or as a
//                  slider (Kahunas's Progress Overlay), on Progress and on the
//                  coach's client record. One component, so the client and the
//                  coach are looking at the same picture.

const shortLabel = (iso) => parseLocalDateString(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const dayLabel = (iso) => parseLocalDateString(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// Loads a user's photos and their signed URLs. `version` reloads.
function usePhotos(userId, version = 0) {
  const [state, setState] = useState({ photos: null, urls: {}, error: false })
  const [tick, setTick] = useState(0)
  // Today and Progress are kept-alive tabs: a photo added on one has to show
  // on the other when you go back to it. The old photos stay up until the new
  // list arrives, so the refresh is silent.
  useTabReturn(() => setTick(t => t + 1))
  useEffect(() => {
    if (!userId) return undefined
    let live = true
    listPhotos(userId)
      .then(async (photos) => {
        const urls = photos.length ? await signPhotos(photos.map(p => p.path)) : {}
        if (live) setState({ photos, urls, error: false })
      })
      .catch((e) => { console.error(e); if (live) setState({ photos: [], urls: {}, error: true }) })
    return () => { live = false }
  }, [userId, version, tick])
  return { ...state, retry: () => setTick(t => t + 1) }
}

const tileStyle = {
  position: 'relative', aspectRatio: '3 / 4', width: '100%', borderRadius: 'var(--radius)', overflow: 'hidden',
  background: 'color-mix(in srgb, var(--color-text) 5%, var(--color-surface))',
}
const imgStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }

// ── Taking them ─────────────────────────────────────────────────────────────
// `date` is the day being logged (YYYY-MM-DD). `onToast(message, type)`.
export function PhotoSlots({ userId, date, privacyNote, onToast, onChanged }) {
  const [version, setVersion] = useState(0)
  const { photos, urls, error, retry } = usePhotos(userId, version)
  const [busy, setBusy] = useState(null) // pose being uploaded
  const [menuFor, setMenuFor] = useState(null) // photo row
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [viewing, setViewing] = useState(null) // photo row
  const input = useRef(null)
  const multiInput = useRef(null)
  const target = useRef(null) // { pose, existing }

  const today = (photos || []).filter(p => p.taken_on === date)
  const byPose = Object.fromEntries(today.map(p => [p.pose, p]))
  // The last photo of each pose before this day: shown faintly in the empty
  // slot, so the client can stand where they stood last time (Trainerize's
  // guide lines, Progressly's ghost; this is the version a photo picker can
  // offer without a camera screen of our own).
  const lastOf = Object.fromEntries(POSES.map(({ key }) => [key, (photos || []).find(p => p.pose === key && p.taken_on < date) || null]))
  const empty = POSES.filter(p => !byPose[p.key])

  // Several photos at once (HubFit's one upload of front, side and back),
  // filled into the empty slots in order: front, side, back.
  const onFiles = async (e) => {
    const files = [...(e.target.files || [])].slice(0, empty.length)
    if (!files.length) return
    for (let i = 0; i < files.length; i++) {
      const pose = empty[i].key
      setBusy(pose)
      try {
        await savePhoto(userId, date, pose, files[i])
      } catch (err) {
        console.error(err)
        onToast?.(`Couldn't save the ${empty[i].label.toLowerCase()} photo. Try again.`, 'error')
        break
      }
    }
    setBusy(null)
    setVersion(v => v + 1)
    onChanged?.()
  }

  const pick = (pose, existing = null) => {
    target.current = { pose, existing }
    if (input.current) { input.current.value = ''; input.current.click() }
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    const t = target.current
    if (!file || !t) return
    setBusy(t.pose)
    try {
      await savePhoto(userId, date, t.pose, file, t.existing)
      setVersion(v => v + 1)
      onChanged?.()
    } catch (err) {
      console.error(err)
      onToast?.(err?.message?.startsWith("Couldn't") ? err.message : "Couldn't save the photo. Try again.", 'error')
    } finally {
      setBusy(null)
    }
  }
  const remove = async (photo) => {
    try {
      await deletePhoto(photo)
      setVersion(v => v + 1)
      onChanged?.()
    } catch (err) {
      console.error(err)
      onToast?.("Couldn't delete the photo. Try again.", 'error')
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      <input ref={multiInput} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      {error ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
          Couldn't load photos. <button type="button" className="pp-retry" onClick={retry}>Try again</button>
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-8)' }}>
          {POSES.map(({ key, label }) => {
            const photo = byPose[key]
            const loading = photos === null || busy === key
            return (
              <button
                key={key}
                type="button"
                className="ds-control pp-slot"
                disabled={loading}
                onClick={() => (photo ? setMenuFor(photo) : pick(key))}
                aria-label={photo ? `${label} photo, options` : `Add ${label.toLowerCase()} photo`}
                style={{ ...tileStyle, border: photo ? '0' : '1px dashed var(--color-border)', padding: 0, cursor: loading ? 'default' : 'pointer', color: 'var(--color-muted)', font: 'inherit' }}
              >
                {photo && urls[photo.path] && <img src={urls[photo.path]} alt="" style={imgStyle} />}
                {!photo && !loading && lastOf[key] && urls[lastOf[key].path] && (
                  <img src={urls[lastOf[key].path]} alt="" style={{ ...imgStyle, opacity: 0.22, filter: 'grayscale(1)' }} />
                )}
                {!photo && !loading && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                    <Icon name="plus" />{label}
                  </span>
                )}
                {photo && (
                  <span className="pp-slot-label">{label}</span>
                )}
                {loading && <span style={{ position: 'absolute', inset: 0 }}><Skeleton height="100%" /></span>}
              </button>
            )
          })}
        </div>
      )}
      {!error && empty.length > 1 && (
        <button type="button" className="pp-retry" style={{ textDecoration: 'none', fontSize: 'var(--text-sm)', alignSelf: 'flex-start' }}
          disabled={photos === null || Boolean(busy)}
          onClick={() => { if (multiInput.current) { multiInput.current.value = ''; multiInput.current.click() } }}>
          {empty.length === 3 ? 'Add all three' : `Add the other ${empty.length}`}
        </button>
      )}
      {/* The comparison is only as good as the photos: Fitbod and Boostcamp
          both put consistency first. One line, not a tutorial. */}
      {!error && empty.length > 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>
          Same spot, same light, first thing in the morning{Object.values(lastOf).some(Boolean) ? '. Last time\u2019s photo is shown faintly as a guide.' : '.'}
        </p>
      )}
      {privacyNote && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Icon name="lock" size={12} />{privacyNote}
        </p>
      )}
      <ActionSheet
        open={Boolean(menuFor)}
        title={menuFor ? `${POSES.find(p => p.key === menuFor.pose)?.label} photo` : ''}
        onClose={() => setMenuFor(null)}
        actions={menuFor ? [
          { label: 'View', icon: 'search', onSelect: () => setViewing(menuFor) },
          { label: 'Replace', icon: 'repeat', onSelect: () => pick(menuFor.pose, menuFor) },
          { label: 'Delete', icon: 'trash', destructive: true, onSelect: () => setConfirmDelete(menuFor) },
        ] : []}
      />
      <PhotoViewer
        open={Boolean(viewing)}
        items={viewing ? today.map(p => ({ key: p.id, url: urls[p.path], title: POSES.find(x => x.key === p.pose)?.label, caption: dayLabel(p.taken_on) })) : []}
        startKey={viewing?.id}
        onClose={() => setViewing(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this photo?"
        message="Your coach won't see it either."
        confirmLabel="Delete"
        danger
        onConfirm={() => { const p = confirmDelete; setConfirmDelete(null); remove(p) }}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  )
}

// ── Looking at one ──────────────────────────────────────────────────────────
// Full screen, the way Photos opens a picture: dark, the photo fitted, a
// caption, arrows (and the arrow keys, and a swipe) through the rest. A tap
// zooms to 2x where you tapped; another tap fits it again.
// `items`: [{ key, url, title, caption }].
function PhotoViewer({ open, items, startKey, onClose }) {
  const trapRef = useFocusTrap(open, onClose, { focusContainer: true })
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(null) // { x, y } in % when zoomed
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setIndex(Math.max(0, items.findIndex(i => i.key === startKey))); setZoom(null) }
  }
  const touch = useRef(null)
  const go = (d) => { setZoom(null); setIndex(i => Math.min(items.length - 1, Math.max(0, i + d))) }
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!open || !items.length) return null
  const item = items[Math.min(index, items.length - 1)]
  const arrow = (d, label, icon) => (
    <button type="button" className="pp-view-arrow ds-control" aria-label={label}
      disabled={index + d < 0 || index + d >= items.length} onClick={() => go(d)}
      style={{ [d < 0 ? 'left' : 'right']: 'var(--space-12)' }}>
      <Icon name={icon} size={22} />
    </button>
  )
  return createPortal(
    <div ref={trapRef} className="pp-view" role="dialog" aria-modal="true" aria-label={`${item.title} photo, ${item.caption}`}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touch.current == null || zoom) return
        const dx = e.changedTouches[0].clientX - touch.current
        touch.current = null
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
      }}
    >
      <div className="pp-view-bar">
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 'var(--weight-semibold)' }}>{item.title}</p>
          <p style={{ fontSize: 'var(--text-sm)', opacity: 0.75 }}>{item.caption}</p>
        </div>
        <button type="button" className="pp-view-close ds-control" aria-label="Close" onClick={onClose}><Icon name="x" size={22} /></button>
      </div>
      <div className="pp-view-stage" onClick={(e) => {
        if (zoom) { setZoom(null); return }
        const r = e.currentTarget.getBoundingClientRect()
        setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
      }}>
        {item.url && (
          <img src={item.url} alt="" draggable={false}
            style={{ transform: zoom ? 'scale(2)' : 'none', transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : 'center', cursor: zoom ? 'zoom-out' : 'zoom-in' }} />
        )}
      </div>
      {items.length > 1 && arrow(-1, 'Previous photo', 'left')}
      {items.length > 1 && arrow(1, 'Next photo', 'right')}
    </div>,
    document.body,
  )
}

// ── Reading them ────────────────────────────────────────────────────────────
// `emptyText` is the line under "No photos yet" (who adds them, and where).
// `unit` is the reader's weight unit ('lbs' | 'kg'); each photo is captioned
// with the weigh-in nearest it, the pairing Everfit and Azeoo show, because a
// photo without the scale beside it leaves half the comparison to memory.
// Two sets side by side, every pose at once: Azeoo compares whole entries,
// not one photo. A row per pose either set has; an empty cell says "—".
export function PhotoSetGrid({ before, after, urls, weightText }) {
  const poses = POSES.filter(p => before?.byPose[p.key] || after?.byPose[p.key])
  const cell = (set, pose) => {
    const photo = set?.byPose[pose]
    return (
      <div style={tileStyle}>
        {photo && urls[photo.path]
          ? <img src={urls[photo.path]} alt={`${pose} photo, ${dayLabel(set.date)}`} style={imgStyle} />
          : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-faint)' }}>{'\u2014'}</span>}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
        {[['Before', before], ['After', after]].map(([label, set]) => (
          <p key={label} style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            <strong>{label}</strong>{set && <span style={{ color: 'var(--color-muted)' }}> · {[shortLabel(set.date), weightText?.(set.date)].filter(Boolean).join(' · ')}</span>}
          </p>
        ))}
      </div>
      {poses.map(({ key, label }) => (
        <div key={key}>
          <p className="ds-colhead" style={{ margin: '0 0 var(--space-4)' }}>{label}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
            {cell(before, key)}{cell(after, key)}
          </div>
        </div>
      ))}
    </div>
  )
}

// `canExport`: whether this reader may save a before/after image (the client
// always, for their own photos; the coach when the client has allowed it).
// `exportNote`: the line shown instead, when they may not. `footer`: the
// client's consent switch, under everything.
export function PhotoCompare({ userId, emptyText, unit = 'lbs', canExport = false, exportNote = null, footer = null, onToast }) {
  const { photos, urls, error, retry } = usePhotos(userId)
  const [weights, setWeights] = useState([])
  const [pose, setPose] = useState(null)
  const [before, setBefore] = useState(null)
  const [after, setAfter] = useState(null)
  const [mode, setMode] = useState('side') // 'side' | 'slider'
  const [split, setSplit] = useState(50)
  const [viewing, setViewing] = useState(null) // date
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!userId || !photos?.length) return undefined
    let live = true
    weightsAround(userId, [...new Set(photos.map(p => p.taken_on))])
      .then(w => { if (live) setWeights(w) })
      .catch(e => console.error(e))
    return () => { live = false }
  }, [userId, photos])

  if (photos === null) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', maxWidth: 640 }}>
        <Skeleton height="220px" /><Skeleton height="220px" />
      </div>
    )
  }
  if (error) {
    return (
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>
        Couldn't load photos. <button type="button" className="pp-retry" onClick={retry}>Try again</button>
      </p>
    )
  }
  if (photos.length === 0) {
    return (
      <div style={{ padding: 'var(--space-8) 0' }}>
        <p style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)' }}>No photos yet</p>
        {emptyText && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginTop: 'var(--space-2)' }}>{emptyText}</p>}
        {footer}
      </div>
    )
  }

  const posesWithPhotos = POSES.filter(p => photos.some(x => x.pose === p.key))
  const sets = photoSets(photos) // newest first
  const allMode = pose === 'all' && sets.length > 1
  const activePose = pose && pose !== 'all' && posesWithPhotos.some(p => p.key === pose) ? pose : posesWithPhotos[0].key
  const poseLabel = POSES.find(p => p.key === activePose).label
  const dates = allMode ? sets.map(x => x.date) : datesFor(photos, activePose) // newest first
  const a = dates.includes(after) ? after : dates[0]
  const b = dates.includes(before) && before !== a ? before : (dates[dates.length - 1] !== a ? dates[dates.length - 1] : null)
  const urlOf = (d) => {
    const p = photos.find(x => x.pose === activePose && x.taken_on === d)
    return p ? urls[p.path] : null
  }
  // The weigh-in beside a date, in the reader's unit, one decimal.
  const kgOrLb = (w) => Math.round(convertWeight(Number(w.weight), w.unit, unit) * 10) / 10
  const weightOf = (d) => {
    const w = weightNear(weights, d)
    return w ? kgOrLb(w) : null
  }
  const weightText = (d) => {
    const v = weightOf(d)
    return v == null ? null : `${v.toFixed(1)} ${unitLabel(unit)}`
  }
  const caption = (d) => [dayLabel(d), weightText(d)].filter(Boolean).join(' \u00b7 ')
  // What changed between the two, in words: days apart, and the scale if both
  // dates have a weigh-in. Muted text, never a coloured verdict (C1).
  const days = b ? Math.round((parseLocalDateString(a) - parseLocalDateString(b)) / 86400000) : 0
  const wa = b ? weightOf(a) : null
  const wb = b ? weightOf(b) : null
  const delta = wa != null && wb != null ? Math.round((wa - wb) * 10) / 10 : null
  const summary = b && [
    delta != null && (delta === 0 ? 'Same weight' : `${delta > 0 ? '+' : '\u2212'}${Math.abs(delta).toFixed(1)} ${unitLabel(unit)}`),
    `${days} day${days === 1 ? '' : 's'} apart`,
  ].filter(Boolean).join(' \u00b7 ')

  // A calendar with only the photo days choosable (PhotoDatePicker).
  const dateSelect = (label, value, onChange) => (
    <PhotoDatePicker label={label} value={value} dates={dates} onChange={onChange} />
  )
  // A photo you can open. The weight rides on the photo itself, top right,
  // where Everfit puts it, so it survives being looked at without the caption.
  const photoTile = (d, extra) => (
    <button type="button" className="ds-control pp-open" onClick={() => setViewing(d)} aria-label={`Open ${poseLabel.toLowerCase()} photo, ${caption(d)}`}
      style={{ ...tileStyle, border: 0, padding: 0, cursor: 'zoom-in', display: 'block' }}>
      {urlOf(d) && <img src={urlOf(d)} alt="" style={imgStyle} />}
      {weightText(d) && <span className="pp-slot-label" style={{ left: 'auto', right: 'var(--space-6)', bottom: 'auto', top: 'var(--space-6)' }}>{weightText(d)}</span>}
      {extra}
    </button>
  )

  // 640px wide at most: two portrait photos at full card width on a desktop
  // were 600px tall each, and the toggle sat a screen-width away from them.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)', maxWidth: 640 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)', alignItems: 'center' }}>
        {sets.length > 1 && <Pill active={allMode} aria-pressed={allMode} onClick={() => setPose('all')}>All</Pill>}
        {posesWithPhotos.map(p => (
          <Pill key={p.key} active={!allMode && p.key === activePose} aria-pressed={!allMode && p.key === activePose} onClick={() => setPose(p.key)}>{p.label}</Pill>
        ))}

      </div>

      {allMode && b ? (
        <>
          <PhotoSetGrid before={sets.find(x => x.date === b)} after={sets.find(x => x.date === a)} urls={urls} weightText={weightText} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
            {dateSelect('Before', b, setBefore)}
            {dateSelect('After', a, setAfter)}
          </div>
        </>
      ) : !b ? (
        <>
          <div style={{ maxWidth: 280 }}>
            {photoTile(a)}
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginTop: 'var(--space-6)' }}>{dayLabel(a)}</p>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>One date so far. A second set of photos makes a comparison.</p>
        </>
      ) : mode === 'side' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
          {[['Before', b, setBefore], ['After', a, setAfter]].map(([label, d, set]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', minWidth: 0 }}>
              {photoTile(d)}
              {dateSelect(label, d, set)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', maxWidth: 420 }}>
          <div style={tileStyle}>
            {urlOf(a) && <img src={urlOf(a)} alt={`${poseLabel} photo, ${caption(a)}`} style={imgStyle} />}
            {urlOf(b) && <img src={urlOf(b)} alt={`${poseLabel} photo, ${caption(b)}`} style={{ ...imgStyle, clipPath: `inset(0 ${100 - split}% 0 0)` }} />}
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 2, marginLeft: -1, background: 'var(--color-surface)' }} />
            <span className="pp-slot-label" aria-hidden="true">{['Before', weightText(b)].filter(Boolean).join(' \u00b7 ')}</span>
            <span className="pp-slot-label" aria-hidden="true" style={{ left: 'auto', right: 'var(--space-6)' }}>{['After', weightText(a)].filter(Boolean).join(' \u00b7 ')}</span>
          </div>
          <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Before and after" style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
            {dateSelect('Before', b, setBefore)}
            {dateSelect('After', a, setAfter)}
          </div>
        </div>
      )}

      {/* What changed, and how it is shown. The view switch lives HERE, with
          the photos it changes, not in the chip row above: those chips pick
          what you look at (a pose); this picks how. As a fifth pill it read
          as one more filter. Two glyphs in one small group, the way a photo
          app puts its view switch by the content. */}
      {summary && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
          <p className="tnum" style={{ flex: 1, margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{summary}</p>
          {!allMode && (
            <span className="pp-view-switch" role="group" aria-label="Show as">
              <button type="button" className="ds-control" aria-pressed={mode === 'side'} aria-label="Side by side" title="Side by side" onClick={() => setMode('side')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="7.5" height="16" rx="1.5" /><rect x="13.5" y="4" width="7.5" height="16" rx="1.5" /></svg>
              </button>
              <button type="button" className="ds-control" aria-pressed={mode === 'slider'} aria-label="Slider" title="Slider" onClick={() => setMode('slider')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="12" y1="2" x2="12" y2="22" /><path d="M9.5 12h5" /></svg>
              </button>
            </span>
          )}
        </div>
      )}

      {/* A before/after image of the two dates, every pose both have. */}
      {b && (canExport ? (
        <div>
          <Button variant="muted" size="sm" loading={exporting} disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              const setOf = (d) => sets.find(x => x.date === d)
              const urlsOf = (set) => Object.fromEntries(Object.entries(set.byPose).map(([k, ph]) => [k, urls[ph.path]]))
              const blob = await beforeAfterImage({
                before: { date: b, weight: weightText(b), urls: urlsOf(setOf(b)) },
                after: { date: a, weight: weightText(a), urls: urlsOf(setOf(a)) },
                dateLabel: dayLabel,
              })
              await saveBlob(blob, `before-after-${b}-${a}.jpg`)
            } catch (e) {
              console.error(e)
              onToast?.(e?.message === 'No pose is in both sets.' ? 'These two dates share no pose.' : "Couldn't make the image. Try again.", 'error')
            } finally {
              setExporting(false)
            }
          }}>Save before/after</Button>
        </div>
      ) : exportNote && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>{exportNote}</p>
      ))}

      <PhotoViewer
        open={Boolean(viewing)}
        items={[...dates].reverse().map(d => ({ key: d, url: urlOf(d), title: poseLabel, caption: caption(d) }))}
        startKey={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}

// ── In a check-in ───────────────────────────────────────────────────────────
// The photos sent during a check-in's period, in the coach's review of it, with
// last time's set a tap away (HubFit compares photos from the check-in review
// screen). Nothing at all when the period has no photos: the check-in's own
// numbers and answers already fill the card.
export function CheckinPhotos({ clientId, weekOf, intervalWeeks = 1 }) {
  const { photos, urls } = usePhotos(clientId)
  const [comparing, setComparing] = useState(false)
  if (!photos?.length || !weekOf) return null
  const end = toLocalDateString(addDays(parseLocalDateString(weekOf), Math.max(1, intervalWeeks) * 7 - 1))
  const sets = photoSets(photos)
  const current = sets.find(x => x.date >= weekOf && x.date <= end)
  if (!current) return null
  const previous = sets.find(x => x.date < current.date) || null
  return (
    <div style={{ marginBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
        <p className="ds-colhead" style={{ margin: 0 }}>Photos · {shortLabel(current.date)}</p>
        {previous && (
          <button type="button" className="ds-disclosure ds-control" aria-expanded={comparing} onClick={() => setComparing(v => !v)}
            style={{ width: 'auto', padding: 0, gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
            Compare to {shortLabel(previous.date)} <Icon name="right" size={14} className="ds-chev" />
          </button>
        )}
      </div>
      {!comparing && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-8)', maxWidth: 420 }}>
          {POSES.map(({ key, label }) => {
            const ph = current.byPose[key]
            return (
              <div key={key} style={tileStyle}>
                {ph && urls[ph.path] && <img src={urls[ph.path]} alt={`${label} photo`} style={imgStyle} />}
                <span className="pp-slot-label">{label}</span>
              </div>
            )
          })}
        </div>
      )}
      <Reveal open={comparing}>
        <div style={{ maxWidth: 520 }}>
          <PhotoSetGrid before={previous} after={current} urls={urls} />
        </div>
      </Reveal>
    </div>
  )
}


// Two check-ins' photos side by side, for Compare check-ins: the set sent
// during each one's period (a check-in's photos are the ones taken while it
// was open). Nothing when neither has any.
export function CheckinPairPhotos({ clientId, before, after, intervalWeeks = 1 }) {
  const { photos, urls } = usePhotos(clientId)
  if (!photos?.length || !before || !after) return null
  const sets = photoSets(photos)
  const setIn = (c) => {
    const end = toLocalDateString(addDays(parseLocalDateString(c.week_of), Math.max(1, intervalWeeks) * 7 - 1))
    return sets.find(x => x.date >= c.week_of && x.date <= end) || null
  }
  const a = setIn(before), b = setIn(after)
  if (!a && !b) return null
  return (
    <div>
      <p className="ds-colhead" style={{ margin: '0 0 var(--space-8)' }}>Photos</p>
      <PhotoSetGrid before={a} after={b} urls={urls} />
    </div>
  )
}
