import { supabase } from './supabase'
import type { Profile } from '../types'

export function isOfficial(user?: Profile | null) {
  return !!user && (user.role === 'staff' || user.role === 'admin')
}

export function authorLabel(user?: Profile | null) {
  if (!user) return 'Unknown'
  if (isOfficial(user)) return 'PawTrack Community Admin'
  return user.username
}

export function compactNum(n: number) {
  const v = Number(n) || 0
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.0', '')}k`
  return String(v)
}

export function dmThread(a: string, b: string) {
  return `dm:${[a, b].sort().join(':')}`
}

export async function notify(
  meId: string,
  toUserId: string,
  text: string,
  extra?: { type?: string; postId?: string; dogId?: string },
) {
  if (!toUserId || toUserId === meId) return
  await supabase.from('notifications').insert({
    to_user_id: toUserId,
    from_user_id: meId,
    text,
    type: extra?.type || '',
    post_id: extra?.postId || null,
    dog_id: extra?.dogId || null,
  })
}
