import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'

const VIEW = 280 // on-screen size of the square frame, in px
const OUT = 512 // saved photo size, in px

/**
 * Crop a photo to a 1:1 square: drag to move, slider (or pinch / wheel) to zoom.
 * Calls onDone with a 512×512 JPEG.
 */
export function SquareCropper({ file, onCancel, onDone }: {
  file: File
  onCancel: () => void
  onDone: (cropped: File) => void
}) {
  const [url, setUrl] = useState('')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  // Create and free the photo's temporary address in the same effect.
  useEffect(() => {
    const u = URL.createObjectURL(file)
    let alive = true
    const el = new Image()
    el.onload = () => {
      if (!alive) return
      setUrl(u)
      setImg(el)
      setZoom(1)
      // Start centred.
      const base = VIEW / Math.min(el.naturalWidth, el.naturalHeight)
      setPos({ x: (VIEW - el.naturalWidth * base) / 2, y: (VIEW - el.naturalHeight * base) / 2 })
    }
    el.onerror = () => { if (alive) setError("This photo can't be opened. Please choose another one.") }
    el.src = u
    return () => { alive = false; URL.revokeObjectURL(u) }
  }, [file])

  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1
  const w = img ? img.naturalWidth * base * zoom : VIEW
  const h = img ? img.naturalHeight * base * zoom : VIEW

  // Keep the photo covering the whole square.
  const clamp = (x: number, y: number, ww = w, hh = h) => ({
    x: Math.min(0, Math.max(VIEW - ww, x)),
    y: Math.min(0, Math.max(VIEW - hh, y)),
  })

  function setZoomAround(next: number) {
    if (!img) return
    const z = Math.min(4, Math.max(1, next))
    const nw = img.naturalWidth * base * z
    const nh = img.naturalHeight * base * z
    // Zoom around the centre of the frame.
    const cx = (VIEW / 2 - pos.x) / w
    const cy = (VIEW / 2 - pos.y) / h
    setZoom(z)
    setPos(clamp(VIEW / 2 - cx * nw, VIEW / 2 - cy * nh, nw, nh))
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      drag.current = null
    } else {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    }
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      setZoomAround(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist))
      return
    }
    const d = drag.current
    if (d && d.id === e.pointerId) setPos(clamp(d.px + e.clientX - d.x, d.py + e.clientY - d.y))
  }

  function up(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  async function save() {
    if (!img) return
    setBusy(true)
    const scale = base * zoom
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
    setBusy(false)
    if (!blob) { setError("The photo couldn't be cropped. Please try another one."); return }
    onDone(new File([blob], 'profile.jpg', { type: 'image/jpeg' }))
  }

  return (
    <div className="cropper">
      <h2>Crop your photo</h2>
      <p className="auth-sub">Drag to move it. Zoom with the slider{'ontouchstart' in window ? ' or pinch' : ''}.</p>
      {error ? <p className="err">{error}</p> : (
        <div
          className="crop-frame"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => setZoomAround(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        >
          {img ? (
            <img src={url} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
          ) : <Loader2 size={22} className="spin" />}
          <span className="crop-ring" aria-hidden="true" />
        </div>
      )}
      <div className="crop-zoom">
        <ZoomOut size={16} />
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomAround(Number(e.target.value))} aria-label="Zoom" disabled={!img} />
        <ZoomIn size={16} />
      </div>
      <div className="dialog-actions">
        <button className="btn btn-light" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" type="button" onClick={save} disabled={!img || busy}>
          {busy ? <><Loader2 size={16} className="spin" /> Cropping…</> : 'Use photo'}
        </button>
      </div>
    </div>
  )
}
