// Full-screen branded loader — the in-app echo of the cold-start splash
// (index.html): the Gardnr mark pulsing on the themed background, instead of
// bare "Loading..." text. Used for route/page-level waits.
export default function LoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
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
