/**
 * Gardnr mark — renders the brand vector (public/logo-icon.svg), a green sprout
 * with a progress arrow on a dark squircle tile. Kept as an <img> so it stays
 * byte-identical to the source artwork at every size.
 *
 * Props:
 *   size       px (square)                              default 30
 *   wordmark   append the "gardnr" lockup to the right  default false
 *   className  applied to the wrapper when wordmark      —
 */
export default function Logo({ size = 30, wordmark = false, className }) {
  const img = (
    <img
      src="/logo-icon.svg"
      alt="Gardnr"
      width={size}
      height={size}
      style={{ display: 'block', flex: '0 0 auto' }}
    />
  )

  if (!wordmark) return img

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      {img}
      <span
        style={{
          fontWeight: 800,
          fontSize: size * 0.5,
          letterSpacing: '-0.03em',
          color: 'var(--color-text, #f0f0f0)',
        }}
      >
        gardnr
      </span>
    </span>
  )
}
