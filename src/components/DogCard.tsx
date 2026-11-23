import type { Dog } from '../types'
import { PawPrint } from 'lucide-react'

export function DogPhoto({ dog, className }: { dog: Pick<Dog, 'name' | 'photo_url'>; className: string }) {
  return (
    <div className={className}>
      {dog.photo_url ? <img src={dog.photo_url} alt={dog.name} /> : <PawPrint size={40} strokeWidth={1.5} />}
    </div>
  )
}

export function DogCard({ dog, onOpen }: { dog: Dog; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="dog-card" onClick={() => onOpen(dog.id)}>
      <DogPhoto dog={dog} className="dog-photo" />
      <div className="dog-body">
        <h3>{dog.name}</h3>
        <div className="dog-meta">
          <div><b>Sex:</b> {dog.sex}</div>
          <div><b>Age:</b> {dog.age}</div>
          <div><b>Breed:</b> {dog.breed}</div>
          <div><b>Color:</b> {dog.color}</div>
        </div>
      </div>
    </button>
  )
}
