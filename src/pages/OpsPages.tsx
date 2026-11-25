import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ago, calendarDaysSince, dogMatches, localDate, inCare, isListed, peso, statusClass } from '../lib/utils'
import type { Activity, Adoption, Dog, DogStatus, Donation, InboxMessage, Profile } from '../types'
import { ADD_STATUSES, AGES, INTAKE_REASONS, SEXES, SIZES, type Intake, type IntakeReason } from '../types'
import { DogPeek } from '../components/DogPeek'
import { DogPhoto } from '../components/DogCard'
import { useDevice } from '../context/DeviceContext'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { ConfirmDialog, useConfirm } from '../components/ConfirmDialog'
import { useLeaveGuard } from '../components/useLeaveGuard'
import { ClipboardList, HandCoins, HeartHandshake, Inbox, PawPrint, Stethoscope, Syringe, Tag, UserCheck, UserX, X, Reply, Users, Check, Loader2, Send, Trash2, RotateCcw, Plus, CheckCircle2, Image as ImageIcon, Pencil } from 'lucide-react'

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
  const donated = donations.filter((d) => d.status === 'confirmed').reduce((s, d) => s + Number(d.amount), 0)
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
        <Kpi icon={<HandCoins size={18} />} n={peso(donated)} l="Confirmed donations" />
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
  openId,
  onChanged,
}: {
  list: Dog[]
  extra?: (d: Dog) => ReactNode
  openId?: string | null
  onChanged?: () => void
}) {
  const [peek, setPeek] = useState<string | null>(openId || null)
  const [confirm, setConfirm] = useState<Dog | null>(null)
  const [undo, setUndo] = useState<Dog | null>(null)
  const { kind } = useDevice()
  const { isAdmin } = useAuth()

  useEffect(() => { if (openId) setPeek(openId) }, [openId])

  async function remove(d: Dog) {
    const { error } = await supabase.rpc('delete_dog', { p_id: d.id })
    if (error) return error.message
    setConfirm(null)
    setUndo(d)
    onChanged?.()
    return null
  }

  async function restore(d: Dog) {
    await supabase.rpc('restore_dog', { p_id: d.id })
    setUndo(null)
    onChanged?.()
  }

  const actions = (d: Dog) => (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setPeek(d.id)}>View</button>
      <Link className="btn btn-ghost" to={`/ops/dogs/${d.id}`}>Edit</Link>
      {extra?.(d)}
      {isAdmin ? (
        <button className="btn btn-remove" type="button" onClick={() => setConfirm(d)} aria-label={`Delete ${d.name}`}>
          <Trash2 size={14} /> Delete
        </button>
      ) : null}
    </>
  )

  const banner = undo ? (
    <div className="flash" role="status">
      <Trash2 size={16} />
      <span><b>{undo.name}</b> moved to Recently deleted.</span>
      <button className="link" type="button" onClick={() => restore(undo)}>Undo</button>
      <button className="flash-x" type="button" aria-label="Dismiss" onClick={() => setUndo(null)}><X size={16} /></button>
    </div>
  ) : null

  const extras = (
    <>
      {confirm ? (
        <ConfirmDialog
          title={`Delete ${confirm.name}?`}
          confirmLabel="Delete dog"
          busyLabel="Deleting…"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        >
          {confirm.name}'s profile will be hidden from the website and the staff desk and moved to <b>Recently deleted</b>.
          You can restore it there for 7 days, then it is deleted for good.
        </ConfirmDialog>
      ) : null}
      {peek ? <DogPeek dogId={peek} onClose={() => setPeek(null)} /> : null}
    </>
  )

  if (kind === 'phone') {
    return (
      <>
        {banner}
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
              <div className="dog-row-actions">{actions(d)}</div>
            </div>
          )) : <p className="empty panel">No records.</p>}
        </div>
        {extras}
      </>
    )
  }

  return (
    <>
      {banner}
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
                <td><div className="inline">{actions(d)}</div></td>
              </tr>
            )) : <tr><td colSpan={7} className="empty">No records.</td></tr>}
          </tbody>
        </table>
      </div>
      {extras}
    </>
  )
}

function Flash({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flash ok" role="status">
      <CheckCircle2 size={16} />
      <span>{text}</span>
      <button className="flash-x" type="button" aria-label="Dismiss" onClick={onClose}><X size={16} /></button>
    </div>
  )
}

export function DogsPage() {
  const { confirm, dialog } = useConfirm()
  const [dogs, setDogs] = useState<Dog[]>([])
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [flash, setFlash] = useState<string>((location.state as { flash?: string } | null)?.flash || '')

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

  // Only dogs up for adoption; dogs that can't be adopted yet are on the Intake page.
  const rows = dogs.filter((d) => inCare(d) && isListed(d)).filter((d) => dogMatches(d, q))
  return (
    <div>
      <h1 className="page-h1">Pet Register</h1>
      <p className="page-sub">Dogs in care that are up for adoption. Dogs under treatment, fostered, or hidden are on the Intake page; adopted and mortality records have their own pages.</p>
      {flash ? <Flash text={flash} onClose={() => setFlash('')} /> : null}
      <div className="staff-toolbar">
        <input className="staff-search" placeholder="Search by name, age, color, or sex" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" type="button" onClick={() => navigate('/ops/dogs/new')}><Plus size={16} /> Add a dog</button>
      </div>
      <DogTable
        list={rows}
        openId={params.get('open')}
        onChanged={load}
        extra={(d) => (
          <>
            <button className="btn btn-ghost" type="button" onClick={() => confirm({
              title: `Mark ${d.name} as adopted?`,
              body: `${d.name} moves to the Adopted list and is no longer listed for adoption.`,
              confirmLabel: 'Mark adopted',
              action: () => mark(d.id, 'Adopted'),
            })}>Mark adopted</button>
            <button className="btn btn-ghost" type="button" onClick={() => confirm({
              title: `Mark ${d.name} as deceased?`,
              body: `${d.name} moves to Mortality records and is removed from the adoption list.`,
              confirmLabel: 'Mark deceased',
              danger: true,
              action: () => mark(d.id, 'Deceased'),
            })}>Mark deceased</button>
          </>
        )}
      />
      {dialog}
    </div>
  )
}

