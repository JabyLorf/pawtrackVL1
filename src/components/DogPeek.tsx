import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { canHavePuppies, daysIn, statusClass } from '../lib/utils'
import type { Dog } from '../types'
import { useAuth } from '../context/AuthContext'
import { DogPhoto } from './DogCard'
import { Modal } from './Modal'
import { AdoptForm } from './AdoptForm'

export function DogPeek({
  dogId,
  onClose,
}: {
  dogId: string
  onClose: () => void
}) {
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const [stack, setStack] = useState<string[]>([dogId])
  const currentId = stack[stack.length - 1]
  const [dog, setDog] = useState<Dog | null>(null)
  const [pups, setPups] = useState<Dog[]>([])
  const [mother, setMother] = useState<Dog | null>(null)
  const [adoptOpen, setAdoptOpen] = useState(false)

  useEffect(() => {
    supabase.from('dogs').select('*').eq('id', currentId).maybeSingle().then(({ data }) => {
      const d = data as Dog | null
      setDog(d)
      if (d?.mother_id) {
        supabase.from('dogs').select('*').eq('id', d.mother_id).maybeSingle().then((r) => setMother(r.data as Dog | null))
      } else setMother(null)
      if (d && (canHavePuppies(d) || d.sex === 'Female')) {
        supabase.from('dogs').select('*').eq('mother_id', d.id).then((r) => setPups((r.data as Dog[]) || []))
      } else setPups([])
    })
  }, [currentId])

  if (!dog) return null

  const cares = [
    dog.dewormed ? 'Dewormed' : '',
    dog.vax_5in1 ? '5-in-1' : '',
    dog.anti_rabies ? 'Anti-rabies' : '',
    dog.spayed ? (dog.sex === 'Female' ? 'Spayed' : 'Neutered') : '',
  ].filter(Boolean)

  const listedPups = isStaff ? pups : pups.filter((p) => p.status !== 'Deceased' && p.status !== 'Adopted')
  const showPups = dog.sex === 'Female' && (canHavePuppies(dog) || pups.length > 0)

  const Fact = ({ label, value }: { label: string; value: string }) => (
    <div className="fact"><span>{label}</span><b>{value || '—'}</b></div>
  )

  return (
    <>
      <Modal wide onClose={onClose}>
        <div className="create-head">
          <div className="row">
            {stack.length > 1 ? (
              <button className="link" type="button" onClick={() => setStack((s) => s.slice(0, -1))}>
                ← Back
              </button>
            ) : null}
            <b>{dog.name}</b>
          </div>
          <button className="chat-x" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dog-peek-body">
          <div className="dog-peek-top">
            <DogPhoto dog={dog} className="dog-peek-photo" />
            <div>
              <p className="kicker">{dog.status}</p>
              <h2>{dog.name}</h2>
              {mother ? (
                <p className="muted">
                  Puppy of{' '}
                  <button className="link" type="button" onClick={() => setStack((s) => [...s, mother.id])}>{mother.name}</button>
                </p>
              ) : null}
              <p className="muted" style={{ marginTop: 8 }}>{dog.story}</p>
              <div className="facts">
                <Fact label="Sex" value={dog.sex} />
                <Fact label="Age" value={dog.age} />
                <Fact label="Breed" value={dog.breed} />
                <Fact label="Color" value={dog.color} />
                <Fact label="Size" value={dog.size} />
                <Fact label="Temperament" value={dog.temperament} />
                {isStaff ? (
                  <>
                    <Fact label="ID" value={dog.oso_id} />
                    <Fact label="Days in care" value={String(daysIn(dog))} />
                  </>
                ) : null}
              </div>
              {cares.length ? <div className="care-pills">{cares.map((c) => <span key={c}>{c}</span>)}</div> : null}
            </div>
          </div>
          {showPups ? (
            <div className="puppy-block">
              <h3>Her puppies</h3>
              <p className="muted">Tap a puppy to open its record.</p>
              {listedPups.length ? (
                <div className="puppy-grid">
                  {listedPups.map((p) => (
                    <button key={p.id} type="button" className="puppy-card" onClick={() => setStack((s) => [...s, p.id])}>
                      <DogPhoto dog={p} className="puppy-photo" />
                      <b>{p.name}</b>
                      <span>{p.sex} · {p.age}{isStaff ? ` · ${p.status}` : ''}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="empty">No puppies recorded yet.</p>}
            </div>
          ) : null}
          <div className="row wrap" style={{ marginTop: 12 }}>
            {isStaff ? (
              <>
                <button className="btn btn-coral btn-pill" type="button" onClick={() => navigate(`/ops/dogs/${dog.id}`)}>Edit profile</button>
                <span className={`status ${statusClass(dog.status)}`}>{dog.status}</span>
              </>
            ) : dog.status === 'Available' ? (
              <button className="btn btn-accent btn-pill" type="button" onClick={() => setAdoptOpen(true)}>
                I want to adopt {dog.name}
              </button>
            ) : (
              <p className="muted">This dog is not listed for adoption right now.</p>
            )}
          </div>
        </div>
      </Modal>
      {adoptOpen ? <AdoptForm dog={dog} onClose={() => setAdoptOpen(false)} /> : null}
    </>
  )
}
