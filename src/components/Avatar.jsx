import { useSignedAvatar } from '../utils/avatarUrl'

// Reusable avatar: the uploaded picture when set, else a brand-tinted circle of
// the person's initials. Used in the nav, roster, client record, and chat.
// `url` is the stored avatar value — a private-bucket storage path that we resolve
// to a short-lived signed URL here (or an already-signed http URL, passed through).
export default function Avatar({ url, name = '', size = 36, style }) {
  const resolved = useSignedAvatar(url)
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

  if (resolved) {
    return <img src={resolved} alt={name ? `${name}'s avatar` : 'avatar'} width={size} height={size} style={base} />
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
