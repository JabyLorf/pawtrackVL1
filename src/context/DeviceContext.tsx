import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type DeviceKind = 'phone' | 'tablet' | 'desktop'

export type DeviceState = {
  kind: DeviceKind
  label: string
  width: number
  compact: boolean
}

function readDevice(): DeviceState {
  const width = typeof window === 'undefined' ? 1200 : window.innerWidth
  const kind: DeviceKind = width < 768 ? 'phone' : width < 1200 ? 'tablet' : 'desktop'
  const label = kind === 'phone' ? 'Phone' : kind === 'tablet' ? 'Tablet' : 'Desktop'
  return { kind, label, compact: width < 1200, width }
}

function applyDevice(next: DeviceState) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.device = next.kind
  root.classList.toggle('is-compact', next.compact)
  root.classList.toggle('is-phone', next.kind === 'phone')
  root.classList.toggle('is-tablet', next.kind === 'tablet')
  root.classList.toggle('is-desktop', next.kind === 'desktop')
}

const DeviceContext = createContext<DeviceState>(readDevice())

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<DeviceState>(() => {
    const next = readDevice()
    applyDevice(next)
    return next
  })

  useEffect(() => {
    function onResize() {
      const next = readDevice()
      applyDevice(next)
      setDevice(next)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>
}

export function useDevice() {
  return useContext(DeviceContext)
}
