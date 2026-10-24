// Full-screen branded loader — the in-app echo of the cold-start splash
// (index.html): the Gardnr mark pulsing on the themed background, instead of
// bare "Loading..." text. Used for route/page-level waits.
//
// `inline` is for waits that happen INSIDE an app that is already on screen.
// The full-screen variant is `position: fixed; inset: 0` over an opaque
// background, so using it for a route transition blacks out the nav and the
// tab bar too — the app appears to relaunch every time you change tabs. Inline
// keeps the chrome and animates the mark in the space the page will occupy.
export default function LoadingScreen({ inline = false }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={inline ? {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
      } : {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        zIndex: 50,
      }}
    >
      <img
        src="/logo-icon.svg"
        alt="Gardnr"
        width={104}
        height={104}
        className="brand-loader-mark"
      />
    </div>
  )
}
