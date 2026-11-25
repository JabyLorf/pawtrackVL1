import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function validUrl(u: string | undefined) {
  try {
    return !!u && /^https?:$/.test(new URL(u).protocol)
  } catch {
    return false
  }
}

/** True when the site was built without valid Supabase settings (shows a setup message). */
export const configMissing = !validUrl(url) || !anon

if (configMissing) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY at build time.')
}

// A placeholder keeps createClient from throwing, so the setup message can render.
export const supabase = createClient(configMissing ? 'https://missing-config.invalid' : url!, anon || 'missing')

export function publicUrl(bucket: string, path: string) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * A readable message for a Supabase Auth error. Email-sending failures come
 * back as a 500 with an empty message ("{}"), so they get a plain explanation.
 */
export function authMessage(error: { message?: string; status?: number } | null | undefined) {
  if (!error) return null
  const msg = (error.message || '').trim()
  if (/rate limit|security purposes/i.test(msg)) return 'Too many tries. Please wait a few minutes, then try again.'
  if (!msg || msg === '{}' || (error.status ?? 0) >= 500 || /sending .*email|smtp/i.test(msg)) {
    return "We couldn't send the email right now. Please try again later, or contact an administrator."
  }
  return msg
}
