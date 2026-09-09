import type { Dog, DogStatus } from '../types'

export function passwordErrors(password: string) {
  const issues: string[] = []
  if (password.length < 8) issues.push('at least 8 characters')
  if (!/[A-Z]/.test(password)) issues.push('an uppercase letter')
  if (!/[a-z]/.test(password)) issues.push('a lowercase letter')
  if (!/\d/.test(password)) issues.push('a number')
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('a special character')
  return issues
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
    d.status !== 'Pending Adoption' &&
    d.status !== 'Under Treatment' &&
    d.status !== 'Fostered' &&
    d.status !== 'Deceased'
  )
}

export function inCare(d: Dog) {
  return d.status !== 'Adopted' && d.status !== 'Deceased'
}

export function dogMatches(d: Dog, q: string) {
  const n = q.trim().toLowerCase()
  if (!n) return true
  return [d.name, d.age, d.color, d.sex, d.breed, d.status].join(' ').toLowerCase().includes(n)
}
