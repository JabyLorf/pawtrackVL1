import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ago, dogMatches, inCare, peso, statusClass } from '../lib/utils'
import type { Activity, Adoption, Dog, DogStatus, Donation, InboxMessage, Profile } from '../types'
import { ADD_STATUSES, AGES, SEXES, SIZES } from '../types'
import { DogPeek } from '../components/DogPeek'
import { DogPhoto } from '../components/DogCard'
import { useDevice } from '../context/DeviceContext'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { ClipboardList, HandCoins, HeartHandshake, Inbox, PawPrint, Stethoscope, Syringe, Tag, UserCheck, UserX, X, Reply, Users, Check, Loader2, Send } from 'lucide-react'

function Kpi({ icon, n, l, tone }: { icon: ReactNode; n: ReactNode; l: string; tone?: 'warn' | 'muted' }) {
  return (
    <div className={'kpi' + (tone ? ' ' + tone : '')}>
      <span className="kpi-icon">{icon}</span>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  )
}

export function DashboardPage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  const [adoptions, setAdoptions] = useState<Adoption[]>([])
  const [donations, setDonations] = useState<Donation[]>([])
  const [unread, setUnread] = useState(0)
  const [log, setLog] = useState<Activity[]>([])

  useEffect(() => {
    supabase.from('dogs').select('*').then(({ data }) => setDogs((data as Dog[]) || []))
    supabase.from('adoptions').select('*').then(({ data }) => setAdoptions((data as Adoption[]) || []))
    supabase.from('donations').select('*').then(({ data }) => setDonations((data as Donation[]) || []))
    supabase.from('inbox_messages').select('id', { count: 'exact', head: true }).eq('read', false).then(({ count }) => setUnread(count || 0))
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => setLog((data as Activity[]) || []))
  }, [])

  const care = dogs.filter(inCare)
  const available = dogs.filter((d) => d.status === 'Available').length
  const treatment = dogs.filter((d) => d.status === 'Under Treatment').length
  const adopted = dogs.filter((d) => d.status === 'Adopted').length
  const deceased = dogs.filter((d) => d.status === 'Deceased').length
  const pendingApps = adoptions.filter((a) => a.status === 'pending').length
  const donated = donations.reduce((s, d) => s + Number(d.amount), 0)
  const counts: Record<string, number> = {}
  dogs.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1 })
  const max = Math.max(1, ...Object.values(counts))

  return (
    <div>
      <h1 className="page-h1">Dashboard</h1>
      <p className="page-sub">A quick look at the shelter today.</p>
      <div className="kpi-grid">
        <Kpi icon={<PawPrint size={18} />} n={care.length} l="Dogs in care" />
        <Kpi icon={<Tag size={18} />} n={available} l="Available for adoption" />
        <Kpi icon={<ClipboardList size={18} />} n={pendingApps} l="Pending applications" tone="warn" />
        <Kpi icon={<Syringe size={18} />} n={treatment} l="Under treatment" />
        <Kpi icon={<HeartHandshake size={18} />} n={adopted} l="Adopted" />
        <Kpi icon={<Stethoscope size={18} />} n={deceased} l="Mortality records" tone="muted" />
        <Kpi icon={<HandCoins size={18} />} n={peso(donated)} l="Donations received" />
        <Kpi icon={<Inbox size={18} />} n={unread} l="Unread messages" tone="warn" />
      </div>
      <div className="dash-grid">
        <div className="panel">
          <h3>Shelter population by status</h3>
          {Object.entries(counts).map(([k, n]) => (
            <div className="bar-row" key={k}><span>{k}</span><div className="bar"><i style={{ width: `${Math.round((n / max) * 100)}%` }} /></div><b>{n}</b></div>
          ))}
        </div>
        <div className="panel">
          <h3>Activity log</h3>
          {log.length ? log.map((a) => <div className="attn" key={a.id}><div>{a.text}<div className="muted">{ago(a.created_at)}</div></div></div>) : <p className="empty">No activity yet.</p>}
        </div>
      </div>
    </div>
  )
}

