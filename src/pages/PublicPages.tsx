import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isListed } from '../lib/utils'
import type { Dog } from '../types'
import { DogCard } from '../components/DogCard'
import { DogPeek } from '../components/DogPeek'
import { AdoptBrowse } from '../components/AdoptBrowse'
import { PublicLayout } from '../components/PublicLayout'
import { isIOS, showAppLinks } from '../lib/app'
import { GetAppButtons } from '../components/IosInstall'

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
      <section className="hero hero-photos">
        <div className="hero-bg" aria-hidden="true">
          <span style={{ backgroundImage: 'url(/hero/shelter-1.webp)' }} />
          <span style={{ backgroundImage: 'url(/hero/shelter-2.webp)' }} />
        </div>
        <div className="container">
          <span className="kicker" style={{ color: '#fde68a' }}>Non-profit animal rescue · Ormoc City</span>
          <h1>Their second chance starts with you</h1>
          <p className="tagline">Rescue Love. Adopt Hope. Don't Shop. We rescue, rehabilitate, and rehome abandoned, neglected, and abused dogs at the Ormoc City Dog Pound in Brgy. Cagbuhangin.</p>
          {showAppLinks ? (
            <div className="app-cta">
              <GetAppButtons className="btn btn-accent" iphoneClassName="btn btn-ghost-light" size={18} both androidLabel="Download the Android app" />
              <small>{isIOS ? 'Free · works from Safari, no App Store needed' : 'Free · Android 6.0 or newer · about 5 MB'}</small>
            </div>
          ) : null}
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
