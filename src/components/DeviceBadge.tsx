import { useDevice } from '../context/DeviceContext'

export function DeviceBadge({ hide }: { hide?: boolean }) {
  const device = useDevice()
  if (hide) return null
  return (
    <div className="device-badge" aria-live="polite">
      {device.label} · {device.width}px
    </div>
  )
}
