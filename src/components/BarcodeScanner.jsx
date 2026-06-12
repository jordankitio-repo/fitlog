import { useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

// Owns the camera stream end-to-end so it can be released deterministically.
// The old html5-qrcode version left the MediaStream running on close (black
// screen until a full refresh) and was unreliable at 1D barcode pickup.
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const onDetectedRef = useRef(onDetected)
  useEffect(() => { onDetectedRef.current = onDetected }, [onDetected])
  const doneRef = useRef(false)

  // Stop everything: the zxing decode loop AND any live camera tracks still
  // attached to the <video>. Stopping the tracks directly is the guarantee —
  // it releases the camera regardless of the library's internal state.
  function teardown() {
    try { controlsRef.current?.stop() } catch { /* not running */ }
    controlsRef.current = null
    const v = videoRef.current
    const stream = v && v.srcObject
    if (stream && stream.getTracks) {
      stream.getTracks().forEach((t) => { try { t.stop() } catch { /* */ } })
    }
    if (v) v.srcObject = null
  }

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result) => {
          if (result && !doneRef.current) {
            doneRef.current = true
            teardown()
            onDetectedRef.current(result.getText())
          }
        }
      )
      .then((controls) => {
        // If we unmounted before the camera finished starting, tear down now.
        if (cancelled) { try { controls.stop() } catch { /* */ } teardown() }
        else controlsRef.current = controls
      })
      .catch((err) => { console.error('Camera/scanner error:', err) })

    return () => { cancelled = true; teardown() }
  }, [])

  function handleCancel() {
    teardown()
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, gap: '16px', padding: '20px',
    }}>
      <p style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', margin: 0 }}>
        Point camera at a barcode
      </p>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }}
      />
      <button
        onClick={handleCancel}
        style={{
          backgroundColor: 'transparent', color: '#fff',
          border: '1px solid #fff', borderRadius: '8px',
          padding: '10px 24px', cursor: 'pointer', fontSize: '1rem', marginTop: '8px',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

export default BarcodeScanner
