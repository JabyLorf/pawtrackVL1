import type { Dog, DogStatus } from '../types'

export const PASSWORD_RULES: Array<[string, (p: string) => boolean]> = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
  ['A special character', (p) => /[^A-Za-z0-9]/.test(p)],
]

export function passwordOk(password: string) {
  return PASSWORD_RULES.every(([, test]) => test(password))
}

export function peso(amount: number) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ago(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** Today's date as YYYY-MM-DD in the viewer's own time zone. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole calendar days since a date (0 = today), in local time. */
export function calendarDaysSince(iso: string) {
  const start = new Date(iso)
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const now = new Date()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

export function daysIn(dog: Pick<Dog, 'intake_at'>) {
  if (!dog.intake_at) return 0
  return Math.max(0, Math.round((Date.now() - new Date(dog.intake_at).getTime()) / 86400000))
}

export function statusClass(status: DogStatus | string) {
  if (status === 'Available') return 'active'
  if (status === 'Under Treatment' || status === 'Pending Adoption' || status === 'pending') return 'pending'
  if (status === 'Deceased') return 'dead'
  if (status === 'approved' || status === 'confirmed') return 'active'
  return 'adopted'
}

export function canHavePuppies(d: Pick<Dog, 'sex' | 'age'>) {
  return d.sex === 'Female' && ['Young Adult', 'Adult', 'Senior'].includes(d.age)
}

export function isListed(d: Dog) {
  return (
    d.visible &&
    d.status !== 'Adopted' &&
    d.status !== 'Under Treatment' &&
    d.status !== 'Fostered' &&
    d.status !== 'Deceased'
  )
}

/** Most pending adoption requests a dog can have at once (also enforced in the database). */
export const MAX_ADOPTION_REQUESTS = 5

export function inCare(d: Dog) {
  return d.status !== 'Adopted' && d.status !== 'Deceased'
}

export function dogMatches(d: Dog, q: string) {
  const n = q.trim().toLowerCase()
  if (!n) return true
  return [d.name, d.age, d.color, d.sex, d.breed, d.status].join(' ').toLowerCase().includes(n)
}