function DogTable({
  list,
  extra,
}: {
  list: Dog[]
  extra?: (d: Dog) => ReactNode
}) {
  const [peek, setPeek] = useState<string | null>(null)
  const { kind } = useDevice()

  if (kind === 'phone') {
    return (
      <>
        <div className="dog-list">
          {list.length ? list.map((d) => (
            <div className="dog-row" key={d.id}>
              <button className="dog-row-main" type="button" onClick={() => setPeek(d.id)} aria-label={`View ${d.name}`}>
                <DogPhoto dog={d} className="dog-row-photo" />
                <div className="dog-row-info">
                  <div className="dog-row-top">
                    <b>{d.name}</b>
                    <span className={`status ${statusClass(d.status)}`}>{d.status}</span>
                  </div>
                  <div className="dog-row-meta">{d.sex} · {d.age} · {d.breed}</div>
                  {d.color ? <div className="dog-row-meta">{d.color}</div> : null}
                </div>
              </button>
              <div className="dog-row-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setPeek(d.id)}>View</button>
                <Link className="btn btn-ghost" to={`/ops/dogs/${d.id}`}>Edit</Link>
                {extra?.(d)}
              </div>
            </div>
          )) : <p className="empty panel">No records.</p>}
        </div>
        {peek ? <DogPeek dogId={peek} onClose={() => setPeek(null)} /> : null}
      </>
    )
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Sex</th><th>Age</th><th>Color</th><th>Breed</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {list.length ? list.map((d) => (
              <tr key={d.id}>
                <td><b>{d.name}</b></td>
                <td>{d.sex}</td>
                <td>{d.age}</td>
                <td>{d.color || '—'}</td>
                <td>{d.breed}</td>
                <td><span className={`status ${statusClass(d.status)}`}>{d.status}</span></td>
                <td>
                  <div className="inline">
                    <button className="btn btn-ghost" type="button" onClick={() => setPeek(d.id)}>View</button>
                    <Link className="btn btn-ghost" to={`/ops/dogs/${d.id}`}>Edit</Link>
                    {extra?.(d)}
                  </div>
                </td>
              </tr>
            )) : <tr><td colSpan={7} className="empty">No records.</td></tr>}
          </tbody>
        </table>
      </div>
      {peek ? <DogPeek dogId={peek} onClose={() => setPeek(null)} /> : null}
    </>
  )
}

export function DogsPage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  async function load() {
    const { data } = await supabase.from('dogs').select('*').order('name')
    setDogs((data as Dog[]) || [])
  }
  useEffect(() => { load() }, [])

  async function mark(id: string, status: DogStatus) {
    const patch: Partial<Dog> = { status }
    if (status === 'Deceased') patch.died_at = new Date().toISOString()
    if (status === 'Available') patch.died_at = null
    await supabase.from('dogs').update(patch).eq('id', id)
    load()
  }

  const rows = dogs.filter(inCare).filter((d) => dogMatches(d, q))
  return (
    <div>
      <h1 className="page-h1">Pet Register</h1>
      <p className="page-sub">Dogs in care. Adopted and mortality records live in their own tables.</p>
      <div className="staff-toolbar">
        <input className="staff-search" placeholder="Search by name, age, color, or sex" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-coral" type="button" onClick={() => navigate('/ops/dogs/new')}>Add a dog</button>
      </div>
      <DogTable
        list={rows}
        extra={(d) => (
          <>
            <button className="btn btn-ghost" type="button" onClick={() => mark(d.id, 'Adopted')}>Mark adopted</button>
            <button className="btn btn-ghost" type="button" onClick={() => mark(d.id, 'Deceased')}>Mark deceased</button>
          </>
        )}
      />
    </div>
  )
}

export function AdoptedPage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  useEffect(() => {
    supabase.from('dogs').select('*').eq('status', 'Adopted').then(({ data }) => setDogs((data as Dog[]) || []))
  }, [])
  async function restore(id: string) {
    await supabase.from('dogs').update({ status: 'Available' }).eq('id', id)
    setDogs((cur) => cur.filter((d) => d.id !== id))
  }
  return (
    <div>
      <h1 className="page-h1">Adopted</h1>
      <p className="page-sub">Dogs that have been adopted.</p>
      <DogTable list={dogs} extra={(d) => <button className="btn btn-ghost" type="button" onClick={() => restore(d.id)}>Restore</button>} />
    </div>
  )
}

