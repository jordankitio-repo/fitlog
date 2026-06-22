// Reusable avatar: the uploaded picture when set, else a brand-tinted circle of
// the person's initials. Used in the nav, roster, client record, and chat.
export default function Avatar({ url, name = '', size = 36, style }) {
  const initials = name.trim()
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
    : '?'

  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flex: '0 0 auto',
    objectFit: 'cover',
    ...style,
  }

  if (url) {
    return <img src={url} alt={name ? `${name}'s avatar` : 'avatar'} width={size} height={size} style={base} />
  }

  return (
    <div
      aria-hidden="true"
      style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-primary-dim)',
        color: 'var(--color-primary)',
        fontWeight: 600,
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
