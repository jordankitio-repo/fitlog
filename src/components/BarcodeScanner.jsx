import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

function BarcodeScanner({ onDetected, onClose }) {
  const scannerRef = useRef(null)

  useEffect(() => {
    const scanner = new Html5Qrcode('barcode-reader')
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: (width, height) => {
          const size = Math.min(width, height) * 0.7
          return { width: size, height: size * 0.6 }
        },
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
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
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.9)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, gap: '16px',
      padding: '20px'
    }}>
      <p style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
        Point camera at barcode
      </p>
      <div
        id="barcode-reader"
        style={{ width: '100%', maxWidth: '400px' }}
      />
      <button
        onClick={onClose}
        style={{
          backgroundColor: 'transparent',
          color: '#fff',
          border: '1px solid #fff',
          borderRadius: '8px',
          padding: '10px 24px',
          cursor: 'pointer',
          fontSize: '1rem',
          marginTop: '8px'
        }}
      >
        Cancel
      </button>
    </div>
  )
}

export default BarcodeScanner