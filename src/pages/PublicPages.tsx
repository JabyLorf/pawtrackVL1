import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isListed } from '../lib/utils'
import type { Dog } from '../types'
import { DogCard } from '../components/DogCard'
import { DogPeek } from '../components/DogPeek'
import { AdoptBrowse } from '../components/AdoptBrowse'
import { PublicLayout } from '../components/PublicLayout'

export function HomePage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  const [peek, setPeek] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('dogs').select('*').order('intake_at', { ascending: false }).then(({ data }) => {
      setDogs(((data as Dog[]) || []).filter(isListed).slice(0, 8))
    })
  }, [])
  return (
    <PublicLayout>
      <section className="hero">
        <div className="container">
          <span className="kicker" style={{ color: '#fde68a' }}>Non-profit animal rescue · Ormoc City</span>
          <h1>Their second chance starts with you</h1>
          <p className="tagline">Rescue Love. Adopt Hope. Don't Shop. We rescue, rehabilitate, and rehome abandoned, neglected, and abused dogs at the Ormoc City Dog Pound in Brgy. Cagbuhangin.</p>
        </div>
      </section>
      <section className="pub-stats">
        <div className="container">
          <div><div className="n">120+</div><div className="l">Dogs rescued</div></div>
          <div><div className="n">80+</div><div className="l">Happy adoptions</div></div>
          <div><div className="n">25</div><div className="l">Active volunteers</div></div>
          <div><div className="n">365</div><div className="l">Days open</div></div>
        </div>
      </section>
      <section className="block" id="adopt">
        <div className="container">
          <div className="section-head">
            <p className="kicker">Rescue → Adopt → Transform</p>
            <h2>Adopt a Pet</h2>
          </div>
          <div className="dog-grid">
            {dogs.map((d) => <DogCard key={d.id} dog={d} onOpen={setPeek} />)}
          </div>
        </div>
      </section>
      {peek ? <DogPeek dogId={peek} onClose={() => setPeek(null)} /> : null}
    </PublicLayout>
  )
}

export function AdoptPage() {
  return (
    <PublicLayout>
      <section className="block">
        <div className="container">
          <div className="section-head" style={{ textAlign: 'left', maxWidth: 'none' }}>
            <p className="kicker">Adoption</p>
            <h2>Dogs looking for a home</h2>
          </div>
          <AdoptBrowse />
        </div>
      </section>
    </PublicLayout>
  )
}
