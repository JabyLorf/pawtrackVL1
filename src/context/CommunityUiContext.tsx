import { createContext, useContext } from 'react'

export type CommunityUi = {
  unread: number
  refreshUnread: () => void
  openCreate: () => void
  bump: number
}

export const CommunityUiContext = createContext<CommunityUi | null>(null)

export function useCommunityUi() {
  const ctx = useContext(CommunityUiContext)
  if (!ctx) throw new Error('useCommunityUi must be used inside CommunityLayout')
  return ctx
}
