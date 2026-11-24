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