export function IntakePage() {
  const { confirm, dialog } = useConfirm()
  const navigate = useNavigate()
  const location = useLocation()
  const { kind } = useDevice()
  const [rows, setRows] = useState<Intake[]>([])
  const [loaded, setLoaded] = useState(false)
  // Registered dogs that also can't be adopted right now (e.g. fell sick later).
  const [other, setOther] = useState<Dog[]>([])
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState<string>((location.state as { flash?: string } | null)?.flash || '')

  async function load() {
    const [{ data }, { data: dogs }] = await Promise.all([
      supabase.from('intakes').select('*').is('moved_at', null).order('intake_at', { ascending: false }),
      supabase.from('dogs').select('*').order('name'),
    ])
    setRows((data as Intake[]) || [])
    setOther(((dogs as Dog[]) || []).filter((d) => inCare(d) && !isListed(d)))
    setLoaded(true)
  }
  useEffect(() => { load() }, [])

  async function finish(r: Intake, outcome: 'Available' | 'Deceased') {
    const { data, error } = await supabase.rpc('finish_intake', { p_id: r.id, p_outcome: outcome })
    if (error) return error.message
    if (outcome === 'Available') {
      navigate(`/ops/dogs?open=${data}`, {
        state: { flash: `${r.name} is now up for adoption. Edit the profile to add a story for adopters.` },
      })
    } else {
      setFlash(`${r.name} was moved to Mortality records.`)
      load()
    }
    return null
  }

  const since = (r: Intake) => {
    const n = calendarDaysSince(r.intake_at)
    return n === 0 ? 'Arrived today' : `${n} day${n === 1 ? '' : 's'}`
  }
  const n = q.trim().toLowerCase()
  const list = rows.filter((r) => !n || [r.name, r.reason, r.found_at, r.sex, r.age, r.color, r.breed].join(' ').toLowerCase().includes(n))

  const actions = (r: Intake) => (
    <>
      <Link className="btn btn-ghost" to={`/ops/intake/${r.id}`}>Edit</Link>
      <button className="btn btn-ghost" type="button" onClick={() => confirm({
        title: `Put ${r.name} up for adoption?`,
        body: `${r.name} moves from Intake to the Pet Register and appears on the public Adopt page.`,
        confirmLabel: 'Yes, ready for adoption',
        busyLabel: 'Moving…',
        action: () => finish(r, 'Available'),
      })}>Ready for adoption</button>
      <button className="btn btn-ghost" type="button" onClick={() => confirm({
        title: `Mark ${r.name} as deceased?`,
        body: `${r.name} moves from Intake to Mortality records.`,
        confirmLabel: 'Mark deceased',
        busyLabel: 'Moving…',
        danger: true,
        action: () => finish(r, 'Deceased'),
      })}>Mark deceased</button>
    </>
  )

  return (
    <div>
      <h1 className="page-h1">Intake</h1>
      <p className="page-sub">
        Dogs that just arrived and can't be adopted yet. Staff only: they are not on the website until they're marked ready for adoption.
      </p>
      {flash ? <Flash text={flash} onClose={() => setFlash('')} /> : null}
      <div className="staff-toolbar">
        <input className="staff-search" placeholder="Search by name, reason, or where found" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" type="button" onClick={() => navigate('/ops/dogs/new?kind=intake')}><Plus size={16} /> Add to Intake</button>
      </div>
      {!loaded ? <p className="empty">Loading…</p> : kind === 'phone' ? (
        <div className="dog-list">
          {list.length ? list.map((r) => (
            <div className="dog-row" key={r.id}>
              <Link className="dog-row-main" to={`/ops/intake/${r.id}`} aria-label={`Edit ${r.name}`}>
                <DogPhoto dog={r} className="dog-row-photo" />
                <div className="dog-row-info">
                  <div className="dog-row-top">
                    <b>{r.name}</b>
                    <span className="status pending">{r.reason}</span>
                  </div>
                  <div className="dog-row-meta">{r.sex} · {r.age} · {since(r)}</div>
                  {r.found_at ? <div className="dog-row-meta">Found: {r.found_at}</div> : null}
                </div>
              </Link>
              <div className="dog-row-actions">{actions(r)}</div>
            </div>
          )) : <p className="empty panel">{q ? 'No intake records match your search.' : 'No dogs in intake right now.'}</p>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Sex / Age</th><th>Reason</th><th>Found</th><th>In intake</th><th>Action</th></tr>
            </thead>
            <tbody>
              {list.length ? list.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b>{r.notes ? <div className="muted intake-note">{r.notes.length > 60 ? r.notes.slice(0, 60) + '…' : r.notes}</div> : null}</td>
                  <td>{r.sex} · {r.age}</td>
                  <td><span className="status pending">{r.reason}</span></td>
                  <td>{r.found_at || '—'}</td>
                  <td>{since(r)}</td>
                  <td><div className="inline">{actions(r)}</div></td>
                </tr>
              )) : <tr><td colSpan={6} className="empty">{q ? 'No intake records match your search.' : 'No dogs in intake right now.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {other.length ? (
        <>
          <h2 className="section-h2">Registered dogs not up for adoption</h2>
          <p className="page-sub">Dogs from the Pet Register that are under treatment, fostered, or hidden. Set them back to Available when they're ready.</p>
          <DogTable list={other} onChanged={load} extra={(d) => (
            <button className="btn btn-ghost" type="button" onClick={() => confirm({
              title: `Put ${d.name} up for adoption?`,
              body: `${d.name} becomes Available and appears on the public Adopt page.`,
              confirmLabel: 'Yes, ready for adoption',
              action: async () => {
                const { error } = await supabase.from('dogs').update({ status: 'Available', visible: true }).eq('id', d.id)
                if (error) return error.message
                load()
                return null
              },
            })}>Ready for adoption</button>
          )} />
        </>
      ) : null}
      {dialog}
    </div>
  )
}

export function AdoptedPage() {
  const { confirm, dialog } = useConfirm()
  const [dogs, setDogs] = useState<Dog[]>([])
  async function load() {
    const { data } = await supabase.from('dogs').select('*').eq('status', 'Adopted')
    setDogs((data as Dog[]) || [])
  }
  useEffect(() => { load() }, [])
  async function restore(id: string) {
    await supabase.from('dogs').update({ status: 'Available' }).eq('id', id)
    load()
  }
  return (
    <div>
      <h1 className="page-h1">Adopted</h1>
      <p className="page-sub">Dogs that have been adopted.</p>
      <DogTable list={dogs} onChanged={load} extra={(d) => <button className="btn btn-ghost" type="button" onClick={() => confirm({
        title: `Make ${d.name} available again?`,
        body: `${d.name} goes back to the Pet Register and the adoption list.`,
        confirmLabel: 'Make available',
        action: () => restore(d.id),
      })}>Back to available</button>} />
      {dialog}
    </div>
  )
}

export function MortalityPage() {
  const { confirm, dialog } = useConfirm()
  const [dogs, setDogs] = useState<Dog[]>([])
  async function load() {
    const { data } = await supabase.from('dogs').select('*').eq('status', 'Deceased')
    setDogs((data as Dog[]) || [])
  }
  useEffect(() => { load() }, [])
  async function restore(id: string) {
    await supabase.from('dogs').update({ status: 'Available', died_at: null }).eq('id', id)
    load()
  }
  return (
    <div>
      <h1 className="page-h1">Mortality</h1>
      <p className="page-sub">Deceased dogs are kept here and are not listed for adoption.</p>
      <DogTable list={dogs} onChanged={load} extra={(d) => <button className="btn btn-ghost" type="button" onClick={() => confirm({
        title: `Make ${d.name} available again?`,
        body: `${d.name} goes back to the Pet Register and the adoption list.`,
        confirmLabel: 'Make available',
        action: () => restore(d.id),
      })}>Back to available</button>} />
      {dialog}
    </div>
  )
}

type DeletedDog = Pick<Dog, 'id' | 'name' | 'oso_id' | 'sex' | 'age' | 'breed' | 'status' | 'photo_url'> & {
  deleted_at: string
  deleted_by_name: string
}

function daysLeft(deletedAt: string) {
  const ms = new Date(deletedAt).getTime() + 7 * 86400000 - Date.now()
  const d = Math.ceil(ms / 86400000)
  return d <= 0 ? 'Deleted for good tonight' : d === 1 ? '1 day left' : `${d} days left`
}

export function DeletedDogsPage() {
  const { confirm, dialog } = useConfirm()
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<DeletedDog[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [purge, setPurge] = useState<DeletedDog | null>(null)
  const [flash, setFlash] = useState('')

  async function load() {
    const { data } = await supabase.rpc('deleted_dogs')
    setRows((data as DeletedDog[]) || [])
    setLoaded(true)
  }
  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function restore(d: DeletedDog) {
    if (busy) return
    setBusy(d.id)
    const { error } = await supabase.rpc('restore_dog', { p_id: d.id })
    setBusy(null)
    if (error) { setFlash(error.message); return }
    setFlash(`${d.name} was restored.`)
    load()
  }

  async function purgeNow(d: DeletedDog) {
    const { error } = await supabase.rpc('purge_dog', { p_id: d.id })
    if (error) return error.message
    setPurge(null)
    setFlash(`${d.name} was deleted for good.`)
    load()
    return null
  }

  if (!isAdmin) return <p className="empty">Only administrators can see deleted dogs.</p>
  return (
    <div>
      <h1 className="page-h1">Recently deleted</h1>
      <p className="page-sub">Deleted dog profiles stay here for 7 days so you can restore them. After that they are deleted for good.</p>
      {flash ? <Flash text={flash} onClose={() => setFlash('')} /> : null}
      {loaded && !rows.length ? <p className="empty panel">Nothing here. Deleted dogs show up here for 7 days.</p> : null}
      <div className="dog-list">
        {rows.map((d) => (
          <div className="dog-row" key={d.id}>
            <div className="dog-row-main">
              <DogPhoto dog={d} className="dog-row-photo" />
              <div className="dog-row-info">
                <div className="dog-row-top">
                  <b>{d.name}</b>
                  <span className="status dead">{daysLeft(d.deleted_at)}</span>
                </div>
                <div className="dog-row-meta">{d.sex} · {d.age} · {d.breed} · {d.status}</div>
                <div className="dog-row-meta">Deleted {ago(d.deleted_at)}{d.deleted_by_name ? ` by ${d.deleted_by_name}` : ''}</div>
              </div>
            </div>
            <div className="dog-row-actions">
              <button className="btn btn-primary btn-sm" type="button" disabled={busy === d.id} onClick={() => confirm({
                title: `Restore ${d.name}?`,
                body: `${d.name}'s profile goes back to the staff desk and the website.`,
                confirmLabel: 'Restore',
                action: () => restore(d),
              })}>
                {busy === d.id ? <><Loader2 size={15} className="spin" /> Restoring…</> : <><RotateCcw size={15} /> Restore</>}
              </button>
              <button className="btn btn-remove" type="button" disabled={busy === d.id} onClick={() => setPurge(d)}>
                <Trash2 size={14} /> Delete now
              </button>
            </div>
          </div>
        ))}
      </div>
      {purge ? (
        <ConfirmDialog
          title={`Delete ${purge.name} for good?`}
          confirmLabel="Delete for good"
          busyLabel="Deleting…"
          danger
          onClose={() => setPurge(null)}
          onConfirm={() => purgeNow(purge)}
        >
          This can't be undone. {purge.name}'s profile and adoption applications will be removed permanently.
        </ConfirmDialog>
      ) : null}
      {dialog}
    </div>
  )
}

export function DogEditPage() {
  const { confirm, dialog } = useConfirm()
  const { id, intakeId } = useParams()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const isNew = !intakeId && (!id || id === 'new')
  // New dogs go either up for adoption (dogs table) or into intake (intakes table).
  const [kind, setKind] = useState<'adoption' | 'intake'>(intakeId || search.get('kind') === 'intake' ? 'intake' : 'adoption')
  const isIntake = kind === 'intake'
  const [intake, setIntake] = useState({
    reason: 'Under treatment' as IntakeReason,
    found_at: '',
    rescued_by: '',
    notes: '',
    intake_at: localDate(),
  })
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
  const { isAdmin } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  // What the form looked like when it opened, to tell if anything was typed.
  const [original, setOriginal] = useState(() => JSON.stringify(dog))
  const [originalIntake, setOriginalIntake] = useState(() => JSON.stringify(intake))
  const dirty = JSON.stringify(dog) !== original || JSON.stringify(intake) !== originalIntake || !!file || !!pupName.trim()
  const { leaveDialog, allowLeave } = useLeaveGuard(dirty, {
    what: isNew ? (isIntake ? 'this intake' : 'adding this dog') : isIntake ? 'editing this intake' : 'editing this dog',
  })

  useEffect(() => {
    if (!intakeId) return
    supabase.from('intakes').select('*').eq('id', intakeId).maybeSingle().then(({ data }) => {
      if (!data) return
      const r = data as Intake
      const d: Partial<Dog> = {
        name: r.name, sex: r.sex, age: r.age, breed: r.breed, color: r.color, size: r.size, photo_url: r.photo_url,
        vax_5in1: r.vax_5in1, anti_rabies: r.anti_rabies, dewormed: r.dewormed, spayed: r.spayed, temperament: r.temperament,
      }
      const i = { reason: r.reason, found_at: r.found_at, rescued_by: r.rescued_by, notes: r.notes, intake_at: localDate(new Date(r.intake_at)) }
      setDog(d); setOriginal(JSON.stringify(d))
      setIntake(i); setOriginalIntake(JSON.stringify(i))
    })
  }, [intakeId])

  useEffect(() => {
    if (isNew || intakeId) return
    supabase.from('dogs').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) { setDog(data as Dog); setOriginal(JSON.stringify(data)) }
    })
    supabase.from('dogs').select('*').eq('mother_id', id).then(({ data }) => setPups((data as Dog[]) || []))
  }, [id, isNew])

  async function save() {
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
    if (isIntake) {
      const record = {
        name: dog.name!.trim(),
        sex: dog.sex,
        age: dog.age,
        breed: dog.breed || 'Aspin',
        color: dog.color || '',
        size: dog.size || 'Medium',
        vax_5in1: !!dog.vax_5in1,
        anti_rabies: !!dog.anti_rabies,
        dewormed: !!dog.dewormed,
        spayed: !!dog.spayed,
        temperament: dog.temperament || '',
        photo_url,
        reason: intake.reason,
        found_at: intake.found_at.trim(),
        rescued_by: intake.rescued_by.trim(),
        notes: intake.notes.trim(),
        // Noon local time, so the date doesn't shift a day in other time zones.
        intake_at: new Date(`${intake.intake_at}T12:00:00`).toISOString(),
      }
      const { error: err } = intakeId
        ? await supabase.from('intakes').update(record).eq('id', intakeId)
        : await supabase.from('intakes').insert(record)
      if (err) { setError(err.message); return }
      allowLeave()
      navigate('/ops/intake', { state: { flash: intakeId ? `Changes to ${record.name} were saved.` : `${record.name} was added to Intake.` } })
      return
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
    // Dogs that can't be adopted yet live on the Intake page.
    const saved = { visible: true, ...dog, ...payload } as Dog
    const listPage = inCare(saved) && !isListed(saved) ? '/ops/intake' : '/ops/dogs'
    if (isNew) {
      const { data, error: err } = await supabase.from('dogs').insert(payload).select('id').single()
      if (err) { setError(err.message); return }
      allowLeave()
      navigate(`${listPage}?open=${data.id}`, { state: { flash: `${payload.name} was added to the ${listPage === '/ops/dogs' ? 'Pet Register' : 'Intake list'}.` } })
    } else {
      const { error: err } = await supabase.from('dogs').update(payload).eq('id', id)
      if (err) { setError(err.message); return }
      allowLeave()
      navigate(`${listPage}?open=${id}`, { state: { flash: `Changes to ${payload.name} were saved.` } })
    }
  }

  async function addPuppy() {
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
      <h1 className="page-h1">{isNew ? 'Add a dog' : intakeId ? `Edit intake: ${dog.name || 'dog'}` : `Edit ${dog.name || 'dog'}`}</h1>
      <form
        className="admin-form"
        aria-busy={saving}
        onSubmit={(e) => {
          e.preventDefault()
          if (!dog.name?.trim()) { setError('Name is required.'); return }
          const adding = isNew
          confirm({
            title: adding ? `Add ${dog.name.trim()} to ${isIntake ? 'Intake' : 'adoption'}?` : `Save changes to ${dog.name.trim()}?`,
            body: isIntake
              ? `${adding ? 'The dog will be added to the Intake list' : 'The intake record will be updated'}. It stays off the website until it's marked ready for adoption.`
              : adding ? 'The dog will be added to the Pet Register and shown on the Adopt page.' : 'The profile will be updated on the staff desk and the website.',
            confirmLabel: adding ? (isIntake ? 'Add to Intake' : 'Add dog') : 'Save changes',
            busyLabel: 'Saving…',
            action: save,
          })
        }}
      >
        <fieldset className="plain" disabled={saving}>
        {isNew ? (
          <div className="kind-choice" role="radiogroup" aria-label="Where does this dog go?">
            <label className={'kind-opt' + (!isIntake ? ' on' : '')}>
              <input type="radio" name="kind" checked={!isIntake} onChange={() => setKind('adoption')} />
              <span><b>For adoption</b><small>Healthy and ready. Shown on the public Adopt page.</small></span>
            </label>
            <label className={'kind-opt' + (isIntake ? ' on' : '')}>
              <input type="radio" name="kind" checked={isIntake} onChange={() => setKind('intake')} />
              <span><b>Intake</b><small>Just arrived, injured, sick or in quarantine. Staff only, not for adoption yet.</small></span>
            </label>
          </div>
        ) : null}
        {dog.photo_url ? <img src={dog.photo_url} alt="" style={{ width: 160, aspectRatio: '1', objectFit: 'cover', borderRadius: 12 }} /> : null}
        <label>Photo</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="form-grid">
          <div><label>Name *</label><input value={dog.name || ''} onChange={(e) => setDog({ ...dog, name: e.target.value })} /></div>
          {isIntake ? (
            <div>
              <label>Reason for intake</label>
              <select value={intake.reason} onChange={(e) => setIntake({ ...intake, reason: e.target.value as IntakeReason })}>
                {INTAKE_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          ) : isNew ? null : (
          <div>
            <label>Status</label>
            {locked ? <p className="muted">{dog.status}</p> : (
              <select value={dog.status} onChange={(e) => setDog({ ...dog, status: e.target.value as DogStatus })}>
                {ADD_STATUSES.concat(dog.status && !ADD_STATUSES.includes(dog.status as DogStatus) ? [dog.status as DogStatus] : []).map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </div>
          )}
          <div><label>Sex</label><select value={dog.sex} onChange={(e) => setDog({ ...dog, sex: e.target.value as Dog['sex'] })}>{SEXES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Age</label><select value={dog.age} onChange={(e) => setDog({ ...dog, age: e.target.value as Dog['age'] })}>{AGES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Breed</label><input value={dog.breed || ''} onChange={(e) => setDog({ ...dog, breed: e.target.value })} /></div>
          <div><label>Color</label><input value={dog.color || ''} onChange={(e) => setDog({ ...dog, color: e.target.value })} /></div>
          <div><label>Size</label><select value={dog.size} onChange={(e) => setDog({ ...dog, size: e.target.value as Dog['size'] })}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Temperament</label><input value={dog.temperament || ''} onChange={(e) => setDog({ ...dog, temperament: e.target.value })} /></div>
          {isIntake ? (
            <>
              <div><label>Date of intake</label><input type="date" value={intake.intake_at} max={localDate()} onChange={(e) => setIntake({ ...intake, intake_at: e.target.value })} /></div>
              <div><label>Where it was found</label><input placeholder="e.g. Brgy. Cogon market" value={intake.found_at} onChange={(e) => setIntake({ ...intake, found_at: e.target.value })} /></div>
              <div><label>Rescued / brought in by</label><input value={intake.rescued_by} onChange={(e) => setIntake({ ...intake, rescued_by: e.target.value })} /></div>
              <div className="full"><label>Condition and treatment notes (staff only)</label><textarea rows={4} value={intake.notes} onChange={(e) => setIntake({ ...intake, notes: e.target.value })} /></div>
            </>
          ) : (
            <div className="full"><label>Story</label><textarea rows={4} value={dog.story || ''} onChange={(e) => setDog({ ...dog, story: e.target.value })} /></div>
          )}
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
          {saving ? <><Loader2 size={17} className="spin" /> {file ? 'Uploading photo and saving…' : 'Saving…'}</> : isNew ? (isIntake ? 'Add to Intake' : 'Add dog') : 'Save changes'}
        </button>
      </form>
      {intakeId && isAdmin ? (
        <div className="danger-zone">
          <div>
            <b>Delete this intake record</b>
            <p className="muted">Use this only for a record added by mistake. It is deleted for good.</p>
          </div>
          <button className="btn btn-remove" type="button" disabled={saving} onClick={() => confirm({
            title: `Delete ${dog.name || 'this intake record'}?`,
            body: `${dog.name}'s intake record will be permanently deleted. This can't be undone.`,
            confirmLabel: 'Delete for good',
            busyLabel: 'Deleting…',
            danger: true,
            action: async () => {
              const { error: err } = await supabase.from('intakes').delete().eq('id', intakeId)
              if (err) return err.message
              allowLeave()
              navigate('/ops/intake', { state: { flash: `${dog.name}'s intake record was deleted.` } })
              return null
            },
          })}><Trash2 size={15} /> Delete record</button>
        </div>
      ) : null}
      {!isNew && !intakeId && isAdmin ? (
        <div className="danger-zone">
          <div>
            <b>Delete this dog</b>
            <p className="muted">Moves the profile to Recently deleted. You can restore it for 7 days.</p>
          </div>
          <button className="btn btn-remove" type="button" disabled={saving} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete dog</button>
        </div>
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${dog.name || 'this dog'}?`}
          confirmLabel="Delete dog"
          busyLabel="Deleting…"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            const { error: err } = await supabase.rpc('delete_dog', { p_id: id })
            if (err) return err.message
            allowLeave()
            navigate('/ops/dogs', { state: { flash: `${dog.name} moved to Recently deleted. Restore it there within 7 days if this was a mistake.` } })
            return null
          }}
        >
          {dog.name}'s profile will be hidden from the website and the staff desk and moved to <b>Recently deleted</b>.
          You can restore it there for 7 days, then it is deleted for good.
        </ConfirmDialog>
      ) : null}
      {!isNew && !intakeId && femaleAdult ? (
        <div className="panel" style={{ marginTop: 16, maxWidth: 720 }}>
          <h3>Her puppies</h3>
          {pups.map((p) => <p key={p.id}><Link to={`/ops/dogs/${p.id}`}>{p.name}</Link> · {p.status}</p>)}
          <form
            className="row wrap"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!pupName.trim()) return
              confirm({
                title: `Add puppy ${pupName.trim()}?`,
                body: `${pupName.trim()} will be added as ${dog.name}'s puppy.`,
                confirmLabel: 'Add puppy',
                action: addPuppy,
              })
            }}
          >
            <input placeholder="Puppy name" value={pupName} onChange={(e) => setPupName(e.target.value)} disabled={addingPup} />
            <button className="btn btn-primary" type="submit" disabled={addingPup}>{addingPup ? <><Loader2 size={16} className="spin" /> Adding…</> : 'Add puppy'}</button>
          </form>
        </div>
      ) : null}
      {dialog}
      {leaveDialog}
    </div>
  )
}

export function AdoptionsPage() {
  const { confirm, dialog } = useConfirm()
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
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => confirm({
                      title: `Approve ${a.applicant}'s application?`,
                      body: `${a.dogs?.name || 'The dog'} will be marked as adopted, and any other pending requests for this dog will be closed.`,
                      confirmLabel: 'Approve',
                      action: () => decide(a.id, 'approve'),
                    })}>Approve</button>
                    <button className="btn btn-remove" type="button" onClick={() => confirm({
                      title: `Reject ${a.applicant}'s application?`,
                      body: `The application for ${a.dogs?.name || 'this dog'} will be marked as rejected.`,
                      confirmLabel: 'Reject',
                      danger: true,
                      action: () => decide(a.id, 'reject'),
                    })}>Reject</button>
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
                        <button className="btn btn-coral" type="button" onClick={() => confirm({
                      title: `Approve ${a.applicant}'s application?`,
                      body: `${a.dogs?.name || 'The dog'} will be marked as adopted, and any other pending requests for this dog will be closed.`,
                      confirmLabel: 'Approve',
                      action: () => decide(a.id, 'approve'),
                    })}>Approve</button>
                        <button className="btn btn-ghost" type="button" onClick={() => confirm({
                      title: `Reject ${a.applicant}'s application?`,
                      body: `The application for ${a.dogs?.name || 'this dog'} will be marked as rejected.`,
                      confirmLabel: 'Reject',
                      danger: true,
                      action: () => decide(a.id, 'reject'),
                    })}>Reject</button>
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
      {dialog}
    </div>
  )
}

