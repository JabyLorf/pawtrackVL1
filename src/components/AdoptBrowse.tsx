import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dogMatches, isListed } from '../lib/utils'
import type { Dog, DogAge, DogSex } from '../types'
import { DogCard } from './DogCard'
import { DogPeek } from './DogPeek'

export function AdoptBrowse({ compact }: { compact?: boolean }) {
  const [dogs, setDogs] = useState<Dog[]>([])
  const [peek, setPeek] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sex, setSex] = useState<'Any' | DogSex>('Any')
  const [age, setAge] = useState<'Any' | DogAge>('Any')

  useEffect(() => {
    supabase.from('dogs').select('*').order('name').then(({ data }) => setDogs((data as Dog[]) || []))
  }, [])

  const listed = useMemo(() => dogs.filter(isListed).filter((d) => {
    if (sex !== 'Any' && d.sex !== sex) return false
    if (age !== 'Any' && d.age !== age) return false
    return dogMatches(d, q)
  }), [dogs, sex, age, q])

  const Chip = ({ group, value, label }: { group: 'sex' | 'age'; value: string; label?: string }) => {
    const on = group === 'sex' ? sex === value : age === value
    return (
      <button type="button" className={'filter' + (on ? ' on' : '')} onClick={() => {
        if (group === 'sex') setSex(value as typeof sex)
        else setAge(value as typeof age)
      }}>{label || value}</button>
    )
  }

  return (
    <>
      <div className={compact ? 'compact-adopt' : undefined}>
        <div className="adopt-tools">
          <input className="staff-search" placeholder="Search by name, age, color, or sex" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="filters">
            <Chip group="sex" value="Any" label="Any gender" />
            <Chip group="sex" value="Male" />
            <Chip group="sex" value="Female" />
            <Chip group="age" value="Any" label="Any age" />
            <Chip group="age" value="Puppy" />
            <Chip group="age" value="Young Adult" />
            <Chip group="age" value="Adult" />
            <Chip group="age" value="Senior" />
          </div>
        </div>
        <div className="dog-grid">
          {listed.length ? listed.map((d) => <DogCard key={d.id} dog={d} onOpen={setPeek} />) : <p className="empty">No dogs match those filters right now.</p>}
        </div>
      </div>
      {peek ? <DogPeek dogId={peek} onClose={() => setPeek(null)} /> : null}
    </>
  )
}
