import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

function BarcodeScanner({ onDetected, onClose }) {
  const scannerRef = useRef(null)

  useEffect(() => {
    const scanner = new Html5Qrcode('barcode-reader')
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        scanner.stop().then(() => {
          onDetected(decodedText)
        })
      },
      () => {}
    ).catch((err) => {
      console.error('Camera error:', err)
    })

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, gap: '16px'
    }}>
      <p style={{ color: '#fff', fontWeight: 600 }}>Point camera at barcode</p>
      <div id="barcode-reader" style={{ width: '300px' }} />
      <button
        onClick={onClose}
        style={{
          backgroundColor: 'transparent',
          color: '#fff',
          border: '1px solid #fff',
          borderRadius: '8px',
          padding: '8px 20px',
          cursor: 'pointer'
        }}
      >
        Cancel
      </button>
    </div>
  )
}

export default BarcodeScanner