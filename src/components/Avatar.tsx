/** Round profile photo, or the first letter of the name when there's none. */
export function Avatar({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" /> : (name.trim()[0] || '?').toUpperCase()}
    </span>
  )
}
