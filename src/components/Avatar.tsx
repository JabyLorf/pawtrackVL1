import type { Profile } from '../types'

export function Avatar({
  user,
  size = '',
}: {
  user?: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'avatar_hue'> | null
  size?: '' | 'lg' | 'xl'
}) {
  const letter = (user?.display_name || user?.username || '?').slice(0, 1).toUpperCase()
  const hue = user?.avatar_hue ?? 200
  if (user?.avatar_url) {
    return (
      <span className={'avatar av-photo' + (size ? ` ${size}` : '')}>
        <img src={user.avatar_url} alt="" />
      </span>
    )
  }
  return (
    <span
      className={'avatar' + (size ? ` ${size}` : '')}
      style={{ background: `hsl(${hue} 42% 42%)` }}
    >
      {letter}
    </span>
  )
}