type DonationEdit = { amount: number; method: string; reference: string; name: string; email: string; purpose: string }

const DONATION_METHODS = ['GCash', 'GoTyme', 'Bank Transfer', 'Cash / Walk-in', 'In-kind Donation']
const DONATION_PURPOSES = ['General Fund', 'Dog Food & Supplies', 'Veterinary Care', 'Spay & Neuter Program', 'Shelter Upkeep']

function EditDonation({ d, onClose, onSave }: { d: Donation; onClose: () => void; onSave: (next: DonationEdit) => void }) {
  const [amount, setAmount] = useState(String(Math.round(Number(d.amount))))
  const [method, setMethod] = useState<string>(d.method)
  const [reference, setReference] = useState(d.reference_no || '')
  const [name, setName] = useState(d.anonymous || d.name === 'Anonymous' ? '' : d.name)
  const [email, setEmail] = useState(d.email || '')
  const [purpose, setPurpose] = useState(d.purpose)
  const [error, setError] = useState('')

  return (
    <Modal onClose={onClose}>
      <div className="create-head"><b>Edit donation</b><button className="chat-x" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <form
        className="adopt-card-body"
        onSubmit={(e) => {
          e.preventDefault()
          if (!/^[1-9]\d{0,5}$/.test(amount)) { setError('Amount must be a whole number from 1 to 999,999.'); return }
          setError('')
          onSave({ amount: Number(amount), method, reference: reference.trim(), name: name.trim(), email: email.trim(), purpose })
        }}
      >
        <p className="muted">Fix a mistake in what the donor entered. Changes are recorded in the activity log.</p>
        <label htmlFor="e-amount">Amount *</label>
        <div className="peso-input">
          <span aria-hidden="true">₱</span>
          <input id="e-amount" inputMode="numeric" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6))} />
        </div>
        <div className="form-grid">
          <div>
            <label htmlFor="e-method">Paid with</label>
            <select id="e-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {DONATION_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="e-ref">Reference no.</label>
            <input id="e-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <label htmlFor="e-name">Donor name <span className="muted">(blank = Anonymous)</span></label>
            <input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="e-email">Email</label>
            <input id="e-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="full">
            <label htmlFor="e-purpose">Purpose</label>
            <select id="e-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {DONATION_PURPOSES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        {error ? <p className="err">{error}</p> : null}
        <div className="dialog-actions">
          <button className="btn btn-light" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit">Save changes</button>
        </div>
      </form>
    </Modal>
  )
}

