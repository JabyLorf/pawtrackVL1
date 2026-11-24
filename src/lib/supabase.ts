import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the site was built without the Supabase settings (shows a setup message). */
export const configMissing = !url || !anon

if (configMissing) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY at build time.')
}

// A placeholder keeps createClient from throwing, so the setup message can render.
export const supabase = createClient(url || 'https://missing-config.invalid', anon || 'missing')

export function publicUrl(bucket: string, path: string) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
