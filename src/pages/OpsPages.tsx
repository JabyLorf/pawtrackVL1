import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ago, dogMatches, inCare, peso, statusClass } from '../lib/utils'
import type { Activity, Adoption, Dog, DogStatus, Donation, InboxMessage, Profile } from '../types'
import { ADD_STATUSES, AGES, SEXES, SIZES } from '../types'
import { DogPeek } from '../components/DogPeek'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'

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
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{care.length}</div><div className="l">Dogs currently in care</div></div>
        <div className="kpi"><div className="n">{available}</div><div className="l">Available for adoption</div></div>
        <div className="kpi"><div className="n">{pendingApps}</div><div className="l">Pending adoption applications</div></div>
        <div className="kpi"><div className="n">{treatment}</div><div className="l">Dogs under treatment</div></div>
        <div className="kpi"><div className="n">{adopted}</div><div className="l">Successfully adopted</div></div>
        <div className="kpi"><div className="n">{deceased}</div><div className="l">Mortality records</div></div>
        <div className="kpi"><div className="n">{peso(donated)}</div><div className="l">Donations received</div></div>
        <div className="kpi"><div className="n">{unread}</div><div className="l">Unread inbox</div></div>
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

  useEffect(() => {
    if (isNew) return
    supabase.from('dogs').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) setDog(data as Dog)
    })
    supabase.from('dogs').select('*').eq('mother_id', id).then(({ data }) => setPups((data as Dog[]) || []))
  }, [id, isNew])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!dog.name) { setError('Name is required.'); return }
    let photo_url = dog.photo_url || ''
    if (file) {
      const path = `${crypto.randomUUID()}-${file.name.replace(/\s+/g, '-')}`
      const { error: upErr } = await supabase.storage.from('dog-photos').upload(path, file)
      if (upErr) { setError(upErr.message); return }
      photo_url = supabase.storage.from('dog-photos').getPublicUrl(path).data.publicUrl
    }
    const payload = {
      name: dog.name,
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
    if (!id || isNew || !pupName) return
    await supabase.from('dogs').insert({
      name: pupName, sex: 'Female', age: 'Puppy', breed: dog.breed || 'Aspin', size: 'Small',
      status: 'Available', mother_id: id, story: `${pupName} is a puppy of ${dog.name}.`,
    })
    setPupName('')
    const { data } = await supabase.from('dogs').select('*').eq('mother_id', id)
    setPups((data as Dog[]) || [])
  }

  const locked = dog.status === 'Adopted' || dog.status === 'Deceased'
  const femaleAdult = dog.sex === 'Female' && ['Young Adult', 'Adult', 'Senior'].includes(dog.age || '')

  return (
    <div>
      <button className="link" type="button" onClick={() => navigate(-1)}>← Back</button>
      <h1 className="page-h1">{isNew ? 'Add a dog' : `Edit ${dog.name || 'dog'}`}</h1>
      <form className="admin-form" onSubmit={save}>
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
        <label className="row"><input type="checkbox" checked={!!dog.vax_5in1} onChange={(e) => setDog({ ...dog, vax_5in1: e.target.checked })} /> 5-in-1</label>
        <label className="row"><input type="checkbox" checked={!!dog.anti_rabies} onChange={(e) => setDog({ ...dog, anti_rabies: e.target.checked })} /> Anti-rabies</label>
        <label className="row"><input type="checkbox" checked={!!dog.dewormed} onChange={(e) => setDog({ ...dog, dewormed: e.target.checked })} /> Dewormed</label>
        <label className="row"><input type="checkbox" checked={!!dog.spayed} onChange={(e) => setDog({ ...dog, spayed: e.target.checked })} /> Spayed / Neutered</label>
        {error ? <p className="err">{error}</p> : null}
        <button className="btn btn-coral btn-block" type="submit">Save</button>
      </form>
      {!isNew && femaleAdult ? (
        <div className="panel" style={{ marginTop: 16, maxWidth: 720 }}>
          <h3>Her puppies</h3>
          {pups.map((p) => <p key={p.id}><Link to={`/ops/dogs/${p.id}`}>{p.name}</Link> · {p.status}</p>)}
          <form onSubmit={addPuppy} className="row wrap" style={{ marginTop: 10 }}>
            <input placeholder="Puppy name" value={pupName} onChange={(e) => setPupName(e.target.value)} />
            <button className="btn btn-coral" type="submit">Add puppy</button>
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

  function table(list: typeof rows, pending: boolean, empty: string) {
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
          <div className="create-head"><b>Adoption application</b><button className="chat-x" type="button" onClick={() => setPeek(null)}>×</button></div>
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
  return (
    <div>
      <h1 className="page-h1">Donations</h1>
      <p className="page-sub">Gifts are added to the total as soon as they are sent.</p>
      <div className="kpi" style={{ maxWidth: 240, marginBottom: 16 }}><div className="n">{peso(total)}</div><div className="l">Donations received</div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>From</th><th>Amount</th><th>Purpose</th><th>Method</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}><td>{d.name}</td><td>{peso(Number(d.amount))}</td><td>{d.purpose}</td><td>{d.method}</td><td>{ago(d.created_at)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function InboxPage() {
  const [rows, setRows] = useState<InboxMessage[]>([])
  async function load() {
    const { data } = await supabase.from('inbox_messages').select('*').order('created_at', { ascending: false })
    setRows((data as InboxMessage[]) || [])
  }
  useEffect(() => { load() }, [])
  async function read(id: string) {
    await supabase.from('inbox_messages').update({ read: true }).eq('id', id)
    load()
  }
  return (
    <div>
      <h1 className="page-h1">Inbox</h1>
      <p className="page-sub">Shared inbox for admin and staff. Adoption applications and donations show up here.</p>
      {rows.map((m) => (
        <div className="panel" key={m.id} style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b>{m.subject}</b>{' '}
              <span className={`status ${m.kind === 'adoption' ? 'pending' : m.kind === 'donation' ? 'active' : 'adopted'}`}>{m.kind}</span>
              {!m.read ? <span className="status pending"> New</span> : null}
              <div className="muted">{m.name} · {m.email} · {ago(m.created_at)}</div>
            </div>
            {!m.read ? <button className="btn btn-ghost" type="button" onClick={() => read(m.id)}>Mark read</button> : null}
          </div>
          <p style={{ marginTop: 10 }}>{m.body}</p>
        </div>
      ))}
    </div>
  )
}

export function StaffAdminPage() {
  const { isAdmin } = useAuth()
  const [list, setList] = useState<Profile[]>([])
  useEffect(() => {
    supabase.from('profiles').select('*').in('role', ['staff', 'admin']).then(({ data }) => setList((data as Profile[]) || []))
  }, [])
  if (!isAdmin) return <p>Admin only.</p>
  return (
    <div>
      <h1 className="page-h1">Staff & Volunteers</h1>
      <p className="page-sub">Create the account in Supabase Authentication, then promote it with supabase/promote-staff.sql.</p>
      {list.map((u) => (
        <div className="panel" key={u.id} style={{ marginBottom: 8 }}>
          <b>{u.display_name}</b>
          <div className="muted">{u.email} · {u.role}{u.status !== 'active' ? ` · ${u.status}` : ''}</div>
        </div>
      ))}
    </div>
  )
}