export function MortalityPage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  useEffect(() => {
    supabase.from('dogs').select('*').eq('status', 'Deceased').then(({ data }) => setDogs((data as Dog[]) || []))
  }, [])
  async function restore(id: string) {
    await supabase.from('dogs').update({ status: 'Available', died_at: null }).eq('id', id)
    setDogs((cur) => cur.filter((d) => d.id !== id))
  }
  return (
    <div>
      <h1 className="page-h1">Mortality</h1>
      <p className="page-sub">Deceased dogs are kept here and are not listed for adoption.</p>
      <DogTable list={dogs} extra={(d) => <button className="btn btn-ghost" type="button" onClick={() => restore(d.id)}>Restore</button>} />
    </div>
  )
}

export function DogEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const [dog, setDog] = useState<Partial<Dog>>({
    name: '', sex: 'Female', age: 'Young Adult', breed: 'Aspin', color: '', size: 'Medium',
    status: 'Available', vax_5in1: true, anti_rabies: true, dewormed: true, spayed: false,
    temperament: '', story: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [pups, setPups] = useState<Dog[]>([])
  const [pupName, setPupName] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingPup, setAddingPup] = useState(false)
  // A ref blocks a second tap before React re-renders the disabled button.
  const busy = useRef(false)

  useEffect(() => {
    if (isNew) return
    supabase.from('dogs').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) setDog(data as Dog)
    })
    supabase.from('dogs').select('*').eq('mother_id', id).then(({ data }) => setPups((data as Dog[]) || []))
  }, [id, isNew])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (!dog.name?.trim()) { setError('Name is required.'); return }
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await saveDog()
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  async function saveDog() {
    let photo_url = dog.photo_url || ''
    if (file) {
      const path = `${crypto.randomUUID()}-${file.name.replace(/\s+/g, '-')}`
      const { error: upErr } = await supabase.storage.from('dog-photos').upload(path, file)
      if (upErr) { setError(upErr.message); return }
      photo_url = supabase.storage.from('dog-photos').getPublicUrl(path).data.publicUrl
    }
    const payload = {
      name: dog.name!.trim(),
      sex: dog.sex,
      age: dog.age,
      breed: dog.breed || 'Aspin',
      color: dog.color || '',
      size: dog.size || 'Medium',
      status: dog.status || 'Available',
      vax_5in1: !!dog.vax_5in1,
      anti_rabies: !!dog.anti_rabies,
      dewormed: !!dog.dewormed,
      spayed: !!dog.spayed,
      temperament: dog.temperament || '',
      story: dog.story || '',
      photo_url,
    }
    if (isNew) {
      const { data, error: err } = await supabase.from('dogs').insert(payload).select('id').single()
      if (err) { setError(err.message); return }
      navigate(`/ops/dogs/${data.id}`)
    } else {
      const { error: err } = await supabase.from('dogs').update(payload).eq('id', id)
      if (err) { setError(err.message); return }
      navigate('/ops/dogs')
    }
  }

  async function addPuppy(e: FormEvent) {
    e.preventDefault()
    if (!id || isNew || !pupName.trim() || busy.current) return
    busy.current = true
    setAddingPup(true)
    await supabase.from('dogs').insert({
      name: pupName, sex: 'Female', age: 'Puppy', breed: dog.breed || 'Aspin', size: 'Small',
      status: 'Available', mother_id: id, story: `${pupName} is a puppy of ${dog.name}.`,
    })
    setPupName('')
    const { data } = await supabase.from('dogs').select('*').eq('mother_id', id)
    setPups((data as Dog[]) || [])
    busy.current = false
    setAddingPup(false)
  }

  const locked = dog.status === 'Adopted' || dog.status === 'Deceased'
  const femaleAdult = dog.sex === 'Female' && ['Young Adult', 'Adult', 'Senior'].includes(dog.age || '')

  return (
    <div>
      <button className="link" type="button" onClick={() => navigate(-1)}>← Back</button>
      <h1 className="page-h1">{isNew ? 'Add a dog' : `Edit ${dog.name || 'dog'}`}</h1>
      <form className="admin-form" onSubmit={save} aria-busy={saving}>
        <fieldset className="plain" disabled={saving}>
        {dog.photo_url ? <img src={dog.photo_url} alt="" style={{ width: 160, aspectRatio: '1', objectFit: 'cover', borderRadius: 12 }} /> : null}
        <label>Photo</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="form-grid">
          <div><label>Name *</label><input value={dog.name || ''} onChange={(e) => setDog({ ...dog, name: e.target.value })} /></div>
          <div>
            <label>Status</label>
            {locked ? <p className="muted">{dog.status}</p> : (
              <select value={dog.status} onChange={(e) => setDog({ ...dog, status: e.target.value as DogStatus })}>
                {ADD_STATUSES.concat(dog.status && !ADD_STATUSES.includes(dog.status as DogStatus) ? [dog.status as DogStatus] : []).map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </div>
          <div><label>Sex</label><select value={dog.sex} onChange={(e) => setDog({ ...dog, sex: e.target.value as Dog['sex'] })}>{SEXES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Age</label><select value={dog.age} onChange={(e) => setDog({ ...dog, age: e.target.value as Dog['age'] })}>{AGES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Breed</label><input value={dog.breed || ''} onChange={(e) => setDog({ ...dog, breed: e.target.value })} /></div>
          <div><label>Color</label><input value={dog.color || ''} onChange={(e) => setDog({ ...dog, color: e.target.value })} /></div>
          <div><label>Size</label><select value={dog.size} onChange={(e) => setDog({ ...dog, size: e.target.value as Dog['size'] })}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Temperament</label><input value={dog.temperament || ''} onChange={(e) => setDog({ ...dog, temperament: e.target.value })} /></div>
          <div className="full"><label>Story</label><textarea rows={4} value={dog.story || ''} onChange={(e) => setDog({ ...dog, story: e.target.value })} /></div>
        </div>
        <fieldset className="check-group">
          <legend>Health</legend>
          <label className="check"><input type="checkbox" checked={!!dog.vax_5in1} onChange={(e) => setDog({ ...dog, vax_5in1: e.target.checked })} /> 5-in-1 vaccine</label>
          <label className="check"><input type="checkbox" checked={!!dog.anti_rabies} onChange={(e) => setDog({ ...dog, anti_rabies: e.target.checked })} /> Anti-rabies</label>
          <label className="check"><input type="checkbox" checked={!!dog.dewormed} onChange={(e) => setDog({ ...dog, dewormed: e.target.checked })} /> Dewormed</label>
          <label className="check"><input type="checkbox" checked={!!dog.spayed} onChange={(e) => setDog({ ...dog, spayed: e.target.checked })} /> Spayed / Neutered</label>
        </fieldset>
        </fieldset>
        {error ? <p className="err">{error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
          {saving ? <><Loader2 size={17} className="spin" /> {file ? 'Uploading photo and saving…' : 'Saving…'}</> : isNew ? 'Add dog' : 'Save changes'}
        </button>
      </form>
      {!isNew && femaleAdult ? (
        <div className="panel" style={{ marginTop: 16, maxWidth: 720 }}>
          <h3>Her puppies</h3>
          {pups.map((p) => <p key={p.id}><Link to={`/ops/dogs/${p.id}`}>{p.name}</Link> · {p.status}</p>)}
          <form onSubmit={addPuppy} className="row wrap" style={{ marginTop: 10 }}>
            <input placeholder="Puppy name" value={pupName} onChange={(e) => setPupName(e.target.value)} disabled={addingPup} />
            <button className="btn btn-primary" type="submit" disabled={addingPup}>{addingPup ? <><Loader2 size={16} className="spin" /> Adding…</> : 'Add puppy'}</button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

export function AdoptionsPage() {
  const [rows, setRows] = useState<(Adoption & { dogs?: { name: string } | null })[]>([])
  const [peek, setPeek] = useState<Adoption | null>(null)
  const [idUrl, setIdUrl] = useState('')

  async function load() {
    const { data } = await supabase.from('adoptions').select('*, dogs(name)').order('created_at', { ascending: false })
    setRows((data as typeof rows) || [])
  }
  useEffect(() => { load() }, [])

  async function decide(id: string, how: 'approve' | 'reject') {
    const fn = how === 'approve' ? 'approve_adoption' : 'reject_adoption'
    await supabase.rpc(fn, { p_id: id })
    load()
  }

  async function open(a: Adoption) {
    setPeek(a)
    if (a.id_photo_url) {
      const { data } = await supabase.storage.from('id-photos').createSignedUrl(a.id_photo_url, 60)
      setIdUrl(data?.signedUrl || '')
    } else setIdUrl('')
  }

  const { kind } = useDevice()

  function table(list: typeof rows, pending: boolean, empty: string) {
    if (kind === 'phone') {
      return (
        <div className="dog-list">
          {list.length ? list.map((a) => (
            <div className="dog-row" key={a.id}>
              <div className="dog-row-main">
                <span className="person-avatar">{a.applicant.slice(0, 1).toUpperCase()}</span>
                <div className="dog-row-info">
                  <div className="dog-row-top">
                    <b>{a.applicant}</b>
                    <span className={`status ${statusClass(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="dog-row-meta">Wants to adopt <b>{a.dogs?.name || 'a dog'}</b></div>
                  <div className="dog-row-meta"><a href={`tel:${a.phone}`}>{a.phone}</a> · {ago(a.created_at)} · {a.id_photo_url ? 'ID attached' : 'No ID'}</div>
                  {a.note ? <div className="dog-row-note">{a.note}</div> : null}
                </div>
              </div>
              <div className="dog-row-actions">
                <button className="btn btn-ghost" type="button" onClick={() => open(a)}>View</button>
                {pending ? (
                  <>
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => decide(a.id, 'approve')}>Approve</button>
                    <button className="btn btn-remove" type="button" onClick={() => decide(a.id, 'reject')}>Reject</button>
                  </>
                ) : null}
              </div>
            </div>
          )) : <p className="empty panel">{empty}</p>}
        </div>
      )
    }
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Applicant</th><th>Dog</th><th>Telephone</th><th>Who wants to adopt</th><th>ID</th><th>When</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {list.length ? list.map((a) => (
              <tr key={a.id}>
                <td>{a.applicant}</td>
                <td>{a.dogs?.name || '—'}</td>
                <td>{a.phone}</td>
                <td>{a.note}</td>
                <td><span className={`status ${a.id_photo_url ? 'active' : 'adopted'}`}>{a.id_photo_url ? 'Yes' : 'No'}</span></td>
                <td>{ago(a.created_at)}</td>
                <td><span className={`status ${statusClass(a.status)}`}>{a.status}</span></td>
                <td>
                  <div className="inline">
                    <button className="btn btn-ghost" type="button" onClick={() => open(a)}>View</button>
                    {pending ? (
                      <>
                        <button className="btn btn-coral" type="button" onClick={() => decide(a.id, 'approve')}>Approve</button>
                        <button className="btn btn-ghost" type="button" onClick={() => decide(a.id, 'reject')}>Reject</button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : <tr><td colSpan={8} className="empty">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    )
  }

  const pending = rows.filter((a) => a.status === 'pending')
  const approved = rows.filter((a) => a.status === 'approved')
  const rejected = rows.filter((a) => a.status === 'rejected')

  return (
    <div>
      <h1 className="page-h1">Adoptions</h1>
      <h3 className="table-h">Pending</h3>
      {table(pending, true, 'No pending applications.')}
      <h3 className="table-h">Approved</h3>
      {table(approved, false, 'No approved adoptions yet.')}
      <h3 className="table-h">Rejected</h3>
      {table(rejected, false, 'No rejected applications.')}
      {peek ? (
        <Modal onClose={() => setPeek(null)}>
          <div className="create-head"><b>Adoption application</b><button className="chat-x" type="button" onClick={() => setPeek(null)} aria-label="Close"><X size={18} /></button></div>
          <div className="adopt-card-body">
            <div className="adopt-review">
              <div><span>Applicant</span><b>{peek.applicant}</b></div>
              <div><span>Telephone</span><b>{peek.phone}</b></div>
              <div><span>Who wants to adopt</span><b>{peek.note}</b></div>
            </div>
            {idUrl ? <div className="adopt-id-preview on" style={{ marginTop: 12 }}><img src={idUrl} alt="Valid ID" /></div> : <p className="muted">No ID photo.</p>}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

export function DonationsPage() {
  const [rows, setRows] = useState<Donation[]>([])
  useEffect(() => {
    supabase.from('donations').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows((data as Donation[]) || []))
  }, [])
  const total = rows.reduce((s, d) => s + Number(d.amount), 0)
  const { kind } = useDevice()
  return (
    <div>
      <h1 className="page-h1">Donations</h1>
      <p className="page-sub">Gifts are added to the total as soon as they are sent.</p>
      <div className="kpi" style={{ maxWidth: 240, marginBottom: 16 }}><div className="n">{peso(total)}</div><div className="l">Donations received</div></div>
      {kind === 'phone' ? (
        <div className="dog-list">
          {rows.length ? rows.map((d) => (
            <div className="dog-row" key={d.id}>
              <div className="dog-row-main">
                <span className="person-avatar"><HandCoins size={18} /></span>
                <div className="dog-row-info">
                  <div className="dog-row-top">
                    <b>{d.name}</b>
                    <span className="amount">{peso(Number(d.amount))}</span>
                  </div>
                  <div className="dog-row-meta">{d.purpose} · {d.method}</div>
                  <div className="dog-row-meta">{ago(d.created_at)}</div>
                  {d.message ? <div className="dog-row-note">{d.message}</div> : null}
                </div>
              </div>
            </div>
          )) : <p className="empty panel">No donations yet.</p>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>From</th><th>Amount</th><th>Purpose</th><th>Method</th><th>When</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((d) => (
                <tr key={d.id}><td>{d.name}</td><td>{peso(Number(d.amount))}</td><td>{d.purpose}</td><td>{d.method}</td><td>{ago(d.created_at)}</td></tr>
              )) : <tr><td colSpan={5} className="empty">No donations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<string, string> = { contact: 'Message', adoption: 'Adoption', donation: 'Donation', staff: 'Staff application' }
const KIND_CLASS: Record<string, string> = { contact: 'adopted', adoption: 'pending', donation: 'active', staff: 'pending' }

type InboxReply = { id: string; message_id: string; body: string; sent_by_name: string; created_at: string }

const canEmail = (email: string) => /^[^\s@]+@[^\s@]+$/.test((email || '').trim())

function MessageCard({ m, replies, onRead, onReplied }: {
  m: InboxMessage
  replies: InboxReply[]
  onRead: (id: string) => void
  onReplied: (r: InboxReply) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const busy = useRef(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (busy.current || !text.trim()) return
    busy.current = true
    setSending(true)
    setError('')
    const { data, error: err } = await supabase.functions.invoke('notify-admin', {
      body: { action: 'reply', message_id: m.id, body: text.trim() },
    })
    busy.current = false
    setSending(false)
    if (err || data?.error) {
      let msg = data?.error as string | undefined
      if (!msg && err && 'context' in err) {
        try { msg = (await (err as { context: Response }).context.json()).error } catch { /* ignore */ }
      }
      setError(msg || 'The reply could not be sent. Please try again.')
      return
    }
    if (data?.reply) onReplied(data.reply as InboxReply)
    setText('')
    setOpen(false)
    setSent(true)
  }

  return (
    <div className={'panel msg' + (m.read ? '' : ' unread')}>
      <div className="msg-head">
        <span className={`status ${KIND_CLASS[m.kind] || 'adopted'}`}>{KIND_LABEL[m.kind] || m.kind}</span>
        {!m.read ? <span className="msg-new">New</span> : null}
        {replies.length ? <span className="msg-replied"><Check size={12} /> Replied</span> : null}
        <span className="msg-time">{ago(m.created_at)}</span>
      </div>
      <b className="msg-subject">{m.subject}</b>
      <div className="muted msg-from">{m.name}{m.email ? ` · ${m.email}` : ' · no email given'}</div>
      <p className="msg-body">{m.body}</p>

      {replies.map((r) => (
        <div className="msg-reply" key={r.id}>
          <div className="msg-reply-head"><Reply size={13} /> {r.sent_by_name || 'Staff'} replied · {ago(r.created_at)}</div>
          <p>{r.body}</p>
        </div>
      ))}

      {open ? (
        <form className="msg-compose" onSubmit={send}>
          <label className="sr-only" htmlFor={`reply-${m.id}`}>Reply to {m.name}</label>
          <textarea
            id={`reply-${m.id}`}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Write your reply to ${m.name}…`}
            disabled={sending}
            autoFocus
          />
          <div className="muted msg-to">Sends from the PawTrack email to {m.email}</div>
          {error ? <p className="err">{error}</p> : null}
          <div className="inline">
            <button className="btn btn-primary btn-sm" type="submit" disabled={sending || !text.trim()}>
              {sending ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Send size={15} /> Send reply</>}
            </button>
            <button className="btn btn-ghost" type="button" disabled={sending} onClick={() => { setOpen(false); setError('') }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="inline">
          {canEmail(m.email) ? (
            <button className="btn btn-primary btn-sm" type="button" onClick={() => { setOpen(true); setSent(false) }}>
              <Reply size={15} /> Reply
            </button>
          ) : null}
          {m.kind === 'staff' ? <Link className="btn btn-light btn-sm" to="/ops/staff"><Users size={15} /> Review application</Link> : null}
          {!m.read ? <button className="btn btn-ghost" type="button" onClick={() => onRead(m.id)}><Check size={14} /> Mark read</button> : null}
          {sent ? <span className="msg-sent"><Check size={14} /> Reply sent</span> : null}
        </div>
      )}
    </div>
  )
}

export function InboxPage() {
  const [rows, setRows] = useState<InboxMessage[]>([])
  const [replies, setReplies] = useState<InboxReply[]>([])
  async function load() {
    const [{ data }, { data: r }] = await Promise.all([
      supabase.from('inbox_messages').select('*').order('created_at', { ascending: false }),
      supabase.from('inbox_replies').select('*').order('created_at'),
    ])
    setRows((data as InboxMessage[]) || [])
    setReplies((r as InboxReply[]) || [])
  }
  useEffect(() => { load() }, [])
  async function read(id: string) {
    await supabase.from('inbox_messages').update({ read: true }).eq('id', id)
    load()
  }
  return (
    <div>
      <h1 className="page-h1">Inbox</h1>
      <p className="page-sub">Messages, adoption applications, donations and staff applications. Each one is also emailed to the admin.</p>
      {rows.length ? rows.map((m) => (
        <MessageCard
          key={m.id}
          m={m}
          replies={replies.filter((r) => r.message_id === m.id)}
          onRead={read}
          onReplied={(r) => {
            setReplies((cur) => [...cur, r])
            setRows((cur) => cur.map((x) => (x.id === m.id ? { ...x, read: true } : x)))
          }}
        />
      )) : <p className="empty panel">No messages yet.</p>}
    </div>
  )
}

export function StaffAdminPage() {
  const { isAdmin, profile } = useAuth()
  const [team, setTeam] = useState<Profile[]>([])
  const [apps, setApps] = useState<Profile[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active').in('role', ['staff', 'admin', 'volunteer']).order('display_name'),
      supabase.rpc('staff_applications'),
    ])
    setTeam((t as Profile[]) || [])
    setApps((a as Profile[]) || [])
  }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function decide(id: string, approve: boolean) {
    setBusy(id)
    setError('')
    const { error: err } = await supabase.rpc('decide_staff_application', { p_id: id, p_approve: approve })
    setBusy(null)
    if (err) { setError(err.message); return }
    load()
  }

  if (!isAdmin) return <p className="empty">Only administrators can manage staff.</p>
  return (
    <div>
      <h1 className="page-h1">Staff & Volunteers</h1>
      <p className="page-sub">Review staff applications and see who has access to the staff desk.</p>
      {error ? <p className="err">{error}</p> : null}

      <h2 className="table-h">Pending applications {apps.length ? <span className="nav-badge">{apps.length}</span> : null}</h2>
      {apps.length ? apps.map((u) => (
        <div className="panel person" key={u.id}>
          <span className="person-avatar">{u.display_name.slice(0, 1).toUpperCase()}</span>
          <div className="person-info">
            <b>{u.display_name}</b>
            <div className="muted">@{u.username} · {u.email} · applied {ago(u.created_at)}</div>
          </div>
          <div className="inline">
            <button className="btn btn-primary btn-sm" type="button" disabled={busy === u.id} onClick={() => decide(u.id, true)}>
              <UserCheck size={15} /> Approve
            </button>
            <button className="btn btn-remove btn-sm" type="button" disabled={busy === u.id} onClick={() => decide(u.id, false)}>
              <UserX size={15} /> Reject
            </button>
          </div>
        </div>
      )) : <p className="empty">No applications waiting. People apply from the staff sign-in page.</p>}

      <h2 className="table-h">Active team</h2>
      {team.map((u) => (
        <div className="panel person" key={u.id}>
          <span className="person-avatar">{u.display_name.slice(0, 1).toUpperCase()}</span>
          <div className="person-info">
            <b>{u.display_name}{u.id === profile?.id ? ' (you)' : ''}</b>
            <div className="muted">@{u.username} · {u.email}</div>
          </div>
          <span className={`status ${u.role === 'admin' ? 'pending' : 'active'}`}>{u.role === 'admin' ? 'Administrator' : u.role === 'volunteer' ? 'Volunteer' : 'Staff'}</span>
        </div>
      ))}
    </div>
  )
}