export function DonationsPage() {
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<Donation[]>([])
  const { isAdmin } = useAuth()
  const [editing, setEditing] = useState<Donation | null>(null)
  const [reject, setReject] = useState<Donation | null>(null)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [flash, setFlash] = useState('')
  const { kind } = useDevice()

  async function load() {
    const { data } = await supabase.from('donations').select('*').order('created_at', { ascending: false })
    setRows((data as Donation[]) || [])
  }
  useEffect(() => { load() }, [])

  async function decide(d: Donation, confirm: boolean) {
    const { error } = await supabase.rpc('decide_donation', { p_id: d.id, p_confirm: confirm })
    if (error) return error.message
    setFlash(confirm ? `${peso(Number(d.amount))} from ${d.name} confirmed.` : `${peso(Number(d.amount))} from ${d.name} rejected.`)
    load()
    return null
  }

  async function openReceipt(d: Donation) {
    const { data } = await supabase.storage.from('donation-receipts').createSignedUrl(d.receipt_path, 120)
    setReceiptUrl(data?.signedUrl || '')
  }

  const pending = rows.filter((d) => d.status === 'pending')
  const confirmed = rows.filter((d) => d.status === 'confirmed')
  const rejected = rows.filter((d) => d.status === 'rejected')
  const total = confirmed.reduce((s, d) => s + Number(d.amount), 0)
  const waiting = pending.reduce((s, d) => s + Number(d.amount), 0)

  const card = (d: Donation, actions: boolean) => (
    <div className="dog-row" key={d.id}>
      <div className="dog-row-main">
        <span className="person-avatar"><HandCoins size={18} /></span>
        <div className="dog-row-info">
          <div className="dog-row-top">
            <b>{d.name}</b>
            <span className="amount">{peso(Number(d.amount))}</span>
          </div>
          <div className="dog-row-meta">{d.method}{d.reference_no ? ` · Ref ${d.reference_no}` : ''} · {d.purpose}</div>
          <div className="dog-row-meta">{ago(d.created_at)}{d.email ? ` · ${d.email}` : ''}</div>
          {d.message ? <div className="dog-row-note">{d.message}</div> : null}
        </div>
      </div>
      {actions || d.receipt_path || isAdmin ? (
        <div className="dog-row-actions">
          {d.receipt_path ? <button className="btn btn-ghost" type="button" onClick={() => openReceipt(d)}><ImageIcon size={14} /> Receipt</button> : null}
          {actions ? (
            <>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => confirm({
                title: `Confirm ${peso(Number(d.amount))} from ${d.name}?`,
                body: <>Only confirm if you found this payment{d.reference_no ? <> with reference <b>{d.reference_no}</b></> : null} in {d.method}. It will be added to the totals{d.email ? ' and the donor will get a thank-you email' : ''}.</>,
                confirmLabel: 'Confirm donation',
                action: () => decide(d, true),
              })}>
                <Check size={15} /> Confirm
              </button>
              <button className="btn btn-remove" type="button" onClick={() => setReject(d)}><X size={14} /> Reject</button>
            </>
          ) : null}
          {isAdmin ? <button className="btn btn-ghost" type="button" onClick={() => setEditing(d)}><Pencil size={14} /> Edit</button> : null}
        </div>
      ) : null}
    </div>
  )

  const table = (list: Donation[], empty: string) => kind === 'phone' ? (
    <div className="dog-list">{list.length ? list.map((d) => card(d, false)) : <p className="empty panel">{empty}</p>}</div>
  ) : (
    <div className="table-wrap">
      <table>
        <thead><tr><th>From</th><th>Amount</th><th>Method</th><th>Reference</th><th>Purpose</th><th>When</th><th></th></tr></thead>
        <tbody>
          {list.length ? list.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td><td>{peso(Number(d.amount))}</td><td>{d.method}</td><td>{d.reference_no || '—'}</td><td>{d.purpose}</td><td>{ago(d.created_at)}</td>
              <td>
                <div className="inline">
                  {d.receipt_path ? <button className="btn btn-ghost" type="button" onClick={() => openReceipt(d)}><ImageIcon size={14} /> Receipt</button> : null}
                  {isAdmin ? <button className="btn btn-ghost" type="button" onClick={() => setEditing(d)}><Pencil size={14} /> Edit</button> : null}
                </div>
              </td>
            </tr>
          )) : <tr><td colSpan={7} className="empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      <h1 className="page-h1">Donations</h1>
      <p className="page-sub">Check each donation against GCash or the bank before confirming. Only confirmed donations count in the total.</p>
      {flash ? <Flash text={flash} onClose={() => setFlash('')} /> : null}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <Kpi icon={<HandCoins size={18} />} n={peso(total)} l="Confirmed donations" />
        <Kpi icon={<ClipboardList size={18} />} n={`${pending.length} · ${peso(waiting)}`} l="Waiting to confirm" tone="warn" />
      </div>

      <h2 className="table-h">Waiting to confirm {pending.length ? <span className="nav-badge">{pending.length}</span> : null}</h2>
      <div className="dog-list">
        {pending.length ? pending.map((d) => card(d, true)) : <p className="empty panel">Nothing to confirm right now.</p>}
      </div>

      <h2 className="table-h">Confirmed</h2>
      {table(confirmed, 'No confirmed donations yet.')}

      {rejected.length ? (
        <>
          <h2 className="table-h">Rejected</h2>
          {table(rejected, '')}
        </>
      ) : null}

      {reject ? (
        <ConfirmDialog
          title="Reject this donation?"
          confirmLabel="Reject donation"
          busyLabel="Rejecting…"
          danger
          onClose={() => setReject(null)}
          onConfirm={async () => {
            const err = await decide(reject, false)
            if (!err) setReject(null)
            return err
          }}
        >
          Only reject it if you can't find {peso(Number(reject.amount))}{reject.reference_no ? ` with reference ${reject.reference_no}` : ''} in GCash or the bank.
          It won't be counted in the totals.
        </ConfirmDialog>
      ) : null}
      {receiptUrl ? (
        <Modal onClose={() => setReceiptUrl('')}>
          <div className="create-head"><b>Receipt</b><button className="chat-x" type="button" onClick={() => setReceiptUrl('')} aria-label="Close"><X size={18} /></button></div>
          <div className="adopt-card-body"><img src={receiptUrl} alt="Donation receipt" style={{ width: '100%', borderRadius: 10 }} /></div>
        </Modal>
      ) : null}
      {editing ? (
        <EditDonation
          d={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => confirm({
            title: 'Save changes to this donation?',
            body: <>The donation will be updated to <b>{peso(next.amount)}</b> from <b>{next.name || 'Anonymous'}</b>{next.reference ? <> (ref {next.reference})</> : null}. This is recorded in the activity log.</>,
            confirmLabel: 'Save changes',
            busyLabel: 'Saving…',
            action: async () => {
              const { error } = await supabase.rpc('update_donation', {
                p_id: editing.id,
                p_amount: next.amount,
                p_method: next.method,
                p_reference: next.reference,
                p_name: next.name,
                p_email: next.email,
                p_purpose: next.purpose,
              })
              if (error) return error.message
              setEditing(null)
              setFlash('Donation updated.')
              load()
              return null
            },
          })}
        />
      ) : null}
      {dialog}
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
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const busy = useRef(false)

  async function send() {
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
        <form
          className="msg-compose"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            confirm({
              title: `Send this reply to ${m.name}?`,
              body: `It will be emailed to ${m.email} from the PawTrack email.`,
              confirmLabel: 'Send reply',
              busyLabel: 'Sending…',
              action: send,
            })
          }}
        >
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
      {dialog}
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
  const { confirm, dialog } = useConfirm()
  const { isAdmin, profile } = useAuth()
  const [team, setTeam] = useState<Profile[]>([])
  const [apps, setApps] = useState<Profile[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<Profile | null>(null)
  const [flash, setFlash] = useState('')

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
      {flash ? <Flash text={flash} onClose={() => setFlash('')} /> : null}

      <h2 className="table-h">Pending applications {apps.length ? <span className="nav-badge">{apps.length}</span> : null}</h2>
      {apps.length ? apps.map((u) => (
        <div className="panel person" key={u.id}>
          <span className="person-avatar">{u.display_name.slice(0, 1).toUpperCase()}</span>
          <div className="person-info">
            <b>{u.display_name}</b>
            <div className="muted">@{u.username} · {u.email} · applied {ago(u.created_at)}</div>
          </div>
          <div className="inline">
            <button className="btn btn-primary btn-sm" type="button" disabled={busy === u.id} onClick={() => confirm({
              title: `Approve ${u.display_name}?`,
              body: `${u.display_name} (${u.email}) will be able to sign in to the staff desk.`,
              confirmLabel: 'Approve',
              action: () => decide(u.id, true),
            })}>
              <UserCheck size={15} /> Approve
            </button>
            <button className="btn btn-remove btn-sm" type="button" disabled={busy === u.id} onClick={() => confirm({
              title: `Reject ${u.display_name}?`,
              body: `${u.display_name} won't be able to use the staff desk.`,
              confirmLabel: 'Reject',
              danger: true,
              action: () => decide(u.id, false),
            })}>
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
          {u.role !== 'admin' && u.id !== profile?.id ? (
            <button className="btn btn-remove" type="button" onClick={() => setRemoving(u)} aria-label={`Delete ${u.display_name}`}>
              <Trash2 size={14} /> Delete
            </button>
          ) : null}
        </div>
      ))}
      {removing ? (
        <ConfirmDialog
          title={`Delete ${removing.display_name}'s account?`}
          confirmLabel="Delete account"
          busyLabel="Deleting…"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const { error: err } = await supabase.rpc('delete_staff_account', { p_id: removing.id })
            if (err) return err.message
            setFlash(`${removing.display_name}'s account was deleted.`)
            setRemoving(null)
            load()
            return null
          }}
        >
          <b>{removing.display_name}</b> ({removing.email}) will be signed out and can no longer use the staff desk.
          This can't be undone. They would have to apply again to come back.
        </ConfirmDialog>
      ) : null}
      {dialog}
    </div>
  )
}
