import type { ReactNode } from 'react'

export function Modal({
  children,
  onClose,
  wide,
}: {
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="modal" onClick={onClose} role="presentation">
      <div className={wide ? 'dog-peek' : 'adopt-card'} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
